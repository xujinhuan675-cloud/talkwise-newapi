package controller

import (
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func Playground(c *gin.Context) {
	Relay(c, types.RelayFormatOpenAI)
}
