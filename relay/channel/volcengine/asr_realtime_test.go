package volcengine

import (
	"encoding/base64"
	"encoding/binary"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestASRRealtimeTranscriptDeltaHandlesCumulativeAndRevisedText(t *testing.T) {
	assert.Equal(t, " world", asrRealtimeTranscriptDelta("hello", "hello world"))
	assert.Equal(t, "revised", asrRealtimeTranscriptDelta("hello", "revised"))
}

func TestFlushASRRealtimeAudioKeepsFinalChunkUntilCommit(t *testing.T) {
	server, client := testRealtimeWebsocketPair(t)
	state := &asrRealtimeState{provider: server, sequence: 2, pendingAudio: make([]byte, asrChunkSize+8)}

	received := make(chan [][]byte, 1)
	go func() {
		frames := make([][]byte, 0, 2)
		for len(frames) < 2 {
			_, raw, err := client.ReadMessage()
			if err != nil {
				return
			}
			frames = append(frames, raw)
		}
		received <- frames
	}()

	require.NoError(t, flushASRRealtimeAudio(state, false))
	assert.Len(t, state.pendingAudio, 8)
	require.NoError(t, flushASRRealtimeAudio(state, true))

	select {
	case frames := <-received:
		require.Len(t, frames, 2)
		assert.Equal(t, byte(asrFlagPositiveSequence), frames[0][1]&0x0f)
		assert.Equal(t, int32(2), int32(binary.BigEndian.Uint32(frames[0][4:8])))
		assert.Equal(t, byte(asrFlagNegativeSequence), frames[1][1]&0x0f)
		assert.Equal(t, int32(-3), int32(binary.BigEndian.Uint32(frames[1][4:8])))
	case <-time.After(time.Second):
		require.Fail(t, "timed out waiting for ASR audio frames")
	}
}

func TestHandleASRRealtimeRelaysIncrementalAndFinalTranscripts(t *testing.T) {
	provider := testASRRealtimeProvider(t)
	relayClient, browser := testRealtimeWebsocketPair(t)

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/pg/realtime", nil)
	c.Set(common.RequestIdKey, "asr-realtime-test")
	info := &relaycommon.RelayInfo{
		ClientWs: relayClient,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelBaseUrl:    provider,
			ApiKey:            "test-provider-secret",
			UpstreamModelName: defaultASRResourceID,
		},
		OriginModelName: defaultASRResourceID,
	}

	type result struct {
		usage any
		err   error
	}
	done := make(chan result, 1)
	go func() {
		usage, relayErr := handleASRRealtime(c, info)
		if relayErr != nil {
			done <- result{usage: usage, err: relayErr}
			return
		}
		done <- result{usage: usage}
	}()

	created := readRealtimeJSON(t, browser)
	assert.Equal(t, "transcription_session.created", created["type"])
	require.NoError(t, browser.WriteJSON(map[string]any{
		"type": "transcription_session.update",
		"session": map[string]any{
			"input_audio_format":        "pcm16",
			"input_audio_transcription": map[string]any{"language": "zh-CN"},
		},
	}))
	updated := readRealtimeJSON(t, browser)
	assert.Equal(t, "transcription_session.updated", updated["type"])

	audio := make([]byte, asrChunkSize+32)
	require.NoError(t, browser.WriteJSON(map[string]any{
		"type":  "input_audio_buffer.append",
		"audio": base64.StdEncoding.EncodeToString(audio),
	}))
	require.NoError(t, browser.WriteJSON(map[string]any{"type": "input_audio_buffer.commit"}))

	events := map[string]map[string]any{}
	for len(events) < 3 {
		event := readRealtimeJSON(t, browser)
		eventType, _ := event["type"].(string)
		if eventType == "input_audio_buffer.committed" ||
			eventType == "conversation.item.input_audio_transcription.delta" ||
			eventType == "conversation.item.input_audio_transcription.completed" {
			events[eventType] = event
		}
	}
	assert.Equal(t, "你好世界", events["conversation.item.input_audio_transcription.completed"]["transcript"])
	assert.Equal(t, "你好世界", events["conversation.item.input_audio_transcription.delta"]["transcript"])

	require.NoError(t, browser.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, "done")))
	select {
	case relayResult := <-done:
		require.NoError(t, relayResult.err)
		require.NotNil(t, relayResult.usage)
	case <-time.After(2 * time.Second):
		require.Fail(t, "ASR realtime relay did not close")
	}
}

func testASRRealtimeProvider(t *testing.T) string {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "test-provider-secret", r.Header.Get("X-Api-Key"))
		assert.Equal(t, defaultASRResourceID, r.Header.Get("X-Api-Resource-Id"))
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		_, _, err = conn.ReadMessage()
		if err != nil {
			return
		}
		partialSent := false
		for {
			_, raw, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}
			flags := int(raw[1] & 0x0f)
			if !partialSent {
				partialSent = true
				writeTestASRProviderFrame(t, conn, asrFlagPositiveSequence, 2, `{"result":{"text":"你好"}}`)
			}
			if flags == asrFlagNegativeSequence {
				writeTestASRProviderFrame(t, conn, asrFlagNegativeSequence, -3, `{"result":{"text":"你好世界"},"is_final":true}`)
				return
			}
		}
	}))
	t.Cleanup(server.Close)
	return "ws" + strings.TrimPrefix(server.URL, "http")
}

func writeTestASRProviderFrame(t *testing.T, conn *websocket.Conn, flags int, sequence int32, payload string) {
	t.Helper()
	frame, err := encodeASRFrame(asrMessageFullServerResponse, flags, asrSerializationJSON, asrCompressionGzip, sequence, []byte(payload))
	require.NoError(t, err)
	require.NoError(t, conn.WriteMessage(websocket.BinaryMessage, frame))
}
