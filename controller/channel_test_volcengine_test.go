package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	volcenginechannel "github.com/QuantumNous/new-api/relay/channel/volcengine"
	"github.com/stretchr/testify/assert"
)

func TestIsVolcengineSpeechChannel(t *testing.T) {
	tests := []struct {
		name     string
		channel  *model.Channel
		expected bool
	}{
		{name: "nil channel", channel: nil, expected: false},
		{name: "different channel type", channel: &model.Channel{Type: constant.ChannelTypeOpenAI}, expected: false},
		{name: "ark", channel: volcengineTestChannel(volcenginechannel.ServiceModeArk), expected: false},
		{name: "unified voice", channel: volcengineTestChannel(volcenginechannel.ServiceModeVoiceV3), expected: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.expected, isVolcengineSpeechChannel(test.channel))
		})
	}
}

func TestResolveVolcengineVoiceProbeMode(t *testing.T) {
	assert.Equal(
		t,
		volcenginechannel.RouteTTSV3,
		volcenginechannel.ResolveServiceModeForModel(
			volcenginechannel.ServiceModeVoiceV3,
			"seed-tts-2.0",
		),
	)
	assert.Equal(
		t,
		volcenginechannel.RouteASRV3,
		volcenginechannel.ResolveServiceModeForModel(
			volcenginechannel.ServiceModeVoiceV3,
			"volc.bigasr.sauc.duration",
		),
	)
	assert.Equal(
		t,
		volcenginechannel.RouteRealtimeV3,
		volcenginechannel.ResolveServiceModeForModel(
			volcenginechannel.ServiceModeVoiceV3,
			"1.2.1.1",
		),
	)
}

func volcengineTestChannel(serviceMode string) *model.Channel {
	return &model.Channel{
		Type:          constant.ChannelTypeVolcEngine,
		OtherSettings: `{"volcengine_service_mode":"` + serviceMode + `"}`,
	}
}
