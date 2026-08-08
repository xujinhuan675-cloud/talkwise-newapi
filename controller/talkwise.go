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
	defaultTalkWiseClientID                     = "talkwise"
	talkWiseHandoffTTL                          = 5 * time.Minute
	talkWiseTrainingUpstreamEnv                 = "TALKWISE_TRAINING_UPSTREAM_URL"
	talkWiseTrainingUpstreamPath                = "/api/v1/training-studio"
	talkWiseTrainingProxyUnavailable            = "TALKWISE_TRAINING_PROXY_UNAVAILABLE"
	talkWiseTrainingUpstreamUnavailable         = "TALKWISE_TRAINING_UPSTREAM_UNAVAILABLE"
	talkWiseHealthLiveUpstreamPath              = "/health/live"
	talkWiseHealthReadyUpstreamPath             = "/health/ready"
	talkWiseVoiceHealthReadyUpstreamPath        = "/health/voice/ready"
	talkWiseHealthProxyUnavailable              = "TALKWISE_HEALTH_PROXY_UNAVAILABLE"
	talkWiseHealthUpstreamUnavailable           = "TALKWISE_HEALTH_UPSTREAM_UNAVAILABLE"
	talkWiseConversationUpstreamPath            = "/api/v1/stakeholder"
	talkWiseConversationProxyUnavailable        = "TALKWISE_CONVERSATION_PROXY_UNAVAILABLE"
	talkWiseConversationUpstreamUnavailable     = "TALKWISE_CONVERSATION_UPSTREAM_UNAVAILABLE"
	talkWiseConversationTreeUpstreamPath        = "/api/v1/conversations"
	talkWiseConversationTreeProxyUnavailable    = "TALKWISE_CONVERSATION_TREE_PROXY_UNAVAILABLE"
	talkWiseConversationTreeUpstreamUnavailable = "TALKWISE_CONVERSATION_TREE_UPSTREAM_UNAVAILABLE"
	talkWiseBattlePrepUpstreamPath              = "/api/v1/stakeholder/battle-prep"
	talkWiseBattlePrepProxyUnavailable          = "TALKWISE_BATTLE_PREP_PROXY_UNAVAILABLE"
	talkWiseBattlePrepUpstreamUnavailable       = "TALKWISE_BATTLE_PREP_UPSTREAM_UNAVAILABLE"
	talkWiseDefensePrepUpstreamPath             = "/api/v1/defense-prep"
	talkWiseDefensePrepProxyUnavailable         = "TALKWISE_DEFENSE_PREP_PROXY_UNAVAILABLE"
	talkWiseDefensePrepUpstreamUnavailable      = "TALKWISE_DEFENSE_PREP_UPSTREAM_UNAVAILABLE"
	talkWisePersonaUpstreamPath                 = "/api/v1/stakeholder/personas"
	talkWisePersonaProxyUnavailable             = "TALKWISE_PERSONA_PROXY_UNAVAILABLE"
	talkWisePersonaUpstreamUnavailable          = "TALKWISE_PERSONA_UPSTREAM_UNAVAILABLE"
	talkWiseVoiceCatalogUpstreamPath            = "/api/v1/stakeholder/voice-catalog"
	talkWiseVoiceCatalogProxyUnavailable        = "TALKWISE_VOICE_CATALOG_PROXY_UNAVAILABLE"
	talkWiseVoiceCatalogUpstreamUnavailable     = "TALKWISE_VOICE_CATALOG_UPSTREAM_UNAVAILABLE"
	talkWisePersonaDetectSpeakersUpstreamPath   = "/api/v1/stakeholder/persona/detect-speakers"
	talkWisePersonaBuildUpstreamPath            = "/api/v1/stakeholder/persona/build"
	talkWisePersonaBuilderProxyUnavailable      = "TALKWISE_PERSONA_BUILDER_PROXY_UNAVAILABLE"
	talkWisePersonaBuilderUpstreamUnavailable   = "TALKWISE_PERSONA_BUILDER_UPSTREAM_UNAVAILABLE"
	talkWiseGrowthProfileCardUpstreamPath       = "/api/v1/stakeholder/growth/card"
	talkWiseGrowthProfileProxyUnavailable       = "TALKWISE_GROWTH_PROFILE_PROXY_UNAVAILABLE"
	talkWiseGrowthProfileUpstreamUnavailable    = "TALKWISE_GROWTH_PROFILE_UPSTREAM_UNAVAILABLE"
	talkWiseRealtimeWebSocketSuffix             = "/realtime"
	talkWiseWebSocketBearerProtocolPrefix       = "talkwise.bearer."
	talkWiseWebSocketBearerTokenMaxLength       = 4096
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
	TeamId       string `json:"team_id"`
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
	Role         string `json:"role"`
}

type TalkWiseAdminTeamRequest struct {
	Name string `json:"name"`
}

type TalkWiseAdminTeamMemberRequest struct {
	UserId int    `json:"user_id"`
	Role   string `json:"role"`
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

	team, err := resolveTalkWiseTrainingTeam(req.TeamId, req.Group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	limit := normalizeTalkWiseLimit(req.Limit, 100, 200)
	members, total, err := model.ListTrainingTeamMembers(team.Id, 0, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	memberData := make([]gin.H, 0, len(members))
	for i := range members {
		memberData = append(memberData, buildTalkWiseTeamUserData(&members[i], team.Id))
	}
	common.ApiSuccess(c, gin.H{
		"team":    buildTalkWiseTeamData(team),
		"members": memberData,
		"total":   total,
	})
}

func resolveTalkWiseTrainingTeam(teamID string, legacyGroup string) (*model.TrainingTeam, error) {
	if normalizedTeamID := strings.TrimSpace(teamID); normalizedTeamID != "" {
		return model.GetTrainingTeamById(normalizedTeamID)
	}
	group, err := normalizeTalkWiseGroup(legacyGroup)
	if err != nil {
		return nil, err
	}
	return model.FindOrCreateLegacyTrainingTeam(group)
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

	team, err := model.FindOrCreateLegacyTrainingTeam(group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	limit := normalizeTalkWiseLimit(req.Limit, 20, 50)
	users, total, err := model.SearchTrainingTeamUsers(team.Id, keyword, 0, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	results := make([]gin.H, 0, len(users))
	for i := range users {
		results = append(results, buildTalkWiseTeamUserData(&users[i], team.Id))
	}
	common.ApiSuccess(c, gin.H{
		"team":  buildTalkWiseTeamData(team),
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

	team, err := model.FindOrCreateLegacyTrainingTeam(group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if _, err := model.AddTrainingTeamMember(team.Id, req.UserId, req.Role); err != nil {
		common.ApiError(c, err)
		return
	}
	member, err := model.GetTrainingTeamMember(team.Id, req.UserId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"team":   buildTalkWiseTeamData(team),
		"member": buildTalkWiseTeamUserData(member, team.Id),
	})
}

func RemoveTalkWiseTeamMember(c *gin.Context) {
	var req TalkWiseTeamMemberAssignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid TalkWise team member removal request")
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
	team, err := model.FindOrCreateLegacyTrainingTeam(group)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.RemoveTrainingTeamMember(team.Id, req.UserId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"team": buildTalkWiseTeamData(team), "user_id": req.UserId})
}

func AdminListTalkWiseTrainingTeams(c *gin.Context) {
	if c.GetInt("role") < common.RoleAdminUser {
		team, membership, err := model.GetTrainingTeamForUser(c.GetInt("id"))
		if err != nil || (membership.Role != model.TrainingTeamRoleOwner && membership.Role != model.TrainingTeamRoleAdmin) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"code":    "TRAINING_TEAM_MANAGEMENT_FORBIDDEN",
				"message": "Training team management requires a team owner or administrator role",
			})
			return
		}
		common.ApiSuccess(c, gin.H{"teams": []model.TrainingTeam{*team}, "total": 1})
		return
	}
	startIdx, _ := strconv.Atoi(c.DefaultQuery("start_index", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	teams, total, err := model.ListTrainingTeams(startIdx, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"teams": teams, "total": total})
}

func AdminGetTalkWiseUserTrainingTeam(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("userId"))
	if err != nil || userID <= 0 {
		common.ApiErrorMsg(c, "invalid training team user id")
		return
	}
	if _, err := model.GetUserById(userID, false); err != nil {
		common.ApiError(c, err)
		return
	}

	team, membership, err := model.GetTrainingTeamForUser(userID)
	if errors.Is(err, model.ErrTrainingTeamMemberNotFound) {
		common.ApiSuccess(c, gin.H{"membership": nil})
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"membership": gin.H{
			"team_id":   team.Id,
			"team_name": team.Name,
			"team_role": membership.Role,
		},
	})
}

func AdminCreateTalkWiseTrainingTeam(c *gin.Context) {
	var req TalkWiseAdminTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid training team request")
		return
	}
	team, err := model.CreateTrainingTeam(req.Name)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, team)
}

func AdminUpdateTalkWiseTrainingTeam(c *gin.Context) {
	var req TalkWiseAdminTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "invalid training team request")
		return
	}
	team, err := model.UpdateTrainingTeam(c.Param("teamId"), req.Name)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, team)
}

func AdminDeleteTalkWiseTrainingTeam(c *gin.Context) {
	teamID := c.Param("teamId")
	if err := model.DeleteTrainingTeam(teamID); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": teamID})
}

func AdminListTalkWiseTrainingTeamMembers(c *gin.Context) {
	startIdx, _ := strconv.Atoi(c.DefaultQuery("start_index", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	members, total, err := model.ListTrainingTeamMembers(c.Param("teamId"), startIdx, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"members": members, "total": total})
}

func AdminSearchTalkWiseTrainingTeamUsers(c *gin.Context) {
	startIdx, _ := strconv.Atoi(c.DefaultQuery("start_index", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	users, total, err := model.SearchTrainingTeamUsers(c.Param("teamId"), c.Query("keyword"), startIdx, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"users": users, "total": total})
}

func AdminAddTalkWiseTrainingTeamMember(c *gin.Context) {
	var req TalkWiseAdminTeamMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.UserId <= 0 {
		common.ApiErrorMsg(c, "invalid training team member request")
		return
	}
	teamID := c.Param("teamId")
	if _, err := model.AddTrainingTeamMember(teamID, req.UserId, req.Role); err != nil {
		common.ApiError(c, err)
		return
	}
	member, err := model.GetTrainingTeamMember(teamID, req.UserId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, member)
}

func AdminRemoveTalkWiseTrainingTeamMember(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("userId"))
	if err != nil || userID <= 0 {
		common.ApiErrorMsg(c, "invalid training team user id")
		return
	}
	if err := model.RemoveTrainingTeamMember(c.Param("teamId"), userID); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"user_id": userID})
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

// ProxyTalkWiseHealthLive exposes the backend's secret-free liveness check to
// external monitors without requiring a dashboard user session.
func ProxyTalkWiseHealthLive(c *gin.Context) {
	proxyTalkWiseFixedPath(
		c,
		talkWiseHealthLiveUpstreamPath,
		talkWiseHealthProxyUnavailable,
		talkWiseHealthUpstreamUnavailable,
		"TalkWise health",
	)
}

// ProxyTalkWiseHealthReady preserves the optional HEALTH__ACCESS_TOKEN header
// while forwarding the backend dependency readiness check.
func ProxyTalkWiseHealthReady(c *gin.Context) {
	proxyTalkWiseFixedPath(
		c,
		talkWiseHealthReadyUpstreamPath,
		talkWiseHealthProxyUnavailable,
		talkWiseHealthUpstreamUnavailable,
		"TalkWise health",
	)
}

// ProxyTalkWiseVoiceHealthReady exposes the protected, non-billable voice
// route and local runtime readiness check for Uptime Kuma.
func ProxyTalkWiseVoiceHealthReady(c *gin.Context) {
	proxyTalkWiseFixedPath(
		c,
		talkWiseVoiceHealthReadyUpstreamPath,
		talkWiseHealthProxyUnavailable,
		talkWiseHealthUpstreamUnavailable,
		"TalkWise voice health",
	)
}

// PromoteTalkWiseTrainingWebSocketAuthorization lets browser WebSocket clients
// present the existing NewAPI access token without putting it in the URL. It
// must run immediately before middleware.UserAuth on the TalkWise training
// route. UserAuth remains the authority that validates the promoted token.
func PromoteTalkWiseTrainingWebSocketAuthorization(c *gin.Context) {
	promoteTalkWiseWebSocketAuthorization(
		c,
		isTalkWiseRealtimeWebSocketRequest(c),
		"TALKWISE_REALTIME_AUTH_REQUIRED",
		"TALKWISE_REALTIME_CREDENTIAL_INVALID",
		"TALKWISE_REALTIME_CREDENTIAL_CONFLICT",
		"TalkWise realtime",
	)
}

// PromoteTalkWiseConversationWebSocketAuthorization applies the same browser
// credential bridge to the turn-based room voice endpoint. The ordinary
// talkwise.voice protocol is preserved; the credential protocol is removed
// before UserAuth and the upstream proxy see the request.
func PromoteTalkWiseConversationWebSocketAuthorization(c *gin.Context) {
	promoteTalkWiseWebSocketAuthorization(
		c,
		isTalkWiseVoiceWebSocketRequest(c),
		"TALKWISE_VOICE_AUTH_REQUIRED",
		"TALKWISE_VOICE_CREDENTIAL_INVALID",
		"TALKWISE_VOICE_CREDENTIAL_CONFLICT",
		"TalkWise voice",
	)
}

func promoteTalkWiseWebSocketAuthorization(
	c *gin.Context,
	isExpectedWebSocket bool,
	requiredCode string,
	invalidCode string,
	conflictCode string,
	serviceName string,
) {
	request := c.Request
	if isExpectedWebSocket && containsTalkWiseWebSocketCredentialQuery(request.URL.Query()) {
		stripTalkWiseWebSocketBearerProtocol(request.Header)
		abortTalkWiseWebSocketAuth(c, http.StatusBadRequest, invalidCode, "Invalid "+serviceName+" credential")
		return
	}
	if !containsTalkWiseWebSocketBearerProtocol(request.Header) {
		if isExpectedWebSocket && strings.TrimSpace(request.Header.Get("Authorization")) == "" {
			abortTalkWiseWebSocketAuth(c, http.StatusUnauthorized, requiredCode, serviceName+" authentication is required")
			return
		}
		c.Next()
		return
	}

	protocols, token, err := parseTalkWiseWebSocketBearerProtocol(request.Header)
	if err != nil || !isExpectedWebSocket {
		stripTalkWiseWebSocketBearerProtocol(request.Header)
		abortTalkWiseWebSocketAuth(c, http.StatusBadRequest, invalidCode, "Invalid "+serviceName+" credential")
		return
	}

	if authorization := strings.TrimSpace(request.Header.Get("Authorization")); authorization != "" {
		authorizationToken, ok := normalizeTalkWiseAuthorizationToken(authorization)
		if !ok || authorizationToken != token {
			stripTalkWiseWebSocketBearerProtocol(request.Header)
			abortTalkWiseWebSocketAuth(c, http.StatusBadRequest, conflictCode, "Conflicting "+serviceName+" credentials")
			return
		}
	}

	setTalkWiseWebSocketProtocols(request.Header, protocols)
	request.Header.Set("Authorization", "Bearer "+token)
	c.Next()
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

// ProxyTalkWiseConversationTree keeps NewAPI as the authenticated origin for
// TalkWise's scope-protected text conversation and message-tree APIs.
func ProxyTalkWiseConversationTree(c *gin.Context) {
	upstream, err := configuredTalkWiseTrainingUpstream()
	if err != nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"code":    talkWiseConversationTreeProxyUnavailable,
			"message": "TalkWise conversation tree proxy is not configured",
		})
		return
	}

	suffix, err := normalizeTalkWiseTrainingSuffix(c.Param("path"))
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
			"success": false,
			"code":    "TALKWISE_CONVERSATION_TREE_PATH_INVALID",
			"message": "Invalid TalkWise conversation tree path",
		})
		return
	}

	proxy := newTalkWiseConversationTreeReverseProxy(upstream, suffix)
	proxy.ServeHTTP(c.Writer, c.Request)
}

// ProxyTalkWiseBattlePrep exposes only the battle-prep resource namespace.
// NewAPI authenticates the caller; TalkWise enforces asset and room ownership.
func ProxyTalkWiseBattlePrep(c *gin.Context) {
	proxyTalkWiseScopedNamespace(
		c,
		"TALKWISE_BATTLE_PREP_PATH_INVALID",
		talkWiseBattlePrepProxyUnavailable,
		talkWiseBattlePrepUpstreamUnavailable,
		talkWiseBattlePrepUpstreamPath,
		"TalkWise battle preparation",
		false,
	)
}

// ProxyTalkWiseDefensePrep exposes only the defense-prep resource namespace.
func ProxyTalkWiseDefensePrep(c *gin.Context) {
	proxyTalkWiseScopedNamespace(
		c,
		"TALKWISE_DEFENSE_PREP_PATH_INVALID",
		talkWiseDefensePrepProxyUnavailable,
		talkWiseDefensePrepUpstreamUnavailable,
		talkWiseDefensePrepUpstreamPath,
		"TalkWise defense preparation",
		false,
	)
}

// ProxyTalkWisePersonas exposes only TalkWise's persona asset namespace.
// The root route deliberately maps without a trailing slash to avoid a FastAPI
// redirect that could obscure the original authorization header.
func ProxyTalkWisePersonas(c *gin.Context) {
	if c.Request.Method == http.MethodGet && c.Param("path") == "/voice-catalog" {
		ProxyTalkWiseVoiceCatalog(c)
		return
	}
	proxyTalkWiseScopedNamespace(
		c,
		"TALKWISE_PERSONA_PATH_INVALID",
		talkWisePersonaProxyUnavailable,
		talkWisePersonaUpstreamUnavailable,
		talkWisePersonaUpstreamPath,
		"TalkWise persona",
		true,
	)
}

// ProxyTalkWiseVoiceCatalog exposes the provider-neutral voice catalog beside
// the persona asset namespace. The backend route is a sibling of /personas,
// so it must not be routed through the persona wildcard.
func ProxyTalkWiseVoiceCatalog(c *gin.Context) {
	proxyTalkWiseFixedPath(
		c,
		talkWiseVoiceCatalogUpstreamPath,
		talkWiseVoiceCatalogProxyUnavailable,
		talkWiseVoiceCatalogUpstreamUnavailable,
		"TalkWise voice catalog",
	)
}

// ProxyTalkWisePersonaDetectSpeakers exposes only the builder's speaker
// detection action, not the wider stakeholder namespace.
func ProxyTalkWisePersonaDetectSpeakers(c *gin.Context) {
	proxyTalkWiseFixedPath(
		c,
		talkWisePersonaDetectSpeakersUpstreamPath,
		talkWisePersonaBuilderProxyUnavailable,
		talkWisePersonaBuilderUpstreamUnavailable,
		"TalkWise persona builder",
	)
}

// ProxyTalkWisePersonaBuild preserves the persona builder's SSE response.
func ProxyTalkWisePersonaBuild(c *gin.Context) {
	proxyTalkWiseFixedPath(
		c,
		talkWisePersonaBuildUpstreamPath,
		talkWisePersonaBuilderProxyUnavailable,
		talkWisePersonaBuilderUpstreamUnavailable,
		"TalkWise persona builder",
	)
}

// ProxyTalkWiseGrowthProfileCard exposes only the authenticated communication
// profile generator. Account referral links remain owned by NewAPI and are not
// used as training-resource share credentials.
func ProxyTalkWiseGrowthProfileCard(c *gin.Context) {
	proxyTalkWiseFixedPath(
		c,
		talkWiseGrowthProfileCardUpstreamPath,
		talkWiseGrowthProfileProxyUnavailable,
		talkWiseGrowthProfileUpstreamUnavailable,
		"TalkWise growth profile",
	)
}

func proxyTalkWiseScopedNamespace(
	c *gin.Context,
	pathErrorCode string,
	unavailableCode string,
	upstreamUnavailableCode string,
	upstreamPath string,
	serviceName string,
	exactRoot bool,
) {
	upstream, err := configuredTalkWiseTrainingUpstream()
	if err != nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"code":    unavailableCode,
			"message": serviceName + " proxy is not configured",
		})
		return
	}

	rawSuffix := c.Param("path")
	suffix, err := normalizeTalkWiseTrainingSuffix(rawSuffix)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
			"success": false,
			"code":    pathErrorCode,
			"message": "Invalid " + serviceName + " path",
		})
		return
	}
	if exactRoot && rawSuffix == "" {
		suffix = ""
	}

	proxy := newTalkWiseScopedNamespaceReverseProxy(
		upstream,
		suffix,
		upstreamPath,
		upstreamUnavailableCode,
		serviceName,
	)
	proxy.ServeHTTP(c.Writer, c.Request)
}

func proxyTalkWiseFixedPath(
	c *gin.Context,
	upstreamPath string,
	unavailableCode string,
	upstreamUnavailableCode string,
	serviceName string,
) {
	upstream, err := configuredTalkWiseTrainingUpstream()
	if err != nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"code":    unavailableCode,
			"message": serviceName + " proxy is not configured",
		})
		return
	}

	proxy := newTalkWiseScopedNamespaceReverseProxy(
		upstream,
		"",
		upstreamPath,
		upstreamUnavailableCode,
		serviceName,
	)
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
		stripTalkWiseWebSocketBearerProtocol(request.Header)
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
		stripTalkWiseWebSocketBearerProtocol(request.Header)
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

func newTalkWiseConversationTreeReverseProxy(upstream *url.URL, suffix string) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	director := proxy.Director
	proxy.Director = func(request *http.Request) {
		director(request)
		request.URL.Path = joinTalkWiseConversationTreeUpstreamPath(upstream.Path, suffix)
		request.URL.RawPath = ""
		request.Host = upstream.Host
		stripTalkWiseIdentityInputs(request)
	}
	proxy.ErrorHandler = func(writer http.ResponseWriter, request *http.Request, proxyErr error) {
		common.SysLog(fmt.Sprintf("TalkWise conversation tree upstream request failed: %v", proxyErr))
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-store")
		writer.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(writer).Encode(gin.H{
			"success": false,
			"code":    talkWiseConversationTreeUpstreamUnavailable,
			"message": "TalkWise conversation tree service is unavailable",
		})
	}
	return proxy
}

func newTalkWiseScopedNamespaceReverseProxy(
	upstream *url.URL,
	suffix string,
	upstreamPath string,
	upstreamUnavailableCode string,
	serviceName string,
) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	director := proxy.Director
	proxy.Director = func(request *http.Request) {
		director(request)
		request.URL.Path = joinTalkWiseUpstreamPath(upstream.Path, upstreamPath, suffix)
		request.URL.RawPath = ""
		request.Host = upstream.Host
		stripTalkWiseIdentityInputs(request)
	}
	proxy.ErrorHandler = func(writer http.ResponseWriter, request *http.Request, proxyErr error) {
		common.SysLog(fmt.Sprintf("%s upstream request failed: %v", serviceName, proxyErr))
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-store")
		writer.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(writer).Encode(gin.H{
			"success": false,
			"code":    upstreamUnavailableCode,
			"message": serviceName + " service is unavailable",
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

func joinTalkWiseConversationTreeUpstreamPath(upstreamBasePath string, suffix string) string {
	base := strings.TrimRight(upstreamBasePath, "/")
	return base + talkWiseConversationTreeUpstreamPath + suffix
}

func joinTalkWiseUpstreamPath(upstreamBasePath string, resourcePath string, suffix string) string {
	base := strings.TrimRight(upstreamBasePath, "/")
	return base + resourcePath + suffix
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

func isTalkWiseRealtimeWebSocketRequest(c *gin.Context) bool {
	return c.Param("path") == talkWiseRealtimeWebSocketSuffix &&
		headerContainsToken(c.Request.Header.Get("Connection"), "upgrade") &&
		strings.EqualFold(strings.TrimSpace(c.Request.Header.Get("Upgrade")), "websocket")
}

func isTalkWiseVoiceWebSocketRequest(c *gin.Context) bool {
	segments := strings.Split(strings.Trim(c.Param("path"), "/"), "/")
	if len(segments) != 3 || segments[0] != "rooms" || segments[2] != "voice" {
		return false
	}
	roomID, err := strconv.ParseInt(segments[1], 10, 64)
	return err == nil && roomID > 0 &&
		headerContainsToken(c.Request.Header.Get("Connection"), "upgrade") &&
		strings.EqualFold(strings.TrimSpace(c.Request.Header.Get("Upgrade")), "websocket")
}

func headerContainsToken(header string, token string) bool {
	for _, value := range strings.Split(header, ",") {
		if strings.EqualFold(strings.TrimSpace(value), token) {
			return true
		}
	}
	return false
}

func containsTalkWiseWebSocketCredentialQuery(query url.Values) bool {
	for key := range query {
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "access_token", "accesstoken", "authorization", "bearer", "bearer_token", "token":
			return true
		}
	}
	return false
}

func containsTalkWiseWebSocketBearerProtocol(header http.Header) bool {
	prefix := strings.ToLower(talkWiseWebSocketBearerProtocolPrefix)
	for _, value := range header.Values("Sec-WebSocket-Protocol") {
		for _, protocol := range strings.Split(value, ",") {
			if strings.HasPrefix(strings.ToLower(strings.TrimSpace(protocol)), prefix) {
				return true
			}
		}
	}
	return false
}

func parseTalkWiseWebSocketBearerProtocol(header http.Header) ([]string, string, error) {
	protocols := make([]string, 0)
	credential := ""
	prefixLower := strings.ToLower(talkWiseWebSocketBearerProtocolPrefix)

	for _, value := range header.Values("Sec-WebSocket-Protocol") {
		for _, rawProtocol := range strings.Split(value, ",") {
			protocol := strings.TrimSpace(rawProtocol)
			if protocol == "" || !isValidTalkWiseHTTPToken(protocol) {
				return nil, "", errors.New("invalid WebSocket subprotocol")
			}
			if strings.HasPrefix(strings.ToLower(protocol), prefixLower) {
				if !strings.HasPrefix(protocol, talkWiseWebSocketBearerProtocolPrefix) || credential != "" {
					return nil, "", errors.New("invalid WebSocket bearer subprotocol")
				}
				credential = strings.TrimPrefix(protocol, talkWiseWebSocketBearerProtocolPrefix)
				if len(credential) == 0 || len(credential) > talkWiseWebSocketBearerTokenMaxLength || !isValidTalkWiseHTTPToken(credential) {
					return nil, "", errors.New("invalid WebSocket bearer token")
				}
				continue
			}
			protocols = append(protocols, protocol)
		}
	}
	if credential == "" {
		return nil, "", errors.New("WebSocket bearer token is required")
	}
	return protocols, credential, nil
}

func stripTalkWiseWebSocketBearerProtocol(header http.Header) {
	if !containsTalkWiseWebSocketBearerProtocol(header) {
		return
	}
	protocols, _, err := parseTalkWiseWebSocketBearerProtocol(header)
	if err != nil {
		header.Del("Sec-WebSocket-Protocol")
		return
	}
	setTalkWiseWebSocketProtocols(header, protocols)
}

func setTalkWiseWebSocketProtocols(header http.Header, protocols []string) {
	header.Del("Sec-WebSocket-Protocol")
	if len(protocols) > 0 {
		header.Set("Sec-WebSocket-Protocol", strings.Join(protocols, ", "))
	}
}

func normalizeTalkWiseAuthorizationToken(header string) (string, bool) {
	parts := strings.Fields(header)
	if len(parts) == 1 && isValidTalkWiseHTTPToken(parts[0]) {
		return parts[0], true
	}
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && isValidTalkWiseHTTPToken(parts[1]) {
		return parts[1], true
	}
	return "", false
}

func isValidTalkWiseHTTPToken(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range []byte(value) {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') {
			continue
		}
		switch char {
		case '!', '#', '$', '%', '&', '\'', '*', '+', '-', '.', '^', '_', '`', '|', '~':
			continue
		default:
			return false
		}
	}
	return true
}

func abortTalkWiseWebSocketAuth(c *gin.Context, status int, code string, message string) {
	c.AbortWithStatusJSON(status, gin.H{
		"success": false,
		"code":    code,
		"message": message,
	})
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

func buildTalkWiseTeamData(team *model.TrainingTeam) gin.H {
	group := team.Id
	if team.LegacyKey != nil && strings.TrimSpace(*team.LegacyKey) != "" {
		group = strings.TrimSpace(*team.LegacyKey)
	}
	return gin.H{"id": team.Id, "name": team.Name, "group": group}
}

func buildTalkWiseTeamUserData(user *model.TrainingTeamMemberView, currentTeamID string) gin.H {
	inTeam := strings.TrimSpace(user.MembershipTeamId) == strings.TrimSpace(currentTeamID)
	return gin.H{
		"id":            user.UserId,
		"user_id":       user.UserId,
		"username":      user.Username,
		"display_name":  user.DisplayName,
		"email":         user.Email,
		"role":          user.PlatformRole,
		"status":        user.Status,
		"group":         user.GatewayGroup,
		"team_id":       user.MembershipTeamId,
		"team_name":     user.MembershipTeamName,
		"team_role":     user.TeamRole,
		"quota":         user.Quota,
		"used_quota":    user.UsedQuota,
		"request_count": user.RequestCount,
		"in_team":       inTeam,
	}
}

func buildTalkWiseIdentityData(c *gin.Context, user *model.User) gin.H {
	userData := buildSelfUserData(user)
	var teamData any
	teamID := ""
	teamName := ""
	teamRole := ""
	team, membership, err := model.GetTrainingTeamForUser(user.Id)
	if err == nil {
		teamID = team.Id
		teamName = team.Name
		teamRole = membership.Role
		teamData = buildTalkWiseTeamData(team)
	} else if !errors.Is(err, model.ErrTrainingTeamMemberNotFound) {
		common.SysError("failed to resolve TalkWise training team: " + err.Error())
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
		"team":                teamData,
		"team_id":             teamID,
		"team_name":           teamName,
		"team_role":           teamRole,
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
