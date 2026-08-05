package service

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

func TestEndpointTypesForAbilityHonorsChannelOverride(t *testing.T) {
	voiceAbility := model.AbilityWithChannel{
		Ability:         model.Ability{Model: "gpt-realtime-2.1"},
		ChannelType:     constant.ChannelTypeOpenAI,
		ChannelSettings: `{"supported_endpoint_types":["openai-voice"]}`,
	}
	textAbility := model.AbilityWithChannel{
		Ability:     model.Ability{Model: "gpt-4o"},
		ChannelType: constant.ChannelTypeOpenAI,
	}

	assert.Equal(
		t,
		[]constant.EndpointType{constant.EndpointTypeOpenAIVoice},
		endpointTypesForAbility(voiceAbility),
	)
	assert.Equal(
		t,
		[]constant.EndpointType{constant.EndpointTypeOpenAI},
		endpointTypesForAbility(textAbility),
	)
}
