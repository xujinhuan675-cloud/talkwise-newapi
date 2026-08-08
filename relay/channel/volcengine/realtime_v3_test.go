package volcengine

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildRealtimeStartSessionPayloadUsesOfficialShape(t *testing.T) {
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "1.2.1.1",
			ChannelOtherSettings: dto.ChannelOtherSettings{
				VolcengineVoice: "zh_female_vv_uranus_bigtts",
			},
		},
	}
	payload, err := buildRealtimeStartSessionPayload(info, dto.RealtimeSession{Instructions: "你是沟通训练教练"})
	require.NoError(t, err)
	var value map[string]any
	require.NoError(t, json.Unmarshal(payload, &value))
	request := value["request"].(map[string]any)
	assert.Equal(t, "1.2.1.1", request["model_version"])
	assert.Equal(t, "pure-end-to-end", request["work_mode"])
	assert.Equal(t, "你是沟通训练教练", request["system_role"])
	audio := value["audio"].(map[string]any)
	assert.Equal(t, float64(defaultRealtimeSampleRate), audio["sample_rate"])
}

func TestExtractRealtimeTextSupportsASRAndChatPayloads(t *testing.T) {
	assert.Equal(t, "你好", extractRealtimeText([]byte(`{"results":[{"text":"你好"}]}`)))
	assert.Equal(t, "您好", extractRealtimeText([]byte(`{"content":"您好"}`)))
}

func TestMergeRealtimeASRHypothesisDoesNotAppendCumulativeFrames(t *testing.T) {
	current := ""
	assert.Equal(t, "呃", mergeRealtimeASRHypothesis(&current, "呃"))
	assert.Equal(t, "是", mergeRealtimeASRHypothesis(&current, "呃是"))
	assert.Equal(t, "这样的", mergeRealtimeASRHypothesis(&current, "呃是这样的"))
	assert.Equal(t, "呃是这样的", current)
	assert.Equal(t, "", mergeRealtimeASRHypothesis(&current, "呃是这样"))
	assert.Equal(t, "呃是这样", current)
}

func TestAddRealtimeAudioUsageSeparatesInputAndOutput(t *testing.T) {
	usage := &dto.RealtimeUsage{}
	addRealtimeAudioUsage(usage, defaultRealtimeSampleRate*2, defaultRealtimeSampleRate, true)
	addRealtimeAudioUsage(usage, defaultRealtimeOutputRate*2, defaultRealtimeOutputRate, false)
	assert.Equal(t, 17, usage.InputTokenDetails.AudioTokens)
	assert.Equal(t, 17, usage.OutputTokenDetails.AudioTokens)
	assert.Equal(t, 34, usage.TotalTokens)
}
