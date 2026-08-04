package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestGetDefaultEndpointInfoIncludesOpenAIVoice(t *testing.T) {
	info, ok := GetDefaultEndpointInfo(constant.EndpointTypeOpenAIVoice)

	require.True(t, ok)
	require.Equal(t, "/v1/audio/speech", info.Path)
	require.Equal(t, "POST", info.Method)
}
