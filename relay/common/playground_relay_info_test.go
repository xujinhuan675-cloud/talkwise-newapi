package common

import (
	"net/http/httptest"
	"testing"

	basecommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestGenRelayInfoKeepsRewrittenPlaygroundRequestUserBilled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/audio/speech", nil)
	basecommon.SetContextKey(c, constant.ContextKeyPlayground, true)
	basecommon.SetContextKey(c, constant.ContextKeyUserId, 42)
	basecommon.SetContextKey(c, constant.ContextKeyUsingGroup, "default")

	info := GenRelayInfoOpenAI(c, nil)

	assert.True(t, info.IsPlayground)
	assert.Equal(t, 42, info.UserId)
	assert.Equal(t, "/v1/audio/speech", info.RequestURLPath)
}
