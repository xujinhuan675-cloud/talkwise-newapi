package controller

import (
	"mime"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/require"

	"github.com/gin-gonic/gin"
)

func TestResolveOpenAIVoiceTestPath(t *testing.T) {
	require.Equal(t, "/v1/audio/transcriptions", resolveOpenAIVoiceTestPath("whisper-1"))
	require.Equal(t, "/v1/audio/transcriptions", resolveOpenAIVoiceTestPath("gpt-4o-transcribe"))
	require.Equal(t, "/v1/audio/speech", resolveOpenAIVoiceTestPath("tts-1"))
	require.Equal(t, "/v1/audio/speech", resolveOpenAIVoiceTestPath("gpt-4o-mini-tts"))
}

func TestOpenAIVoiceRealtimeModelDetection(t *testing.T) {
	require.True(t, isOpenAIVoiceRealtimeModel("gpt-realtime-2.1"))
	require.True(t, isOpenAIVoiceRealtimeModel("gpt-live-transcribe"))
	require.False(t, isOpenAIVoiceRealtimeModel("gpt-4o-mini-transcribe"))
}

func TestBuildTestRequestForOpenAIVoice(t *testing.T) {
	transcriptionRequest, ok := buildTestRequest(
		"whisper-1",
		string(constant.EndpointTypeOpenAIVoice),
		nil,
		false,
	).(*dto.AudioRequest)
	require.True(t, ok)
	require.Equal(t, "json", transcriptionRequest.ResponseFormat)

	speechRequest, ok := buildTestRequest(
		"tts-1",
		string(constant.EndpointTypeOpenAIVoice),
		nil,
		false,
	).(*dto.AudioRequest)
	require.True(t, ok)
	require.Equal(t, "alloy", speechRequest.Voice)
	require.Equal(t, "mp3", speechRequest.ResponseFormat)
}

func TestPrepareOpenAIVoiceTranscriptionRequest(t *testing.T) {
	context := httptest.NewRequest("POST", "/v1/audio/transcriptions", nil)
	context.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	ginContext, _ := gin.CreateTestContext(recorder)
	ginContext.Request = context

	err := prepareOpenAIVoiceTestRequest(
		ginContext,
		string(constant.EndpointTypeOpenAIVoice),
		"whisper-1",
	)

	require.NoError(t, err)
	contentType, params, err := mime.ParseMediaType(ginContext.Request.Header.Get("Content-Type"))
	require.NoError(t, err)
	require.Equal(t, "multipart/form-data", contentType)

	form, err := multipart.NewReader(
		ginContext.Request.Body,
		params["boundary"],
	).ReadForm(1 << 20)
	require.NoError(t, err)
	require.Equal(t, []string{"whisper-1"}, form.Value["model"])
	require.Len(t, form.File["file"], 1)
	require.Equal(t, "channel-test.wav", form.File["file"][0].Filename)
}

func TestBuildTestRequestForOpenAIVoiceUsesAudioRelayModes(t *testing.T) {
	require.Equal(t, relayconstant.RelayModeAudioSpeech, relayconstant.Path2RelayMode("/v1/audio/speech"))
	require.Equal(t, relayconstant.RelayModeAudioTranscription, relayconstant.Path2RelayMode("/v1/audio/transcriptions"))
	require.IsType(t, &dto.AudioRequest{}, buildTestRequest(
		"tts-1",
		string(constant.EndpointTypeOpenAIVoice),
		nil,
		false,
	))
	require.IsType(t, &dto.AudioRequest{}, buildTestRequest(
		"whisper-1",
		string(constant.EndpointTypeOpenAIVoice),
		nil,
		false,
	))
}
