package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestTalkWiseTrainingTeamAdminRoutesRequireDashboardAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	for _, testCase := range []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/talkwise/admin/users/1/training-team"},
		{method: http.MethodGet, path: "/api/talkwise/admin/teams"},
		{method: http.MethodPost, path: "/api/talkwise/admin/teams"},
		{method: http.MethodPut, path: "/api/talkwise/admin/teams/team-1"},
		{method: http.MethodDelete, path: "/api/talkwise/admin/teams/team-1"},
		{method: http.MethodGet, path: "/api/talkwise/admin/teams/team-1/members"},
		{method: http.MethodGet, path: "/api/talkwise/admin/teams/team-1/users/search?keyword=alice"},
		{method: http.MethodPost, path: "/api/talkwise/admin/teams/team-1/members"},
		{method: http.MethodDelete, path: "/api/talkwise/admin/teams/team-1/members/1"},
	} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(testCase.method, testCase.path, nil)

		engine.ServeHTTP(recorder, request)

		assert.Equal(t, http.StatusUnauthorized, recorder.Code, testCase.method+" "+testCase.path)
	}
}
