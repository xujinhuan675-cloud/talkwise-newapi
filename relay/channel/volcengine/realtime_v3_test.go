package volcengine

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
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
	assert.NotContains(t, value, "request")
	assert.NotContains(t, value, "audio")
	asr := value["asr"].(map[string]any)
	audioInfo := asr["audio_info"].(map[string]any)
	assert.Equal(t, "pcm", audioInfo["format"])
	assert.Equal(t, float64(defaultRealtimeSampleRate), audioInfo["sample_rate"])
	assert.Equal(t, float64(1), audioInfo["channel"])
	tts := value["tts"].(map[string]any)
	audioConfig := tts["audio_config"].(map[string]any)
	assert.Equal(t, "pcm_s16le", audioConfig["format"])
	assert.Equal(t, float64(defaultRealtimeOutputRate), audioConfig["sample_rate"])
	dialog := value["dialog"].(map[string]any)
	assert.Equal(t, "你是沟通训练教练", dialog["system_role"])
	dialogExtra := dialog["extra"].(map[string]any)
	assert.Equal(t, "1.2.1.1", dialogExtra["model"])
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

func TestDetectRealtimeAudioMimeTypeUsesContainerMagic(t *testing.T) {
	assert.Equal(t, "audio/ogg; codecs=opus", detectRealtimeAudioMimeType([]byte("OggS\x00\x02")))
	assert.Equal(t, "audio/wav", detectRealtimeAudioMimeType([]byte("RIFF\x00\x00\x00\x00WAVE")))
	assert.Equal(t, "audio/pcm", detectRealtimeAudioMimeType([]byte{0, 1, 2, 3}))
}

func TestFinalizeRealtimeTurnAccumulatesWithoutStreamingCharge(t *testing.T) {
	state := &realtimeV3SessionState{
		turnUsage: dto.RealtimeUsage{
			TotalTokens: 17,
			InputTokens: 17,
		},
	}

	finalizeRealtimeTurn(state)

	assert.Equal(t, 17, state.totalUsage.TotalTokens)
	assert.Equal(t, 17, state.totalUsage.InputTokens)
	assert.Zero(t, state.turnUsage.TotalTokens)
}

func TestHandleRealtimeProviderEventStreamsPCMBeforeTTSEnded(t *testing.T) {
	serverConn, clientConn := testRealtimeWebsocketPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		ClientWs: serverConn,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: defaultRealtimeModel,
		},
	}
	state := &realtimeV3SessionState{
		sessionID:        "session-test",
		activeQuestionID: "question-1",
		activeResponseID: "reply-1",
	}
	state.assistantText.WriteString("complete reply")
	first := []byte{0x00, 0x01, 0x02, 0x03}
	last := []byte{0x04, 0x05, 0x06, 0x07}

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSResponse,
		Payload:   first,
	}))
	firstAudioEvent := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.audio.delta", firstAudioEvent["type"])
	assert.Equal(t, "audio/pcm", firstAudioEvent["mime_type"])
	firstDecoded, err := base64.StdEncoding.DecodeString(firstAudioEvent["delta"].(string))
	require.NoError(t, err)
	assert.Equal(t, first, firstDecoded)

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ChatEnded,
		Payload:   []byte(`{"question_id":"question-1","reply_id":"reply-1"}`),
	}))
	assert.Equal(t, "complete reply", state.assistantText.String())
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSResponse,
		Payload:   last,
	}))
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-1","reply_id":"reply-1"}`),
	}))

	lastAudioEvent := readRealtimeJSON(t, clientConn)
	transcriptEvent := readRealtimeJSON(t, clientConn)
	audioDoneEvent := readRealtimeJSON(t, clientConn)
	responseDoneEvent := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.audio.delta", lastAudioEvent["type"])
	assert.Equal(t, "reply-1", lastAudioEvent["response_id"])
	assert.Equal(t, "reply-1", lastAudioEvent["provider_response_id"])
	decoded, err := base64.StdEncoding.DecodeString(lastAudioEvent["delta"].(string))
	require.NoError(t, err)
	assert.Equal(t, last, decoded)
	assert.Equal(t, "response.audio_transcript.done", transcriptEvent["type"])
	assert.Equal(t, "complete reply", transcriptEvent["transcript"])
	assert.Equal(t, "reply-1", transcriptEvent["response_id"])
	assert.Equal(t, "response.audio.done", audioDoneEvent["type"])
	assert.Equal(t, "response.done", responseDoneEvent["type"])
	assert.Empty(t, state.assistantText.String())
}

func TestHandleRealtimeProviderEventDropsInterruptedAssistantTail(t *testing.T) {
	serverConn, clientConn := testRealtimeWebsocketPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{ClientWs: serverConn}
	state := &realtimeV3SessionState{
		sessionID:        "session-test",
		activeQuestionID: "question-old",
		activeResponseID: "reply-old",
	}
	state.assistantText.WriteString("must not be persisted")

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_AudioMuted,
	}))
	interrupted := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.interrupted", interrupted["type"])
	assert.Equal(t, "provider_barge_in", interrupted["reason"])
	assert.True(t, state.responseInterrupted)
	assert.Empty(t, state.assistantText.String())

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSResponse,
		Payload:   []byte{0x00, 0x01},
	}))
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ChatResponse,
		Payload:   []byte(`{"content":"stale tail","question_id":"question-old","reply_id":"reply-old"}`),
	}))
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-old","reply_id":"reply-old"}`),
	}))
	cancelDone := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.cancel.done", cancelDone["type"])
	assert.Equal(t, "reply-old", cancelDone["provider_response_id"])
	assert.False(t, state.responseInterrupted)
	assert.Empty(t, state.assistantText.String())
}

func TestHandleRealtimeProviderEventAcceptsNextResponseAfterInterruptedUserTurn(t *testing.T) {
	serverConn, clientConn := testRealtimeWebsocketPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		ClientWs: serverConn,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: defaultRealtimeModel,
		},
	}
	state := &realtimeV3SessionState{
		sessionID:        "session-test",
		activeQuestionID: "question-old",
		activeResponseID: "reply-old",
	}
	state.assistantText.WriteString("interrupted reply")

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_AudioMuted}))
	assert.Equal(t, "response.interrupted", readRealtimeJSON(t, clientConn)["type"])

	// The provider can omit TTSEnded after muting. Old tail frames remain gated
	// until the new user's final ASR event establishes the next turn boundary.
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSResponse,
		Payload:   []byte{0x00, 0x01},
	}))
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ASRResponse,
		Payload:   []byte(`{"results":[{"text":"next question"}]}`),
	}))
	assert.Equal(t, "conversation.item.input_audio_transcription.delta", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_ASREnded}))
	completed := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "conversation.item.input_audio_transcription.completed", completed["type"])
	assert.Equal(t, "next question", completed["transcript"])
	assert.False(t, state.responseInterrupted)

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ChatResponse,
		Payload:   []byte(`{"content":"next reply","question_id":"question-new","reply_id":"reply-new"}`),
	}))
	transcriptDelta := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.audio_transcript.delta", transcriptDelta["type"])
	assert.Equal(t, "next reply", transcriptDelta["delta"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSResponse,
		Payload:   []byte{0x00, 0x01},
	}))
	assert.Equal(t, "response.audio.delta", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-new","reply_id":"reply-new"}`),
	}))
	assert.Equal(t, "response.audio_transcript.done", readRealtimeJSON(t, clientConn)["type"])
	assert.Equal(t, "response.audio.done", readRealtimeJSON(t, clientConn)["type"])
	assert.Equal(t, "response.done", readRealtimeJSON(t, clientConn)["type"])
}

func TestHandleRealtimeProviderEventDropsDelayedInterruptedEndAfterASR(t *testing.T) {
	serverConn, clientConn := testRealtimeWebsocketPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		ClientWs: serverConn,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: defaultRealtimeModel,
		},
	}
	state := &realtimeV3SessionState{
		sessionID:        "session-test",
		activeQuestionID: "question-old",
		activeResponseID: "reply-old",
	}

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_AudioMuted}))
	assert.Equal(t, "response.interrupted", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ASRResponse,
		Payload:   []byte(`{"results":[{"text":"next question"}]}`),
	}))
	assert.Equal(t, "conversation.item.input_audio_transcription.delta", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_ASREnded}))
	assert.Equal(t, "conversation.item.input_audio_transcription.completed", readRealtimeJSON(t, clientConn)["type"])
	assert.True(t, state.awaitingResponseAfterCut)
	turnTokens := state.turnUsage.TotalTokens
	require.Positive(t, turnTokens)

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-old","reply_id":"reply-old"}`),
	}))
	assert.Equal(t, "response.cancel.done", readRealtimeJSON(t, clientConn)["type"])
	assert.True(t, state.awaitingResponseAfterCut)
	assert.Equal(t, turnTokens, state.turnUsage.TotalTokens)
	assert.Zero(t, state.totalUsage.TotalTokens)

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ChatResponse,
		Payload:   []byte(`{"content":"next reply","question_id":"question-new","reply_id":"reply-new"}`),
	}))
	assert.Equal(t, "response.audio_transcript.delta", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSResponse,
		Payload:   []byte{0x00, 0x01},
	}))
	assert.Equal(t, "response.audio.delta", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-new","reply_id":"reply-new"}`),
	}))
	assert.Equal(t, "response.audio_transcript.done", readRealtimeJSON(t, clientConn)["type"])
	assert.Equal(t, "response.audio.done", readRealtimeJSON(t, clientConn)["type"])
	assert.Equal(t, "response.done", readRealtimeJSON(t, clientConn)["type"])
	assert.Greater(t, state.totalUsage.TotalTokens, turnTokens)
}

func TestHandleRealtimeProviderEventUsesReplyIDForLateEndAfterNewResponse(t *testing.T) {
	serverConn, clientConn := testRealtimeWebsocketPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		ClientWs: serverConn,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: defaultRealtimeModel,
		},
	}
	state := &realtimeV3SessionState{
		sessionID:        "session-test",
		activeQuestionID: "question-old",
		activeResponseID: "reply-old",
		turnUsage:        dto.RealtimeUsage{TotalTokens: 7, OutputTokens: 7},
	}
	state.assistantText.WriteString("old reply")

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_AudioMuted}))
	assert.Equal(t, "response.interrupted", readRealtimeJSON(t, clientConn)["type"])
	assert.Equal(t, 7, state.totalUsage.TotalTokens)
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ASRResponse,
		Payload:   []byte(`{"results":[{"text":"next question"}]}`),
	}))
	assert.Equal(t, "conversation.item.input_audio_transcription.delta", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_ASREnded}))
	assert.Equal(t, "conversation.item.input_audio_transcription.completed", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_ChatResponse,
		Payload:   []byte(`{"content":"new reply","question_id":"question-new","reply_id":"reply-new"}`),
	}))
	assert.Equal(t, "response.audio_transcript.delta", readRealtimeJSON(t, clientConn)["type"])

	newTurnTokens := state.turnUsage.TotalTokens
	require.Positive(t, newTurnTokens)
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-old","reply_id":"reply-old"}`),
	}))
	cancelDone := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.cancel.done", cancelDone["type"])
	assert.Equal(t, "reply-old", cancelDone["provider_response_id"])
	assert.Equal(t, "new reply", state.assistantText.String())
	assert.Equal(t, newTurnTokens, state.turnUsage.TotalTokens)
	assert.Equal(t, 7, state.totalUsage.TotalTokens)

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSResponse,
		Payload:   []byte{0x00, 0x01},
	}))
	audio := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.audio.delta", audio["type"])
	assert.Equal(t, "reply-new", audio["provider_response_id"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-new","reply_id":"reply-new"}`),
	}))
	transcriptDone := readRealtimeJSON(t, clientConn)
	audioDone := readRealtimeJSON(t, clientConn)
	responseDone := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.audio_transcript.done", transcriptDone["type"])
	assert.Equal(t, "new reply", transcriptDone["transcript"])
	assert.Equal(t, "reply-new", transcriptDone["response_id"])
	assert.Equal(t, "response.audio.done", audioDone["type"])
	assert.Equal(t, "response.done", responseDone["type"])
	finalUsage := state.totalUsage

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_TTSEnded,
		Payload:   []byte(`{"question_id":"question-new","reply_id":"reply-new"}`),
	}))
	assert.Equal(t, finalUsage, state.totalUsage)
	assertNoRealtimeJSON(t, clientConn)
}

func TestHandleRealtimeProviderEventFailsClosedOnUnidentifiedOrMismatchedEnd(t *testing.T) {
	tests := []struct {
		name    string
		payload []byte
		reason  string
	}{
		{name: "missing response id", payload: []byte(`{}`), reason: "missing_response_id"},
		{
			name:    "mismatched response id",
			payload: []byte(`{"question_id":"question-other","reply_id":"reply-other"}`),
			reason:  "response_id_mismatch",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			serverConn, clientConn := testRealtimeWebsocketPair(t)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			info := &relaycommon.RelayInfo{ClientWs: serverConn}
			state := &realtimeV3SessionState{
				sessionID:        "session-test",
				activeQuestionID: "question-new",
				activeResponseID: "reply-new",
			}
			state.assistantText.WriteString("must not persist")

			require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{
				EventType: EventType_TTSEnded,
				Payload:   test.payload,
			}))
			interrupted := readRealtimeJSON(t, clientConn)
			desync := readRealtimeJSON(t, clientConn)
			assert.Equal(t, "response.interrupted", interrupted["type"])
			assert.Equal(t, "realtime_turn_desync", interrupted["reason"])
			assert.Equal(t, "error", desync["type"])
			assert.Equal(t, "REALTIME_TURN_DESYNC", desync["code"])
			assert.Equal(t, "protocol_desync", desync["errorCategory"])
			assert.Equal(t, test.reason, desync["metadata"].(map[string]any)["reason"])
			assert.True(t, state.desynced)
			assert.Empty(t, state.assistantText.String())
			assert.Zero(t, state.totalUsage.TotalTokens)
		})
	}
}

func TestHandleRealtimeProviderEventKeepsIdentityGateCancelableOnProviderClose(t *testing.T) {
	serverConn, clientConn := testRealtimeWebsocketPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{ClientWs: serverConn}
	state := &realtimeV3SessionState{
		activeQuestionID: "question-old",
		activeResponseID: "reply-old",
	}

	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_AudioMuted}))
	assert.Equal(t, "response.interrupted", readRealtimeJSON(t, clientConn)["type"])
	require.NoError(t, handleRealtimeProviderEvent(c, info, state, &Message{EventType: EventType_SessionFinished}))
	assert.True(t, state.awaitingResponseAfterCut)

	err := handleRealtimeProviderEvent(c, info, state, &Message{
		EventType: EventType_SessionFailed,
		ErrorCode: 500001,
		Payload:   []byte(`{"message":"provider failed"}`),
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "provider failed")
}

func TestHandleRealtimeClientCancelUsesLocalTailGate(t *testing.T) {
	serverConn, clientConn := testRealtimeWebsocketPair(t)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{ClientWs: serverConn}
	state := &realtimeV3SessionState{sessionID: "session-test"}
	state.assistantText.WriteString("partial reply")

	require.NoError(t, handleRealtimeClientEvent(
		c,
		info,
		state,
		[]byte(`{"type":"response.cancel"}`),
	))
	cancelled := readRealtimeJSON(t, clientConn)
	assert.Equal(t, "response.cancelled", cancelled["type"])
	assert.True(t, state.responseInterrupted)
	assert.Empty(t, state.assistantText.String())
}

func TestEmitRealtimeAudioRejectsEncodedProviderOutput(t *testing.T) {
	tests := []struct {
		name     string
		audio    []byte
		mimeType string
	}{
		{name: "ogg opus", audio: []byte("OggS\x00\x02"), mimeType: "audio/ogg"},
		{name: "wav", audio: []byte("RIFF\x00\x00\x00\x00WAVE"), mimeType: "audio/wav"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			err := emitRealtimeAudio(
				c,
				&relaycommon.RelayInfo{},
				&realtimeV3SessionState{},
				test.audio,
				realtimeV3ResponseIdentity{responseID: "reply-1"},
			)

			require.Error(t, err)
			assert.Contains(t, err.Error(), "requested pcm_s16le but received "+test.mimeType)
		})
	}
}

func TestHandleRealtimeProviderEventRejectsSessionFailure(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	err := handleRealtimeProviderEvent(c, &relaycommon.RelayInfo{}, &realtimeV3SessionState{}, &Message{
		EventType: EventType_SessionFailed,
		ErrorCode: 400001,
		Payload:   []byte(`{"message":"invalid voice"}`),
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid voice")
}

func TestRealtimeV3RelayErrorPreservesProviderErrorAfterClientClose(t *testing.T) {
	providerErr := errors.New("provider failed")

	err := realtimeV3RelayError([]realtimeV3WorkerResult{
		{source: realtimeV3ClientWorker},
		{source: realtimeV3ProviderWorker, err: providerErr},
	})

	require.ErrorIs(t, err, providerErr)
}

func TestHandleRealtimeV3SurfacesProviderFailureBeforeWorkerExit(t *testing.T) {
	relayClient, browser := testRealtimeWebsocketPair(t)
	relayTarget, provider := testRealtimeWebsocketPair(t)
	require.NoError(t, browser.SetReadDeadline(time.Now().Add(3*time.Second)))
	require.NoError(t, provider.SetReadDeadline(time.Now().Add(3*time.Second)))

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		ClientWs:        relayClient,
		TargetWs:        relayTarget,
		OriginModelName: defaultRealtimeModel,
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: defaultRealtimeModel,
		},
	}
	type relayResult struct {
		usage any
		err   error
	}
	done := make(chan relayResult, 1)
	go func() {
		usage, relayErr := handleRealtimeV3(c, info)
		var err error
		if relayErr != nil {
			err = relayErr
		}
		done <- relayResult{usage: usage, err: err}
	}()

	startConnection, err := ReceiveMessage(provider)
	require.NoError(t, err)
	assert.Equal(t, EventType_StartConnection, startConnection.EventType)
	connectionStarted, err := NewMessage(MsgTypeFullServerResponse, MsgTypeFlagWithEvent)
	require.NoError(t, err)
	connectionStarted.EventType = EventType_ConnectionStarted
	connectionStarted.Payload = []byte(`{}`)
	connectionStartedFrame, err := connectionStarted.Marshal()
	require.NoError(t, err)
	// Provider connection events include a connect_id field before the payload.
	connectionStartedFrame = append(connectionStartedFrame[:8], append([]byte{0, 0, 0, 0}, connectionStartedFrame[8:]...)...)
	require.NoError(t, provider.WriteMessage(websocket.BinaryMessage, connectionStartedFrame))
	select {
	case result := <-done:
		require.Failf(t, "realtime relay returned before session creation", "usage=%v err=%v", result.usage, result.err)
	default:
	}
	assert.Equal(t, "session.created", readRealtimeJSON(t, browser)["type"])
	require.NoError(t, browser.WriteJSON(map[string]any{
		"type": "session.update",
		"session": map[string]any{
			"instructions": "coach",
		},
	}))

	startSession, err := ReceiveMessage(provider)
	require.NoError(t, err)
	assert.Equal(t, EventType_StartSession, startSession.EventType)
	require.NoError(t, sendRealtimeProtocolEvent(
		provider,
		MsgTypeFullServerResponse,
		EventType_SessionFailed,
		startSession.SessionID,
		[]byte(`{"message":"invalid voice"}`),
	))

	errorEvent := readRealtimeJSON(t, browser)
	assert.Equal(t, "error", errorEvent["type"])
	errorDetail, ok := errorEvent["error"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "volcengine_realtime_error", errorDetail["code"])

	select {
	case result := <-done:
		require.NoError(t, result.err)
		require.NotNil(t, result.usage)
	case <-time.After(3 * time.Second):
		require.Fail(t, "realtime relay did not return after provider failure")
	}
}

func testRealtimeWebsocketPair(t *testing.T) (*websocket.Conn, *websocket.Conn) {
	t.Helper()
	serverConn := make(chan *websocket.Conn, 1)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		serverConn <- conn
	}))
	t.Cleanup(server.Close)

	url := "ws" + strings.TrimPrefix(server.URL, "http")
	client, _, err := websocket.DefaultDialer.Dial(url, nil)
	require.NoError(t, err)
	serverSide := <-serverConn
	t.Cleanup(func() {
		_ = serverSide.Close()
		_ = client.Close()
	})
	return serverSide, client
}

func readRealtimeJSON(t *testing.T, conn *websocket.Conn) map[string]any {
	t.Helper()
	var value map[string]any
	require.NoError(t, conn.ReadJSON(&value))
	return value
}

func assertNoRealtimeJSON(t *testing.T, conn *websocket.Conn) {
	t.Helper()
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(50*time.Millisecond)))
	_, _, err := conn.ReadMessage()
	require.Error(t, err)
}
