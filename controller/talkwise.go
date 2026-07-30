package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	defaultTalkWiseClientID             = "talkwise"
	talkWiseHandoffTTL                  = 5 * time.Minute
	talkWiseTrainingUpstreamEnv         = "TALKWISE_TRAINING_UPSTREAM_URL"
	talkWiseTrainingUpstreamPath        = "/api/v1/training-studio"
	talkWiseTrainingProxyUnavailable    = "TALKWISE_TRAINING_PROXY_UNAVAILABLE"
	talkWiseTrainingUpstreamUnavailable = "TALKWISE_TRAINING_UPSTREAM_UNAVAILABLE"
	talkWiseConversationUpstreamPath        = "/api/v1/stakeholder"
	talkWiseConversationProxyUnavailable    = "TALKWISE_CONVERSATION_PROXY_UNAVAILABLE"
	talkWiseConversationUpstreamUnavailable = "TALKWISE_CONVERSATION_UPSTREAM_UNAVAILABLE"
)

var errTalkWiseRedirectMismatch = errors.New("talkwise redirect_uri mismatch")

var talkWiseIdentityHeaders = []string{
	"X-Mock-User",
	"X-User-Id",
	"X-User-Role",
	"X-System-Role",
	"X-Role",
	"X-Team-Id",
	"X-Auth-User",
	"X-Authenticated-User",
	"X-Forwarded-User",
	"X-Remote-User",
	"Remote-User",
}

var talkWiseMockAuthQueryKeys = []string{
	"mock_user",
	"auth_user_id",
	"auth_role",
	"auth_team_id",
}

type TalkWiseAuthHandoffRequest struct {
	ClientId    string `json:"client_id"`
	RedirectURI string `json:"redirect_uri"`
	ReturnTo    string `json:"return_to"`
	State       string `json:"state"`
}

type TalkWiseAuthExchangeRequest struct {
	Code         string `json:"code"`
	ClientId     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RedirectURI  string `json:"redirect_uri"`
}

type TalkWiseTeamMembersRequest struct {
	ClientId     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Group        string `json:"group"`
	Limit        int    `json:"limit"`
}

type TalkWiseTeamUserSearchRequest struct {
	ClientId     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Keyword      string `json:"keyword"`
	Group        string `json:"group"`
	Limit        int    `json:"limit"`
}

type TalkWiseTeamMemberAssignRequest struct {
	ClientId     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	UserId       int    `json:"user_id"`
	Group        string `json:"group"`
}

type talkWiseAuthFlowPayload struct {
	RedirectURI string `json:"redirect_uri,omitempty"`
	ReturnTo    string `json:"return_to,omitempty"`
	State       string `json:"state,omitempty"`
}

func CreateTalkWiseAuthHandoff(c *gin.Context) {
	var req TalkWiseAuthHandoffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid TalkWise handoff request")
		return
	}

	clientID, err := validateTalkWiseClient(req.ClientId, "", false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	redirectURI := strings.TrimSpace(req.RedirectURI)
	if err := validateTalkWiseRedirectURI(redirectURI); err != nil {
		common.ApiError(c, err)
		return
	}
	returnTo := strings.TrimSpace(req.ReturnTo)
	if returnTo == "" {
		returnTo = redirectURI
	}
	if err := validateTalkWiseRedirectURI(returnTo); err != nil {
		common.ApiError(c, err)
		return
	}

	payloadBytes, err := common.Marshal(talkWiseAuthFlowPayload{
		RedirectURI: redirectURI,
		ReturnTo:    returnTo,
		State:       strings.TrimSpace(req.State),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	code, flow, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeTalkWiseHandoff,
		Provider:  clientID,
		Intent:    model.AuthFlowIntentLogin,
		UserId:    c.GetInt("id"),
		SessionId: c.GetString("session_id"),
		Payload:   string(payloadBytes),
		ExpiresAt: time.Now().Add(talkWiseHandoffTTL),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	redirectURL, err := buildTalkWiseRedirectURL(returnTo, code, strings.TrimSpace(req.State))
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"code":         code,
		"redirect_url": redirectURL,
		"redirect_uri": redirectURI,
		"return_to":    returnTo,
		"expires_at":   flow.ExpiresAt.Unix(),
	})
}

func ExchangeTalkWiseAuthCode(c *gin.Context) {
	var req TalkWiseAuthExchangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid TalkWise authorization code request")
		return
	}

	clientID, err := validateTalkWiseClient(req.ClientId, req.ClientSecret, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	code := strings.TrimSpace(req.Code)
	redirectURI := strings.TrimSpace(req.RedirectURI)
	var payload talkWiseAuthFlowPayload
	flow, err := model.ConsumeAuthFlowWithAction(code, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeTalkWiseHandoff,
		Provider: clientID,
		Intent:   model.AuthFlowIntentLogin,
	}, func(_ *gorm.DB, flow *model.AuthFlow) error {
		if flow.UserId <= 0 {
			return model.ErrAuthFlowInvalid
		}
		if flow.Payload != "" {
			if err := common.UnmarshalJsonStr(flow.Payload, &payload); err != nil {
				return err
			}
		}
		if payload.RedirectURI != "" {
			if redirectURI == "" {
				return errTalkWiseRedirectMismatch
			}
			if redirectURI != payload.RedirectURI {
				return errTalkWiseRedirectMismatch
			}
		}
		return nil
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	user, err := model.GetUserById(flow.UserId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorMsg(c, "TalkWise user is disabled")
		return
	}

	common.ApiSuccess(c, buildTalkWiseIdentityData(c, user))
}

func ListTalkWiseTeamMembers(c *gin.Context) {
	var req TalkWiseTeamMembersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid TalkWise team members request")
		return
	}
	if _, err := validateTalkWiseClient(req.ClientId, req.ClientSecret, true); err != nil {
		common.ApiError(c, err)
		return
	}

	group, err := normalizeTalkWiseGroup(req.Group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	limit := normalizeTalkWiseLimit(req.Limit, 100, 200)
	query := model.DB.Model(&model.User{}).
		Where(&model.User{Group: group}).
		Where("status = ?", common.UserStatusEnabled)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	var users []*model.User
	if err := query.Omit("password", "access_token").Order("username ASC").Limit(limit).Find(&users).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	members := make([]gin.H, 0, len(users))
	for _, user := range users {
		members = append(members, buildTalkWiseTeamUserData(user, group))
	}
	common.ApiSuccess(c, gin.H{
		"team":    buildTalkWiseTeamData(group),
		"members": members,
		"total":   total,
	})
}

func SearchTalkWiseTeamUsers(c *gin.Context) {
	var req TalkWiseTeamUserSearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid TalkWise team user search request")
		return
	}
	if _, err := validateTalkWiseClient(req.ClientId, req.ClientSecret, true); err != nil {
		common.ApiError(c, err)
		return
	}

	group, err := normalizeTalkWiseGroup(req.Group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	keyword := strings.TrimSpace(req.Keyword)
	if keyword == "" {
		common.ApiErrorMsg(c, "TalkWise user search keyword is required")
		return
	}

	status := common.UserStatusEnabled
	limit := normalizeTalkWiseLimit(req.Limit, 20, 50)
	users, total, err := model.SearchUsers(
		keyword,
		"",
		nil,
		&status,
		0,
		limit,
		model.NewUserSortOptions("username", "asc"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	results := make([]gin.H, 0, len(users))
	for _, user := range users {
		results = append(results, buildTalkWiseTeamUserData(user, group))
	}
	common.ApiSuccess(c, gin.H{
		"team":  buildTalkWiseTeamData(group),
		"users": results,
		"total": total,
	})
}

func AssignTalkWiseTeamMember(c *gin.Context) {
	var req TalkWiseTeamMemberAssignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid TalkWise team member assignment request")
		return
	}
	if _, err := validateTalkWiseClient(req.ClientId, req.ClientSecret, true); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.UserId <= 0 {
		common.ApiErrorMsg(c, "TalkWise user_id is required")
		return
	}
	group, err := normalizeTalkWiseGroup(req.Group)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	user, err := model.GetUserById(req.UserId, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorMsg(c, "TalkWise user is disabled")
		return
	}

	user.Group = group
	if err := user.Edit(false); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"team":   buildTalkWiseTeamData(group),
		"member": buildTalkWiseTeamUserData(user, group),
	})
}

// ProxyTalkWiseTraining keeps the browser on the NewAPI origin while routing
// authenticated training requests to the operator-configured TalkWise backend.
func ProxyTalkWiseTraining(c *gin.Context) {
	upstream, err := configuredTalkWiseTrainingUpstream()
	if err != nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"code":    talkWiseTrainingProxyUnavailable,
			"message": "TalkWise training proxy is not configured",
		})
		return
	}

	suffix, err := normalizeTalkWiseTrainingSuffix(c.Param("path"))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
			"success": false,
			"code":    "TALKWISE_TRAINING_PATH_INVALID",
			"message": "Invalid TalkWise training path",
		})
		return
	}

	proxy := newTalkWiseTrainingReverseProxy(upstream, suffix)
	proxy.ServeHTTP(c.Writer, c.Request)
}

// ProxyTalkWiseConversations keeps legacy TalkWise room conversations behind
// NewAPI's authenticated same-origin boundary.
func ProxyTalkWiseConversations(c *gin.Context) {
	upstream, err := configuredTalkWiseTrainingUpstream()
	if err != nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"code":    talkWiseConversationProxyUnavailable,
			"message": "TalkWise conversation proxy is not configured",
		})
		return
	}

	suffix, err := normalizeTalkWiseTrainingSuffix(c.Param("path"))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
			"success": false,
			"code":    "TALKWISE_CONVERSATION_PATH_INVALID",
			"message": "Invalid TalkWise conversation path",
		})
		return
	}

	proxy := newTalkWiseConversationReverseProxy(upstream, suffix)
	proxy.ServeHTTP(c.Writer, c.Request)
}

func configuredTalkWiseTrainingUpstream() (*url.URL, error) {
	raw := strings.TrimSpace(common.GetEnvOrDefaultString(talkWiseTrainingUpstreamEnv, ""))
	if raw == "" {
		return nil, fmt.Errorf("%s is required", talkWiseTrainingUpstreamEnv)
	}

	upstream, err := url.Parse(raw)
	if err != nil || upstream.Host == "" || (upstream.Scheme != "http" && upstream.Scheme != "https") {
		return nil, fmt.Errorf("%s must be an absolute HTTP(S) URL", talkWiseTrainingUpstreamEnv)
	}
	if upstream.User != nil || upstream.RawQuery != "" || upstream.Fragment != "" {
		return nil, fmt.Errorf("%s must not contain credentials, query, or fragment", talkWiseTrainingUpstreamEnv)
	}
	return upstream, nil
}

func normalizeTalkWiseTrainingSuffix(raw string) (string, error) {
	suffix := raw
	if suffix == "" {
		return "/", nil
	}
	if !strings.HasPrefix(suffix, "/") {
		suffix = "/" + suffix
	}
	for _, segment := range strings.Split(suffix, "/") {
		if segment == "." || segment == ".." {
			return "", errors.New("training path traversal is not allowed")
		}
	}
	return suffix, nil
}

func newTalkWiseTrainingReverseProxy(upstream *url.URL, suffix string) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	director := proxy.Director
	proxy.Director = func(request *http.Request) {
		director(request)
		request.URL.Path = joinTalkWiseTrainingUpstreamPath(upstream.Path, suffix)
		request.URL.RawPath = ""
		request.Host = upstream.Host
		stripTalkWiseIdentityInputs(request)
	}
	proxy.ErrorHandler = func(writer http.ResponseWriter, request *http.Request, proxyErr error) {
		common.SysLog(fmt.Sprintf("TalkWise training upstream request failed: %v", proxyErr))
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-store")
		writer.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(writer).Encode(gin.H{
			"success": false,
			"code":    talkWiseTrainingUpstreamUnavailable,
			"message": "TalkWise training service is unavailable",
		})
	}
	return proxy
}

func newTalkWiseConversationReverseProxy(upstream *url.URL, suffix string) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	director := proxy.Director
	proxy.Director = func(request *http.Request) {
		director(request)
		request.URL.Path = joinTalkWiseConversationUpstreamPath(upstream.Path, suffix)
		request.URL.RawPath = ""
		request.Host = upstream.Host
		stripTalkWiseIdentityInputs(request)
	}
	proxy.ErrorHandler = func(writer http.ResponseWriter, request *http.Request, proxyErr error) {
		common.SysLog(fmt.Sprintf("TalkWise conversation upstream request failed: %v", proxyErr))
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-store")
		writer.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(writer).Encode(gin.H{
			"success": false,
			"code":    talkWiseConversationUpstreamUnavailable,
			"message": "TalkWise conversation service is unavailable",
		})
	}
	return proxy
}

func joinTalkWiseTrainingUpstreamPath(upstreamBasePath string, suffix string) string {
	base := strings.TrimRight(upstreamBasePath, "/")
	return base + talkWiseTrainingUpstreamPath + suffix
}

func joinTalkWiseConversationUpstreamPath(upstreamBasePath string, suffix string) string {
	base := strings.TrimRight(upstreamBasePath, "/")
	return base + talkWiseConversationUpstreamPath + suffix
}

func stripTalkWiseIdentityInputs(request *http.Request) {
	request.Header.Del("Cookie")
	for _, header := range talkWiseIdentityHeaders {
		request.Header.Del(header)
	}

	query := request.URL.Query()
	for _, key := range talkWiseMockAuthQueryKeys {
		query.Del(key)
	}
	request.URL.RawQuery = query.Encode()
}

func validateTalkWiseClient(clientID string, clientSecret string, requireSecret bool) (string, error) {
	configuredID := configuredTalkWiseClientID()
	if strings.TrimSpace(clientID) != configuredID {
		return "", errors.New("invalid TalkWise client_id")
	}
	if !requireSecret {
		return configuredID, nil
	}

	configuredSecret := configuredTalkWiseClientSecret()
	if configuredSecret == "" {
		return "", errors.New("TalkWise client_secret is not configured")
	}
	if strings.TrimSpace(clientSecret) != configuredSecret {
		return "", errors.New("invalid TalkWise client_secret")
	}

	return configuredID, nil
}

func configuredTalkWiseClientID() string {
	value := strings.TrimSpace(common.GetEnvOrDefaultString("TALKWISE_CLIENT_ID", ""))
	if value == "" {
		value = strings.TrimSpace(common.GetEnvOrDefaultString("NEWAPI_TALKWISE_CLIENT_ID", ""))
	}
	if value == "" {
		value = defaultTalkWiseClientID
	}
	return value
}

func configuredTalkWiseClientSecret() string {
	value := strings.TrimSpace(common.GetEnvOrDefaultString("TALKWISE_CLIENT_SECRET", ""))
	if value == "" {
		value = strings.TrimSpace(common.GetEnvOrDefaultString("NEWAPI_TALKWISE_CLIENT_SECRET", ""))
	}
	return value
}

func validateTalkWiseRedirectURI(rawURI string) error {
	if rawURI == "" {
		return errors.New("TalkWise redirect_uri is required")
	}
	parsed, err := url.Parse(rawURI)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return errors.New("invalid TalkWise redirect_uri")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("invalid TalkWise redirect_uri scheme")
	}

	if allowed := configuredTalkWiseRedirectURIs(); len(allowed) > 0 {
		if _, ok := allowed[rawURI]; ok {
			return nil
		}
		return errors.New("TalkWise redirect_uri is not allowed")
	}
	if len(constant.TrustedRedirectDomains) > 0 {
		return common.ValidateRedirectURL(rawURI)
	}
	if isLoopbackRedirectHost(parsed.Hostname()) {
		return nil
	}
	return errors.New("TalkWise redirect_uri is not allowed; configure TALKWISE_REDIRECT_URIS or TRUSTED_REDIRECT_DOMAINS")
}

func configuredTalkWiseRedirectURIs() map[string]struct{} {
	allowed := make(map[string]struct{})
	for _, envName := range []string{"TALKWISE_REDIRECT_URIS", "TALKWISE_REDIRECT_URI", "NEWAPI_TALKWISE_REDIRECT_URI"} {
		raw := common.GetEnvOrDefaultString(envName, "")
		for _, item := range strings.Split(raw, ",") {
			trimmed := strings.TrimSpace(item)
			if trimmed != "" {
				allowed[trimmed] = struct{}{}
			}
		}
	}
	return allowed
}

func isLoopbackRedirectHost(host string) bool {
	normalized := strings.ToLower(strings.TrimSpace(host))
	return normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1"
}

func buildTalkWiseRedirectURL(rawURL string, code string, state string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("talkwise_code", code)
	if state != "" {
		query.Set("state", state)
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func normalizeTalkWiseGroup(raw string) (string, error) {
	group := strings.TrimSpace(raw)
	if group == "" {
		return "", errors.New("TalkWise group is required")
	}
	return group, nil
}

func normalizeTalkWiseLimit(raw int, fallback int, max int) int {
	if raw <= 0 {
		return fallback
	}
	if raw > max {
		return max
	}
	return raw
}

func buildTalkWiseTeamData(group string) gin.H {
	return gin.H{
		"id":    "newapi:" + group,
		"name":  group,
		"group": group,
	}
}

func buildTalkWiseTeamUserData(user *model.User, currentGroup string) gin.H {
	teamID := "newapi"
	teamName := "NewAPI"
	if strings.TrimSpace(user.Group) != "" {
		teamID = "newapi:" + user.Group
		teamName = user.Group
	}
	return gin.H{
		"id":            user.Id,
		"user_id":       user.Id,
		"username":      user.Username,
		"display_name":  user.DisplayName,
		"email":         user.Email,
		"role":          user.Role,
		"status":        user.Status,
		"group":         user.Group,
		"team_id":       teamID,
		"team_name":     teamName,
		"quota":         user.Quota,
		"used_quota":    user.UsedQuota,
		"request_count": user.RequestCount,
		"in_team":       strings.TrimSpace(user.Group) == strings.TrimSpace(currentGroup),
	}
}

func buildTalkWiseIdentityData(c *gin.Context, user *model.User) gin.H {
	userData := buildSelfUserData(user)
	teamID := "newapi"
	teamName := "NewAPI"
	if strings.TrimSpace(user.Group) != "" {
		teamID = "newapi:" + user.Group
		teamName = user.Group
	}

	subscriptionPlan, subscriptionStatus := talkWiseSubscriptionStatus(user.Id)
	gatewayBaseURL := strings.TrimSpace(common.GetEnvOrDefaultString("TALKWISE_GATEWAY_BASE_URL", ""))
	if gatewayBaseURL == "" {
		gatewayBaseURL = requestBaseURL(c)
	}

	return gin.H{
		"user": gin.H{
			"id":            userData["id"],
			"username":      userData["username"],
			"display_name":  userData["display_name"],
			"role":          userData["role"],
			"status":        userData["status"],
			"group":         userData["group"],
			"quota":         userData["quota"],
			"used_quota":    userData["used_quota"],
			"request_count": userData["request_count"],
		},
		"team": gin.H{
			"id":   teamID,
			"name": teamName,
		},
		"team_id":             teamID,
		"team_name":           teamName,
		"quota":               user.Quota,
		"used_quota":          user.UsedQuota,
		"request_count":       user.RequestCount,
		"subscription_plan":   subscriptionPlan,
		"subscription_status": subscriptionStatus,
		"subscription": gin.H{
			"plan":   subscriptionPlan,
			"status": subscriptionStatus,
		},
		"gateway": gin.H{
			"base_url": gatewayBaseURL,
		},
	}
}

func talkWiseSubscriptionStatus(userID int) (string, string) {
	activeSubscriptions, err := model.GetAllActiveUserSubscriptions(userID)
	if err != nil || len(activeSubscriptions) == 0 {
		if err != nil {
			common.SysLog("failed to load TalkWise subscription status: " + err.Error())
		}
		return "", "none"
	}

	subscription := activeSubscriptions[0].Subscription
	if subscription == nil {
		return "", "none"
	}
	planTitle := strconv.Itoa(subscription.PlanId)
	if info, err := model.GetSubscriptionPlanInfoByUserSubscriptionId(subscription.Id); err == nil && strings.TrimSpace(info.PlanTitle) != "" {
		planTitle = info.PlanTitle
	}
	return planTitle, subscription.Status
}

func requestBaseURL(c *gin.Context) string {
	if c == nil || c.Request == nil {
		return ""
	}
	host := strings.TrimSpace(c.Request.Host)
	if host == "" {
		return ""
	}
	scheme := strings.TrimSpace(c.GetHeader("X-Forwarded-Proto"))
	if scheme == "" {
		scheme = strings.TrimSpace(c.GetHeader("X-Scheme"))
	}
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	return fmt.Sprintf("%s://%s", scheme, host)
}
