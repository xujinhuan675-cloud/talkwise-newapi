package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRetiredFrontendAPIRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	routes := make(map[string]struct{}, len(engine.Routes()))
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = struct{}{}
	}
	_, hasAsyncCleanup := routes[http.MethodPost+" /api/system-task/log-cleanup"]
	_, hasDirectDelete := routes[http.MethodDelete+" /api/log/"]
	_, hasConsoleMigration := routes[http.MethodPost+" /api/option/migrate_console_setting"]
	assert.True(t, hasAsyncCleanup)
	assert.False(t, hasDirectDelete)
	assert.False(t, hasConsoleMigration)
}

func TestTalkWisePersonaProxyRoutesRequireDashboardAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	for _, testCase := range []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/talkwise/personas"},
		{method: http.MethodGet, path: "/api/talkwise/personas/cfo"},
		{method: http.MethodPost, path: "/api/talkwise/persona-builder/detect-speakers"},
		{method: http.MethodPost, path: "/api/talkwise/persona-builder/build"},
	} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(testCase.method, testCase.path, nil)

		engine.ServeHTTP(recorder, request)

		assert.Equal(t, http.StatusUnauthorized, recorder.Code, testCase.method+" "+testCase.path)
	}
}
