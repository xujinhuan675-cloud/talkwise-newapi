package volcengine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeASRFormatRejectsWebMWithActionableMessage(t *testing.T) {
	_, err := normalizeASRFormat("recording.webm", "audio/webm")
	require.ErrorContains(t, err, "convert WebM")
}

func TestEncodeASRFrameIncludesNegativeFinalSequence(t *testing.T) {
	frame, err := encodeASRFrame(
		asrMessageAudioOnlyRequest,
		asrFlagNegativeSequence,
		asrSerializationNone,
		asrCompressionGzip,
		-2,
		[]byte{1, 2, 3},
	)
	require.NoError(t, err)
	assert.Equal(t, byte(0x23), frame[1])
	assert.Equal(t, byte(0x01), frame[2])
	assert.Equal(t, []byte{0xff, 0xff, 0xff, 0xfe}, frame[4:8])
}

func TestExtractASRDurationSupportsProviderNestedFields(t *testing.T) {
	assert.InDelta(t, 2.5, extractASRDuration(map[string]any{
		"audio_info": map[string]any{"duration": 2500},
	}), 0.001)
	assert.InDelta(t, 3.25, extractASRDuration(map[string]any{
		"result": map[string]any{"additions": map[string]any{"duration": "3.25"}},
	}), 0.001)
}

func TestExtractASRTextSupportsResultArray(t *testing.T) {
	text := extractASRText(map[string]any{"result": []any{map[string]any{"text": "测试文本"}}})
	assert.Equal(t, "测试文本", text)
}
