package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// TrainingTeamManageAuth allows platform administrators to manage any team and
// team owners/administrators to manage only the team in the request path.
func TrainingTeamManageAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		auditWriter, ok := prepareDashboardAuth(c, common.RoleCommonUser)
		if !ok {
			return
		}
		if c.GetInt("role") >= common.RoleAdminUser {
			if auditWriter == nil {
				auditWriter = beginAdminAudit(c)
			}
			c.Next()
			finishAdminAudit(c, auditWriter)
			return
		}

		team, membership, err := model.GetTrainingTeamForUser(c.GetInt("id"))
		if err != nil || team.Id != c.Param("teamId") ||
			(membership.Role != model.TrainingTeamRoleOwner && membership.Role != model.TrainingTeamRoleAdmin) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"success": false,
				"code":    "TRAINING_TEAM_MANAGEMENT_FORBIDDEN",
				"message": "Training team management requires a team owner or administrator role",
			})
			finishAdminAudit(c, auditWriter)
			return
		}
		c.Next()
		finishAdminAudit(c, auditWriter)
	}
}
