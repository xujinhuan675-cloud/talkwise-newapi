package controller

import (
	"errors"
	"fmt"
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
	defaultTalkWiseClientID = "talkwise"
	talkWiseHandoffTTL      = 5 * time.Minute
)

var errTalkWiseRedirectMismatch = errors.New("talkwise redirect_uri mismatch")

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
