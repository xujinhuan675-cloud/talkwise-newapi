package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetSelfAddsOnlyExplicitTalkWiseTrainingTeamClaims(t *testing.T) {
	db := setupTalkWiseControllerTestDB(t)
	member := seedTalkWiseUser(t, db)
	withoutMembership := &model.User{
		Username: "bob", Password: "password", DisplayName: "Bob Li",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled,
		Group: "paid", AffCode: "aff-bob",
	}
	require.NoError(t, db.Create(withoutMembership).Error)
	team, err := model.CreateTrainingTeam("Revenue Enablement")
	require.NoError(t, err)
	_, err = model.AddTrainingTeamMember(team.Id, member.Id, model.TrainingTeamRoleAdmin)
	require.NoError(t, err)

	requestSelf := func(user *model.User) map[string]interface{} {
		router := gin.New()
		router.GET("/api/user/self", func(c *gin.Context) {
			c.Set("id", user.Id)
			c.Set("role", user.Role)
			GetSelf(c)
		})
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/user/self", nil))
		require.Equal(t, http.StatusOK, recorder.Code)
		response := decodeTalkWiseResponse[map[string]interface{}](t, recorder)
		require.True(t, response.Success, response.Message)
		return response.Data
	}

	memberData := requestSelf(member)
	assert.Equal(t, team.Id, memberData["team_id"])
	assert.Equal(t, team.Name, memberData["team_name"])
	assert.Equal(t, model.TrainingTeamRoleAdmin, memberData["team_role"])
	assert.Equal(t, "paid", memberData["group"])

	plainData := requestSelf(withoutMembership)
	assert.Equal(t, "paid", plainData["group"])
	assert.NotContains(t, plainData, "team_id")
	assert.NotContains(t, plainData, "team_name")
	assert.NotContains(t, plainData, "team_role")
}
