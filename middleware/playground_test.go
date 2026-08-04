package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetupPlaygroundRelayBuildsTokenlessUserBillingContext(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST(
		"/pg/audio/speech",
		func(c *gin.Context) {
			c.Set("id", 42)
			common.SetContextKey(c, constant.ContextKeyUserGroup, "default")
			c.Next()
		},
		SetupPlaygroundRelay(),
		func(c *gin.Context) {
			assert.Equal(t, "/v1/audio/speech", c.Request.URL.Path)
			assert.True(t, common.GetContextKeyBool(c, constant.ContextKeyPlayground))
			assert.Equal(t, 42, c.GetInt("id"))
			assert.Equal(t, "playground-default", c.GetString("token_name"))
			assert.Equal(t, "default", common.GetContextKeyString(c, constant.ContextKeyUsingGroup))
			assert.Zero(t, c.GetInt("token_id"))
			c.Status(http.StatusNoContent)
		},
	)

	request := httptest.NewRequest(http.MethodPost, "/pg/audio/speech", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusNoContent, response.Code)
}

func TestSetupPlaygroundRelayRejectsDashboardPAT(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST(
		"/pg/chat/completions",
		func(c *gin.Context) {
			c.Set("id", 42)
			c.Set("use_access_token", true)
			c.Next()
		},
		SetupPlaygroundRelay(),
		func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		},
	)

	request := httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	assert.Equal(t, http.StatusForbidden, response.Code)
}
