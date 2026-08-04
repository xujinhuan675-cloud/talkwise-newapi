package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/require"
)

func TestDoubaoVoiceOnlyAdvertisesVoiceEndpoint(t *testing.T) {
	require.Equal(
		t,
		[]constant.EndpointType{constant.EndpointTypeOpenAIVoice},
		GetEndpointTypesByChannelType(constant.ChannelTypeDoubaoVoice, "seed-tts-2.0"),
	)
}
