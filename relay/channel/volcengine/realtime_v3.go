package volcengine

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type realtimeV3SessionState struct {
	mu            sync.Mutex
	sessionID     string
	started       bool
	clientSession dto.RealtimeSession
	asrText       strings.Builder
	assistantText strings.Builder
	turnUsage     dto.RealtimeUsage
	totalUsage    dto.RealtimeUsage
}

func handleRealtimeV3(c *gin.Context, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	if info == nil || info.ClientWs == nil || info.TargetWs == nil {
		return nil, types.NewError(errors.New("invalid websocket connection"), types.ErrorCodeBadResponse)
	}
	info.IsStream = true
	info.InputAudioFormat = "pcm16"
	info.OutputAudioFormat = "pcm16"

	if err := sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_StartConnection, "", []byte("{}")); err != nil {
		return nil, realtimeV3Error("start connection", err)
	}
	message, err := ReceiveMessage(info.TargetWs)
	if err != nil {
		return nil, realtimeV3Error("wait for connection", err)
	}
	if message.MsgType == MsgTypeError {
		return nil, realtimeV3Error("start connection", protocolMessageError(message))
	}
	if message.EventType != EventType_ConnectionStarted {
		return nil, realtimeV3Error("start connection", fmt.Errorf("unexpected event %s", message.EventType))
	}

	state := &realtimeV3SessionState{sessionID: newConnectID()}
	if err := helper.WssObject(c, info.ClientWs, realtimeSessionEvent("session.created", info, state, false)); err != nil {
		return nil, realtimeV3Error("notify client", err)
	}

	clientClosed := make(chan struct{})
	targetClosed := make(chan struct{})
	errChan := make(chan error, 2)

	gopool.Go(func() {
		defer close(clientClosed)
		for {
			_, raw, readErr := info.ClientWs.ReadMessage()
			if readErr != nil {
				if !websocket.IsCloseError(readErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					errChan <- fmt.Errorf("read realtime client: %w", readErr)
				}
				return
			}
			if handleErr := handleRealtimeClientEvent(c, info, state, raw); handleErr != nil {
				errChan <- handleErr
				return
			}
		}
	})

	gopool.Go(func() {
		defer close(targetClosed)
		for {
			providerMessage, readErr := ReceiveMessage(info.TargetWs)
			if readErr != nil {
				if !websocket.IsCloseError(readErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					errChan <- fmt.Errorf("read volcengine realtime: %w", readErr)
				}
				return
			}
			info.SetFirstResponseTime()
			if handleErr := handleRealtimeProviderEvent(c, info, state, providerMessage); handleErr != nil {
				errChan <- handleErr
				return
			}
		}
	})

	var relayErr error
	select {
	case <-clientClosed:
	case <-targetClosed:
	case relayErr = <-errChan:
	case <-c.Done():
	}

	state.mu.Lock()
	if state.started {
		_ = sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_FinishSession, state.sessionID, []byte("{}"))
	}
	_ = sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_FinishConnection, "", []byte("{}"))
	consumeErr := consumeRealtimeTurn(c, info, state)
	totalUsage := state.totalUsage
	state.mu.Unlock()

	if relayErr != nil {
		logger.LogError(c, "volcengine realtime error: "+relayErr.Error())
		_ = helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "error",
			"error": map[string]any{
				"type":    "upstream_error",
				"code":    "volcengine_realtime_error",
				"message": "Volcengine realtime upstream connection failed",
			},
		})
	}
	if consumeErr != nil {
		logger.LogError(c, "volcengine realtime billing error: "+consumeErr.Error())
		_ = helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "error",
			"error": map[string]any{
				"type":    "billing_error",
				"code":    "volcengine_realtime_billing_error",
				"message": "Volcengine realtime usage settlement failed",
			},
		})
	}
	return &totalUsage, nil
}

func handleRealtimeClientEvent(c *gin.Context, info *relaycommon.RelayInfo, state *realtimeV3SessionState, raw []byte) error {
	var event dto.RealtimeEvent
	if err := common.Unmarshal(raw, &event); err != nil {
		return fmt.Errorf("parse realtime client event: %w", err)
	}

	state.mu.Lock()
	defer state.mu.Unlock()
	switch event.Type {
	case dto.RealtimeEventTypeSessionUpdate:
		if event.Session != nil {
			state.clientSession = *event.Session
			info.InputAudioFormat = firstNonEmpty(event.Session.InputAudioFormat, "pcm16")
			info.OutputAudioFormat = firstNonEmpty(event.Session.OutputAudioFormat, "pcm16")
		}
		if err := ensureRealtimeSessionStarted(info, state); err != nil {
			return err
		}
		return helper.WssObject(c, info.ClientWs, realtimeSessionEvent("session.updated", info, state, true))
	case dto.RealtimeEventInputAudioBufferAppend:
		if err := ensureRealtimeSessionStarted(info, state); err != nil {
			return err
		}
		audio, err := base64.StdEncoding.DecodeString(event.Audio)
		if err != nil {
			return errors.New("input_audio_buffer.append contains invalid base64 audio")
		}
		if len(audio) == 0 {
			return nil
		}
		addRealtimeAudioUsage(&state.turnUsage, len(audio), defaultRealtimeSampleRate, true)
		return sendRealtimeProtocolEvent(info.TargetWs, MsgTypeAudioOnlyClient, EventType_TaskRequest, state.sessionID, audio)
	case "input_audio_buffer.commit":
		return helper.WssObject(c, info.ClientWs, map[string]any{
			"event_id": helper.GetLocalRealtimeID(c),
			"type":     "input_audio_buffer.committed",
		})
	case "response.cancel":
		return nil
	default:
		return fmt.Errorf("unsupported realtime client event: %s", event.Type)
	}
}

func ensureRealtimeSessionStarted(info *relaycommon.RelayInfo, state *realtimeV3SessionState) error {
	if state.started {
		return nil
	}
	payload, err := buildRealtimeStartSessionPayload(info, state.clientSession)
	if err != nil {
		return err
	}
	if err := sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_StartSession, state.sessionID, payload); err != nil {
		return fmt.Errorf("start volcengine realtime session: %w", err)
	}
	state.started = true
	if instructions := strings.TrimSpace(state.clientSession.Instructions); instructions != "" {
		textTokens := service.CountTextToken(instructions, info.UpstreamModelName)
		state.turnUsage.InputTokenDetails.TextTokens += textTokens
		state.turnUsage.InputTokens += textTokens
		state.turnUsage.TotalTokens += textTokens
	}
	return nil
}

func buildRealtimeStartSessionPayload(info *relaycommon.RelayInfo, session dto.RealtimeSession) ([]byte, error) {
	voice := firstNonEmpty(session.Voice, info.ChannelOtherSettings.VolcengineVoice, defaultVolcengineVoice)
	modelVersion := firstNonEmpty(info.UpstreamModelName, defaultRealtimeModel)
	request := map[string]any{
		"model_name":     "O2.0",
		"model_version":  modelVersion,
		"speaker":        voice,
		"work_mode":      "pure-end-to-end",
		"output_mode":    0,
		"bot_name":       "TalkWise",
		"system_role":    strings.TrimSpace(session.Instructions),
		"speaking_style": "natural",
		"asr": map[string]any{"extra": map[string]any{
			"end_smooth_window_ms": 1500,
			"enable_custom_vad":    false,
			"enable_asr_twopass":   false,
			"context":              map[string]any{},
		}},
		"tts": map[string]any{
			"speaker": voice,
			"audio_config": map[string]any{
				"channel":     1,
				"format":      "pcm_s16le",
				"sample_rate": defaultRealtimeOutputRate,
			},
			"extra": map[string]any{"speech_rate": 0, "loudness_rate": 0},
		},
		"dialog": map[string]any{"extra": map[string]any{
			"strict_audit": true,
			"input_mod":    "keep_alive",
			"enable_music": false,
		}},
	}
	payload := map[string]any{
		"user": map[string]any{"uid": "new-api"},
		"audio": map[string]any{
			"format":      "pcm",
			"sample_rate": defaultRealtimeSampleRate,
			"channels":    1,
			"codec":       "raw",
		},
		"request": request,
	}
	return json.Marshal(payload)
}

func handleRealtimeProviderEvent(c *gin.Context, info *relaycommon.RelayInfo, state *realtimeV3SessionState, message *Message) error {
	if message == nil {
		return errors.New("volcengine realtime returned an empty message")
	}
	if message.MsgType == MsgTypeError {
		return protocolMessageError(message)
	}

	state.mu.Lock()
	defer state.mu.Unlock()
	switch message.EventType {
	case EventType_SessionStarted:
		return helper.WssObject(c, info.ClientWs, realtimeSessionEvent("session.updated", info, state, true))
	case EventType_ASRInfo:
		return helper.WssObject(c, info.ClientWs, map[string]any{"type": "input_audio_buffer.speech_started", "event_id": helper.GetLocalRealtimeID(c)})
	case EventType_ASRResponse:
		text := extractRealtimeText(message.Payload)
		if text == "" {
			return nil
		}
		state.asrText.WriteString(text)
		return helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "conversation.item.input_audio_transcription.delta", "event_id": helper.GetLocalRealtimeID(c), "delta": text,
		})
	case EventType_ASREnded:
		text := state.asrText.String()
		state.asrText.Reset()
		if text == "" {
			return nil
		}
		textTokens := service.CountTextToken(text, info.UpstreamModelName)
		state.turnUsage.InputTokenDetails.TextTokens += textTokens
		state.turnUsage.InputTokens += textTokens
		state.turnUsage.TotalTokens += textTokens
		return helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "conversation.item.input_audio_transcription.completed", "event_id": helper.GetLocalRealtimeID(c), "transcript": text,
		})
	case EventType_ChatResponse:
		text := extractRealtimeText(message.Payload)
		if text == "" {
			return nil
		}
		state.assistantText.WriteString(text)
		return helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "response.audio_transcript.delta", "event_id": helper.GetLocalRealtimeID(c), "delta": text,
		})
	case EventType_ChatEnded:
		return emitRealtimeAssistantTranscript(c, info, state)
	case EventType_TTSResponse:
		return emitRealtimeAudio(c, info, state, message.Payload)
	case EventType_TTSEnded:
		if err := emitRealtimeAssistantTranscript(c, info, state); err != nil {
			return err
		}
		if err := helper.WssObject(c, info.ClientWs, map[string]any{"type": "response.audio.done", "event_id": helper.GetLocalRealtimeID(c)}); err != nil {
			return err
		}
		if err := consumeRealtimeTurn(c, info, state); err != nil {
			return err
		}
		return helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "response.done", "event_id": helper.GetLocalRealtimeID(c),
			"response": map[string]any{"status": "completed", "usage": state.totalUsage},
		})
	case EventType_SessionFinished, EventType_ConnectionFinished:
		return nil
	default:
		if message.MsgType == MsgTypeAudioOnlyServer && len(message.Payload) > 0 {
			return emitRealtimeAudio(c, info, state, message.Payload)
		}
		return nil
	}
}

func emitRealtimeAudio(c *gin.Context, info *relaycommon.RelayInfo, state *realtimeV3SessionState, audio []byte) error {
	if len(audio) == 0 {
		return nil
	}
	addRealtimeAudioUsage(&state.turnUsage, len(audio), defaultRealtimeOutputRate, false)
	return helper.WssObject(c, info.ClientWs, map[string]any{
		"type": "response.audio.delta", "event_id": helper.GetLocalRealtimeID(c), "delta": base64.StdEncoding.EncodeToString(audio),
	})
}

func emitRealtimeAssistantTranscript(c *gin.Context, info *relaycommon.RelayInfo, state *realtimeV3SessionState) error {
	text := state.assistantText.String()
	if text == "" {
		return nil
	}
	state.assistantText.Reset()
	textTokens := service.CountTextToken(text, info.UpstreamModelName)
	state.turnUsage.OutputTokenDetails.TextTokens += textTokens
	state.turnUsage.OutputTokens += textTokens
	state.turnUsage.TotalTokens += textTokens
	return helper.WssObject(c, info.ClientWs, map[string]any{
		"type": "response.audio_transcript.done", "event_id": helper.GetLocalRealtimeID(c), "transcript": text,
	})
}

func extractRealtimeText(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}
	var value map[string]any
	if json.Unmarshal(payload, &value) != nil {
		return ""
	}
	for _, key := range []string{"content", "text", "transcript"} {
		if text, ok := value[key].(string); ok {
			return text
		}
	}
	if results, ok := value["results"].([]any); ok {
		for _, item := range results {
			if result, ok := item.(map[string]any); ok {
				if text, ok := result["text"].(string); ok {
					return text
				}
			}
		}
	}
	return ""
}

func addRealtimeAudioUsage(usage *dto.RealtimeUsage, byteCount, sampleRate int, input bool) {
	if usage == nil || byteCount <= 0 || sampleRate <= 0 {
		return
	}
	durationSeconds := float64(byteCount) / float64(sampleRate*2)
	tokens := int(math.Ceil(durationSeconds / 60 * 1000))
	if tokens < 1 {
		tokens = 1
	}
	usage.TotalTokens += tokens
	if input {
		usage.InputTokens += tokens
		usage.InputTokenDetails.AudioTokens += tokens
	} else {
		usage.OutputTokens += tokens
		usage.OutputTokenDetails.AudioTokens += tokens
	}
}

func consumeRealtimeTurn(c *gin.Context, info *relaycommon.RelayInfo, state *realtimeV3SessionState) error {
	usage := state.turnUsage
	if usage.TotalTokens == 0 {
		return nil
	}
	addRealtimeUsage(&state.totalUsage, &usage)
	state.turnUsage = dto.RealtimeUsage{}
	return service.PreWssConsumeQuota(c, info, &usage)
}

func addRealtimeUsage(target, source *dto.RealtimeUsage) {
	if target == nil || source == nil {
		return
	}
	target.TotalTokens += source.TotalTokens
	target.InputTokens += source.InputTokens
	target.OutputTokens += source.OutputTokens
	target.InputTokenDetails.CachedTokens += source.InputTokenDetails.CachedTokens
	target.InputTokenDetails.TextTokens += source.InputTokenDetails.TextTokens
	target.InputTokenDetails.AudioTokens += source.InputTokenDetails.AudioTokens
	target.OutputTokenDetails.TextTokens += source.OutputTokenDetails.TextTokens
	target.OutputTokenDetails.AudioTokens += source.OutputTokenDetails.AudioTokens
}

func realtimeSessionEvent(eventType string, info *relaycommon.RelayInfo, state *realtimeV3SessionState, configured bool) map[string]any {
	voice := firstNonEmpty(state.clientSession.Voice, info.ChannelOtherSettings.VolcengineVoice, defaultVolcengineVoice)
	return map[string]any{
		"type": eventType,
		"session": map[string]any{
			"id":                  state.sessionID,
			"model":               info.OriginModelName,
			"voice":               voice,
			"input_audio_format":  "pcm16",
			"output_audio_format": "pcm16",
			"turn_detection":      map[string]any{"type": "server_vad"},
			"configured":          configured,
		},
	}
}

func sendRealtimeProtocolEvent(conn *websocket.Conn, messageType MsgType, eventType EventType, sessionID string, payload []byte) error {
	message, err := NewMessage(messageType, MsgTypeFlagWithEvent)
	if err != nil {
		return err
	}
	message.EventType = eventType
	message.SessionID = sessionID
	message.Payload = payload
	frame, err := message.Marshal()
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.BinaryMessage, frame)
}

func protocolMessageError(message *Message) error {
	if message == nil {
		return errors.New("empty protocol error")
	}
	detail := strings.TrimSpace(string(message.Payload))
	if detail == "" {
		detail = "unknown upstream error"
	}
	return fmt.Errorf("volcengine realtime error %d: %s", message.ErrorCode, detail)
}

func realtimeV3Error(phase string, err error) *types.NewAPIError {
	return types.NewErrorWithStatusCode(fmt.Errorf("volcengine realtime %s failed: %w", phase, err), types.ErrorCodeBadResponse, 502)
}
