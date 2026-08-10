package volcengine

import (
	"bytes"
	"encoding/binary"
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

func TestRetainASRTranscriptKeepsEarlierTextWhenFinalFrameIsEmpty(t *testing.T) {
	text := retainASRTranscript("", map[string]any{"result": map[string]any{"text": "first hypothesis"}})
	text = retainASRTranscript(text, map[string]any{"result": map[string]any{}})

	assert.Equal(t, "first hypothesis", text)
}

func TestBuildASRResponseBodyAllowsEmptyTranscript(t *testing.T) {
	body, contentType, err := buildASRResponseBody("", "zh", 1, "json")

	require.NoError(t, err)
	assert.Equal(t, "application/json", contentType)
	assert.JSONEq(t, `{"text":""}`, string(body))
}

func TestPrepareASRStreamingAudioConvertsWAVToPCM(t *testing.T) {
	pcm := []byte{1, 0, 2, 0, 3, 0, 4, 0}
	wav := testPCM16WAV(t, 1, defaultASRSampleRate, pcm, true)

	prepared, format, err := prepareASRStreamingAudio(wav, "wav")

	require.NoError(t, err)
	assert.Equal(t, "pcm", format)
	assert.Equal(t, pcm, prepared)
}

func TestPrepareASRStreamingAudioRejectsIncompatibleWAV(t *testing.T) {
	wav := testPCM16WAV(t, 2, defaultASRSampleRate, []byte{1, 0, 2, 0}, false)

	_, _, err := prepareASRStreamingAudio(wav, "wav")

	require.ErrorContains(t, err, "PCM16, mono")
}

func testPCM16WAV(
	t *testing.T,
	channels uint16,
	sampleRate uint32,
	pcm []byte,
	includeJunkChunk bool,
) []byte {
	t.Helper()
	var chunks bytes.Buffer
	writeChunk := func(id string, payload []byte) {
		require.Len(t, id, 4)
		_, err := chunks.WriteString(id)
		require.NoError(t, err)
		require.NoError(t, binary.Write(&chunks, binary.LittleEndian, uint32(len(payload))))
		_, err = chunks.Write(payload)
		require.NoError(t, err)
		if len(payload)%2 != 0 {
			require.NoError(t, chunks.WriteByte(0))
		}
	}

	format := new(bytes.Buffer)
	require.NoError(t, binary.Write(format, binary.LittleEndian, uint16(1)))
	require.NoError(t, binary.Write(format, binary.LittleEndian, channels))
	require.NoError(t, binary.Write(format, binary.LittleEndian, sampleRate))
	byteRate := sampleRate * uint32(channels) * 2
	require.NoError(t, binary.Write(format, binary.LittleEndian, byteRate))
	require.NoError(t, binary.Write(format, binary.LittleEndian, channels*2))
	require.NoError(t, binary.Write(format, binary.LittleEndian, uint16(16)))
	writeChunk("fmt ", format.Bytes())
	if includeJunkChunk {
		writeChunk("JUNK", []byte{9, 8, 7})
	}
	writeChunk("data", pcm)

	var wav bytes.Buffer
	_, err := wav.WriteString("RIFF")
	require.NoError(t, err)
	require.NoError(t, binary.Write(&wav, binary.LittleEndian, uint32(chunks.Len()+4)))
	_, err = wav.WriteString("WAVE")
	require.NoError(t, err)
	_, err = wav.Write(chunks.Bytes())
	require.NoError(t, err)
	return wav.Bytes()
}
