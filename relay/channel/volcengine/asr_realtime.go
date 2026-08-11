package volcengine

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const asrRealtimeReadTimeout = 2 * time.Minute

type asrRealtimeClientEvent struct {
	Type    string `json:"type"`
	EventID string `json:"event_id,omitempty"`
	Audio   string `json:"audio,omitempty"`
	Session *struct {
		InputAudioFormat        string `json:"input_audio_format,omitempty"`
		InputAudioTranscription struct {
			Language string `json:"language,omitempty"`
			Model    string `json:"model,omitempty"`
		} `json:"input_audio_transcription,omitempty"`
	} `json:"session,omitempty"`
}

type asrRealtimeProviderEvent struct {
	generation uint64
	frame      *asrV3Frame
	err        error
}

type asrRealtimeState struct {
	sessionID      string
	provider       *websocket.Conn
	generation     uint64
	sequence       int32
	requestID      string
	itemID         string
	language       string
	inputFormat    string
	pendingAudio   []byte
	transcript     string
	totalUsage     dto.RealtimeUsage
	commitReceived bool
}

func handleASRRealtime(c *gin.Context, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	if info == nil || info.ClientWs == nil {
		return nil, asrRealtimeError("initialize", errors.New("invalid websocket connection"))
	}
	info.IsStream = true
	info.InputAudioFormat = "pcm16"
	info.OutputAudioFormat = ""

	state := &asrRealtimeState{sessionID: newConnectID(), inputFormat: "pcm16"}
	if err := writeASRRealtimeEvent(c, info, asrRealtimeSessionEvent("transcription_session.created", info, state)); err != nil {
		return nil, asrRealtimeError("notify client", err)
	}

	clientEvents := make(chan []byte, 16)
	clientErrors := make(chan error, 1)
	providerEvents := make(chan asrRealtimeProviderEvent, 32)
	done := make(chan struct{})
	defer close(done)
	defer closeASRRealtimeProvider(state)

	go readASRRealtimeClient(info.ClientWs, clientEvents, clientErrors, done)
	for {
		select {
		case <-c.Done():
			return &state.totalUsage, nil
		case err := <-clientErrors:
			if isNormalASRRealtimeClose(err) {
				return &state.totalUsage, nil
			}
			return &state.totalUsage, asrRealtimeError("read client", err)
		case raw := <-clientEvents:
			if err := handleASRRealtimeClientEvent(c, info, state, raw, providerEvents, done); err != nil {
				_ = writeASRRealtimeErrorEvent(c, info, "invalid_request_error", "volcengine_asr_client_error", err.Error())
				return &state.totalUsage, asrRealtimeError("handle client event", err)
			}
		case event := <-providerEvents:
			if event.generation != state.generation {
				continue
			}
			if event.err != nil {
				_ = writeASRRealtimeErrorEvent(c, info, "upstream_error", "volcengine_asr_error", "Volcengine streaming transcription failed")
				closeASRRealtimeProvider(state)
				return &state.totalUsage, asrRealtimeError("read upstream", event.err)
			}
			if event.frame == nil {
				continue
			}
			info.SetFirstResponseTime()
			if err := handleASRRealtimeProviderFrame(c, info, state, event.frame); err != nil {
				return &state.totalUsage, asrRealtimeError("emit transcript", err)
			}
		}
	}
}

func readASRRealtimeClient(conn *websocket.Conn, events chan<- []byte, errs chan<- error, done <-chan struct{}) {
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			select {
			case errs <- err:
			case <-done:
			}
			return
		}
		select {
		case events <- raw:
		case <-done:
			return
		}
	}
}

func handleASRRealtimeClientEvent(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	state *asrRealtimeState,
	raw []byte,
	providerEvents chan<- asrRealtimeProviderEvent,
	done <-chan struct{},
) error {
	var event asrRealtimeClientEvent
	if err := json.Unmarshal(raw, &event); err != nil {
		return fmt.Errorf("parse realtime transcription event: %w", err)
	}
	switch event.Type {
	case "session.update", "transcription_session.update":
		if event.Session != nil {
			format := firstNonEmpty(event.Session.InputAudioFormat, "pcm16")
			if format != "pcm16" && format != "pcm_s16le" {
				return fmt.Errorf("unsupported input audio format %q; expected pcm16", format)
			}
			state.inputFormat = "pcm16"
			state.language = event.Session.InputAudioTranscription.Language
			info.InputAudioFormat = "pcm16"
		}
		responseType := "transcription_session.updated"
		if event.Type == "session.update" {
			responseType = "session.updated"
		}
		return writeASRRealtimeEvent(c, info, asrRealtimeSessionEvent(responseType, info, state))
	case "input_audio_buffer.append":
		audio, err := base64.StdEncoding.DecodeString(event.Audio)
		if err != nil {
			return errors.New("input_audio_buffer.append contains invalid base64 audio")
		}
		if len(audio) == 0 {
			return nil
		}
		if state.provider == nil {
			if err := startASRRealtimeProvider(c, info, state, providerEvents, done); err != nil {
				return err
			}
		}
		state.commitReceived = false
		addRealtimeAudioUsage(&state.totalUsage, len(audio), defaultASRSampleRate, true)
		state.pendingAudio = append(state.pendingAudio, audio...)
		return flushASRRealtimeAudio(state, false)
	case "input_audio_buffer.commit":
		if state.provider == nil {
			return emitEmptyASRRealtimeTurn(c, info)
		}
		if state.commitReceived {
			return nil
		}
		state.commitReceived = true
		if err := flushASRRealtimeAudio(state, true); err != nil {
			return err
		}
		return writeASRRealtimeEvent(c, info, map[string]any{
			"type":     "input_audio_buffer.committed",
			"event_id": helper.GetLocalRealtimeID(c),
			"item_id":  state.itemID,
		})
	case "input_audio_buffer.clear":
		closeASRRealtimeProvider(state)
		return writeASRRealtimeEvent(c, info, map[string]any{
			"type":     "input_audio_buffer.cleared",
			"event_id": helper.GetLocalRealtimeID(c),
		})
	default:
		return fmt.Errorf("unsupported realtime transcription event: %s", event.Type)
	}
}

func startASRRealtimeProvider(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	state *asrRealtimeState,
	events chan<- asrRealtimeProviderEvent,
	done <-chan struct{},
) error {
	auth, err := resolveSpeechAuth(info, defaultASRResourceID)
	if err != nil {
		return err
	}
	requestURL, err := speechEndpoint(info.ChannelBaseUrl, defaultASRV3Path, "wss")
	if err != nil {
		return err
	}
	requestID := newConnectID()
	header := http.Header{}
	applySpeechAuthHeaders(header, auth, "")
	header.Set("X-Api-Request-Id", requestID)
	header.Set("X-Api-Sequence", "-1")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	conn, response, err := websocket.DefaultDialer.DialContext(ctx, requestURL, header)
	if err != nil {
		if response != nil {
			return fmt.Errorf("connect volcengine ASR: status %d: %w", response.StatusCode, err)
		}
		return fmt.Errorf("connect volcengine ASR: %w", err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(asrRealtimeReadTimeout))

	state.generation++
	state.provider = conn
	state.sequence = 2
	state.requestID = requestID
	state.itemID = "item_" + newConnectID()
	state.pendingAudio = nil
	state.transcript = ""
	state.commitReceived = false

	payload := buildASRRequestPayload(asrV3Request{
		AudioFormat: "pcm",
		Language:    state.language,
		RequestID:   requestID,
	})
	frame, err := encodeASRFrame(asrMessageFullClientRequest, asrFlagPositiveSequence, asrSerializationJSON, asrCompressionGzip, 1, payload)
	if err != nil {
		closeASRRealtimeProvider(state)
		return err
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, frame); err != nil {
		closeASRRealtimeProvider(state)
		return fmt.Errorf("send volcengine ASR config: %w", err)
	}
	generation := state.generation
	go readASRRealtimeProvider(conn, generation, events, done)
	return nil
}

func readASRRealtimeProvider(conn *websocket.Conn, generation uint64, events chan<- asrRealtimeProviderEvent, done <-chan struct{}) {
	for {
		frame, err := receiveASRFrame(conn)
		event := asrRealtimeProviderEvent{generation: generation, frame: frame, err: err}
		select {
		case events <- event:
		case <-done:
			return
		}
		if err != nil || (frame != nil && (frame.Flags == asrFlagNegativeSequence || frame.Sequence < 0 || isASRFinal(frame.Payload))) {
			return
		}
	}
}

func flushASRRealtimeAudio(state *asrRealtimeState, final bool) error {
	if state.provider == nil {
		return errors.New("volcengine ASR stream is not connected")
	}
	for len(state.pendingAudio) > asrChunkSize {
		chunk := state.pendingAudio[:asrChunkSize]
		if err := writeASRRealtimeAudioFrame(state, chunk, false); err != nil {
			return err
		}
		state.pendingAudio = state.pendingAudio[asrChunkSize:]
	}
	if !final {
		return nil
	}
	chunk := state.pendingAudio
	if len(chunk) == 0 {
		chunk = make([]byte, defaultASRSampleRate*2/100)
	}
	state.pendingAudio = nil
	return writeASRRealtimeAudioFrame(state, chunk, true)
}

func writeASRRealtimeAudioFrame(state *asrRealtimeState, audio []byte, final bool) error {
	flags := asrFlagPositiveSequence
	sequence := state.sequence
	if final {
		flags = asrFlagNegativeSequence
		sequence = -sequence
	}
	frame, err := encodeASRFrame(asrMessageAudioOnlyRequest, flags, asrSerializationNone, asrCompressionGzip, sequence, audio)
	if err != nil {
		return err
	}
	if err := state.provider.WriteMessage(websocket.BinaryMessage, frame); err != nil {
		return fmt.Errorf("send volcengine ASR audio: %w", err)
	}
	state.sequence++
	return nil
}

func handleASRRealtimeProviderFrame(c *gin.Context, info *relaycommon.RelayInfo, state *asrRealtimeState, frame *asrV3Frame) error {
	text := retainASRTranscript(state.transcript, frame.Payload)
	if text != "" && text != state.transcript {
		delta := asrRealtimeTranscriptDelta(state.transcript, text)
		state.transcript = text
		if err := writeASRRealtimeEvent(c, info, map[string]any{
			"type":       "conversation.item.input_audio_transcription.delta",
			"event_id":   helper.GetLocalRealtimeID(c),
			"item_id":    state.itemID,
			"delta":      delta,
			"transcript": text,
		}); err != nil {
			return err
		}
	}
	if frame.Flags != asrFlagNegativeSequence && frame.Sequence >= 0 && !isASRFinal(frame.Payload) {
		return nil
	}
	if err := writeASRRealtimeEvent(c, info, map[string]any{
		"type":       "conversation.item.input_audio_transcription.completed",
		"event_id":   helper.GetLocalRealtimeID(c),
		"item_id":    state.itemID,
		"transcript": state.transcript,
	}); err != nil {
		return err
	}
	closeASRRealtimeProvider(state)
	return nil
}

func emitEmptyASRRealtimeTurn(c *gin.Context, info *relaycommon.RelayInfo) error {
	itemID := "item_" + newConnectID()
	if err := writeASRRealtimeEvent(c, info, map[string]any{
		"type":     "input_audio_buffer.committed",
		"event_id": helper.GetLocalRealtimeID(c),
		"item_id":  itemID,
	}); err != nil {
		return err
	}
	return writeASRRealtimeEvent(c, info, map[string]any{
		"type":       "conversation.item.input_audio_transcription.completed",
		"event_id":   helper.GetLocalRealtimeID(c),
		"item_id":    itemID,
		"transcript": "",
	})
}

func closeASRRealtimeProvider(state *asrRealtimeState) {
	// Invalidate read-loop events from the provider connection being closed.
	state.generation++
	if state.provider != nil {
		_ = state.provider.Close()
	}
	state.provider = nil
	state.pendingAudio = nil
	state.sequence = 0
	state.requestID = ""
	state.itemID = ""
	state.transcript = ""
	state.commitReceived = false
}

func asrRealtimeTranscriptDelta(previous, current string) string {
	if strings.HasPrefix(current, previous) {
		return strings.TrimPrefix(current, previous)
	}
	return current
}

func asrRealtimeSessionEvent(eventType string, info *relaycommon.RelayInfo, state *asrRealtimeState) map[string]any {
	return map[string]any{
		"type": eventType,
		"session": map[string]any{
			"id":                 state.sessionID,
			"model":              info.OriginModelName,
			"input_audio_format": state.inputFormat,
			"input_audio_transcription": map[string]any{
				"model":    info.OriginModelName,
				"language": state.language,
			},
		},
	}
}

func writeASRRealtimeEvent(c *gin.Context, info *relaycommon.RelayInfo, event map[string]any) error {
	return helper.WssObject(c, info.ClientWs, event)
}

func writeASRRealtimeErrorEvent(c *gin.Context, info *relaycommon.RelayInfo, errorType, code, message string) error {
	return writeASRRealtimeEvent(c, info, map[string]any{
		"type":     "error",
		"event_id": helper.GetLocalRealtimeID(c),
		"error": map[string]any{
			"type":    errorType,
			"code":    code,
			"message": message,
		},
	})
}

func isNormalASRRealtimeClose(err error) bool {
	return err == nil || websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) || errors.Is(err, net.ErrClosed)
}

func asrRealtimeError(phase string, err error) *types.NewAPIError {
	return types.NewErrorWithStatusCode(fmt.Errorf("volcengine streaming ASR %s failed: %w", phase, err), types.ErrorCodeBadResponse, http.StatusBadGateway)
}
