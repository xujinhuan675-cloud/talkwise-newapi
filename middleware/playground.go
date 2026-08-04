package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// SetupPlaygroundRelay turns an authenticated dashboard request into a
// tokenless relay request. Billing still uses the user's native wallet or
// subscription; only API-token quota accounting is skipped.
func SetupPlaygroundRelay() func(c *gin.Context) {
	return func(c *gin.Context) {
		if c.GetBool("use_access_token") {
			abortWithOpenAiMessage(
				c,
				http.StatusForbidden,
				common.TranslateMessage(c, i18n.MsgAuthAccessTokenInvalid),
				types.ErrorCodeAccessDenied,
			)
			return
		}

		userID := c.GetInt("id")
		if userID <= 0 {
			abortWithOpenAiMessage(c, http.StatusUnauthorized, common.TranslateMessage(c, i18n.MsgAuthNotLoggedIn))
			return
		}

		usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
		if usingGroup == "" {
			usingGroup = common.GetContextKeyString(c, constant.ContextKeyUserGroup)
			common.SetContextKey(c, constant.ContextKeyUsingGroup, usingGroup)
		}

		tempToken := &model.Token{
			UserId: userID,
			Name:   fmt.Sprintf("playground-%s", usingGroup),
			Group:  usingGroup,
		}
		if err := SetupContextForToken(c, tempToken); err != nil {
			abortWithOpenAiMessage(c, http.StatusForbidden, err.Error(), types.ErrorCodeAccessDenied)
			return
		}

		common.SetContextKey(c, constant.ContextKeyPlayground, true)
		rewritePlaygroundRelayPath(c)
		c.Next()
	}
}

func rewritePlaygroundRelayPath(c *gin.Context) {
	if c == nil || c.Request == nil || c.Request.URL == nil {
		return
	}
	path := strings.TrimPrefix(c.Request.URL.Path, "/pg")
	if path == "" {
		path = "/v1"
	} else if path != "/v1" && !strings.HasPrefix(path, "/v1/") {
		path = "/v1" + path
	}
	c.Request.URL.Path = path
}
