package volcengine

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"net"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

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
	mu                       sync.Mutex
	sessionID                string
	startRequested           bool
	started                  bool
	clientSession            dto.RealtimeSession
	asrText                  string
	assistantText            strings.Builder
	responseInterrupted      bool
	awaitingResponseAfterCut bool
	activeQuestionID         string
	activeResponseID         string
	responseGeneration       uint64
	interruptionEpoch        uint64
	interruptedResponseIDs   map[string]uint64
	completedResponseIDs     map[string]struct{}
	desynced                 bool
	diagnosticStartedAt      time.Time
	diagnosticEventSequence  uint64
	turnUsage                dto.RealtimeUsage
	totalUsage               dto.RealtimeUsage
}

type realtimeV3ResponseIdentity struct {
	questionID string
	responseID string
	fieldNames []string
}

type realtimeV3WorkerSource uint8

const (
	realtimeV3ClientWorker realtimeV3WorkerSource = iota
	realtimeV3ProviderWorker
)

type realtimeV3WorkerResult struct {
	source realtimeV3WorkerSource
	err    error
}

const realtimeCommitSilenceMilliseconds = 1600

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

	state := &realtimeV3SessionState{
		sessionID:              newConnectID(),
		interruptedResponseIDs: make(map[string]uint64),
		completedResponseIDs:   make(map[string]struct{}),
		diagnosticStartedAt:    time.Now(),
	}
	if err := helper.WssObject(c, info.ClientWs, realtimeSessionEvent("session.created", info, state, false)); err != nil {
		return nil, realtimeV3Error("notify client", err)
	}

	workerResults := make(chan realtimeV3WorkerResult, 2)
	var shutdownStarted atomic.Bool

	gopool.Go(func() {
		var workerErr error
		defer func() {
			workerResults <- realtimeV3WorkerResult{source: realtimeV3ClientWorker, err: workerErr}
		}()
		for {
			_, raw, readErr := info.ClientWs.ReadMessage()
			if readErr != nil {
				if !websocket.IsCloseError(readErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) &&
					!(shutdownStarted.Load() && (errors.Is(readErr, net.ErrClosed) || errors.Is(readErr, websocket.ErrCloseSent))) {
					workerErr = fmt.Errorf("read realtime client: %w", readErr)
				}
				return
			}
			if handleErr := handleRealtimeClientEvent(c, info, state, raw); handleErr != nil {
				workerErr = handleErr
				return
			}
		}
	})

	gopool.Go(func() {
		var workerErr error
		defer func() {
			workerResults <- realtimeV3WorkerResult{source: realtimeV3ProviderWorker, err: workerErr}
		}()
		for {
			providerMessage, readErr := ReceiveMessage(info.TargetWs)
			if readErr != nil {
				if !websocket.IsCloseError(readErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) &&
					!(shutdownStarted.Load() && (errors.Is(readErr, net.ErrClosed) || errors.Is(readErr, websocket.ErrCloseSent))) {
					workerErr = fmt.Errorf("read volcengine realtime: %w", readErr)
				}
				return
			}
			info.SetFirstResponseTime()
			if handleErr := handleRealtimeProviderEvent(c, info, state, providerMessage); handleErr != nil {
				workerErr = handleErr
				return
			}
		}
	})

	results := make([]realtimeV3WorkerResult, 0, 2)
	notifyProviderError := false
	select {
	case result := <-workerResults:
		results = append(results, result)
		notifyProviderError = result.source == realtimeV3ProviderWorker && result.err != nil
	case <-c.Done():
	}

	state.mu.Lock()
	if state.started {
		_ = sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_FinishSession, state.sessionID, []byte("{}"))
	} else if state.startRequested {
		_ = sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_CancelSession, state.sessionID, []byte("{}"))
	}
	_ = sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_FinishConnection, "", []byte("{}"))
	finalizeRealtimeTurn(state)
	totalUsage := state.totalUsage
	state.mu.Unlock()

	if notifyProviderError {
		_ = helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "error",
			"error": map[string]any{
				"type":    "upstream_error",
				"code":    "volcengine_realtime_error",
				"message": "Volcengine realtime upstream connection failed",
			},
		})
	}

	shutdownStarted.Store(true)
	_ = info.TargetWs.Close()
	_ = info.ClientWs.Close()
	for len(results) < 2 {
		results = append(results, <-workerResults)
	}
	relayErr := realtimeV3RelayError(results)
	if relayErr != nil {
		logger.LogError(c, "volcengine realtime error: "+relayErr.Error())
	}
	return &totalUsage, nil
}

func realtimeV3RelayError(results []realtimeV3WorkerResult) error {
	for _, result := range results {
		if result.source == realtimeV3ProviderWorker && result.err != nil {
			return result.err
		}
	}
	for _, result := range results {
		if result.err != nil {
			return result.err
		}
	}
	return nil
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
		return nil
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
		if err := ensureRealtimeSessionStarted(info, state); err != nil {
			return err
		}
		if err := sendRealtimeCommitSilence(info.TargetWs, state.sessionID); err != nil {
			return err
		}
		return helper.WssObject(c, info.ClientWs, map[string]any{
			"event_id": helper.GetLocalRealtimeID(c),
			"type":     "input_audio_buffer.committed",
		})
	case "response.cancel":
		identity := interruptRealtimeResponse(state)
		event := map[string]any{
			"event_id": helper.GetLocalRealtimeID(c),
			"type":     "response.cancelled",
			"reason":   "client_cancel",
		}
		addRealtimeResponseIdentity(event, identity)
		return helper.WssObject(c, info.ClientWs, event)
	default:
		return fmt.Errorf("unsupported realtime client event: %s", event.Type)
	}
}

func ensureRealtimeSessionStarted(info *relaycommon.RelayInfo, state *realtimeV3SessionState) error {
	if state.startRequested {
		return nil
	}
	payload, err := buildRealtimeStartSessionPayload(info, state.clientSession)
	if err != nil {
		return err
	}
	if err := sendRealtimeProtocolEvent(info.TargetWs, MsgTypeFullClientRequest, EventType_StartSession, state.sessionID, payload); err != nil {
		return fmt.Errorf("start volcengine realtime session: %w", err)
	}
	state.startRequested = true
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
	// Dialogue v3 reads asr, tts, and dialog directly from StartSession. Nesting
	// them under request makes the service fall back to its encoded audio default.
	payload := map[string]any{
		"asr": map[string]any{"extra": map[string]any{
			"end_smooth_window_ms": 1500,
			"enable_custom_vad":    false,
			"enable_asr_twopass":   false,
			"context":              map[string]any{},
		}, "audio_info": map[string]any{
			"format":      "pcm",
			"sample_rate": defaultRealtimeSampleRate,
			"channel":     1,
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
		"dialog": map[string]any{
			"bot_name":       "TalkWise",
			"system_role":    strings.TrimSpace(session.Instructions),
			"speaking_style": "natural",
			"extra": map[string]any{
				"strict_audit": true,
				"input_mod":    "keep_alive",
				"enable_music": false,
				"model":        modelVersion,
			},
		},
	}
	return common.Marshal(payload)
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
	identity := realtimeProviderEventIdentity(message.Payload)
	logRealtimeProviderEvent(c, state, message, identity.fieldNames)
	if state.desynced {
		return nil
	}
	switch message.EventType {
	case EventType_SessionStarted:
		state.started = true
		return helper.WssObject(c, info.ClientWs, realtimeSessionEvent("session.updated", info, state, true))
	case EventType_SessionFailed, EventType_ConnectionFailed:
		return protocolMessageError(message)
	case EventType_AudioMuted:
		interruptedIdentity := interruptRealtimeResponse(state)
		event := map[string]any{
			"type":     "response.interrupted",
			"event_id": helper.GetLocalRealtimeID(c),
			"reason":   "provider_barge_in",
		}
		addRealtimeResponseIdentity(event, interruptedIdentity)
		return helper.WssObject(c, info.ClientWs, event)
	case EventType_ASRInfo:
		return helper.WssObject(c, info.ClientWs, map[string]any{"type": "input_audio_buffer.speech_started", "event_id": helper.GetLocalRealtimeID(c)})
	case EventType_ASRResponse:
		text := extractRealtimeText(message.Payload)
		if text == "" {
			return nil
		}
		delta := mergeRealtimeASRHypothesis(&state.asrText, text)
		if delta == "" {
			return nil
		}
		return helper.WssObject(c, info.ClientWs, map[string]any{
			"type": "conversation.item.input_audio_transcription.delta", "event_id": helper.GetLocalRealtimeID(c), "delta": delta,
		})
	case EventType_ASREnded:
		state.responseInterrupted = false
		text := state.asrText
		state.asrText = ""
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
	case EventType_TTSSentenceStart, EventType_TTSSentenceEnd, EventType_ChatEnded:
		accepted, err := acceptRealtimeResponseIdentity(c, info, state, identity, message.EventType)
		if err != nil || !accepted {
			return err
		}
		return nil
	case EventType_ChatResponse:
		accepted, err := acceptRealtimeResponseIdentity(c, info, state, identity, message.EventType)
		if err != nil || !accepted {
			return err
		}
		text := extractRealtimeText(message.Payload)
		if text == "" {
			return nil
		}
		state.assistantText.WriteString(text)
		event := map[string]any{
			"type": "response.audio_transcript.delta", "event_id": helper.GetLocalRealtimeID(c), "delta": text,
		}
		addRealtimeResponseIdentity(event, identity)
		return helper.WssObject(c, info.ClientWs, event)
	case EventType_TTSResponse:
		if state.responseInterrupted || state.awaitingResponseAfterCut {
			return nil
		}
		if state.activeResponseID == "" {
			return failRealtimeTurnDesync(c, info, state, message.EventType, "audio_without_response_id", identity.fieldNames)
		}
		return emitRealtimeAudio(c, info, state, message.Payload, activeRealtimeResponseIdentity(state))
	case EventType_TTSEnded:
		if identity.responseID == "" {
			return failRealtimeTurnDesync(c, info, state, message.EventType, "missing_response_id", identity.fieldNames)
		}
		if _, interrupted := state.interruptedResponseIDs[identity.responseID]; interrupted {
			state.responseInterrupted = false
			event := map[string]any{
				"type":     "response.cancel.done",
				"event_id": helper.GetLocalRealtimeID(c),
			}
			addRealtimeResponseIdentity(event, identity)
			return helper.WssObject(c, info.ClientWs, event)
		}
		if state.awaitingResponseAfterCut && state.activeResponseID == "" {
			state.interruptedResponseIDs[identity.responseID] = state.interruptionEpoch
			state.responseInterrupted = false
			state.assistantText.Reset()
			event := map[string]any{
				"type":     "response.cancel.done",
				"event_id": helper.GetLocalRealtimeID(c),
			}
			addRealtimeResponseIdentity(event, identity)
			return helper.WssObject(c, info.ClientWs, event)
		}
		if _, completed := state.completedResponseIDs[identity.responseID]; completed {
			return nil
		}
		if state.activeResponseID == "" || identity.responseID != state.activeResponseID {
			return failRealtimeTurnDesync(c, info, state, message.EventType, "response_id_mismatch", identity.fieldNames)
		}
		if err := emitRealtimeAssistantTranscript(c, info, state, identity); err != nil {
			return err
		}
		audioDone := map[string]any{"type": "response.audio.done", "event_id": helper.GetLocalRealtimeID(c)}
		addRealtimeResponseIdentity(audioDone, identity)
		if err := helper.WssObject(c, info.ClientWs, audioDone); err != nil {
			return err
		}
		finalizeRealtimeTurn(state)
		if state.completedResponseIDs == nil {
			state.completedResponseIDs = make(map[string]struct{})
		}
		state.completedResponseIDs[identity.responseID] = struct{}{}
		state.activeQuestionID = ""
		state.activeResponseID = ""
		responseDone := map[string]any{
			"type": "response.done", "event_id": helper.GetLocalRealtimeID(c),
			"response": map[string]any{"status": "completed", "usage": state.totalUsage},
		}
		addRealtimeResponseIdentity(responseDone, identity)
		return helper.WssObject(c, info.ClientWs, responseDone)
	case EventType_SessionFinished, EventType_ConnectionFinished:
		return nil
	default:
		if message.MsgType == MsgTypeAudioOnlyServer && len(message.Payload) > 0 {
			if state.responseInterrupted || state.awaitingResponseAfterCut {
				return nil
			}
			if state.activeResponseID == "" {
				return failRealtimeTurnDesync(c, info, state, message.EventType, "audio_without_response_id", identity.fieldNames)
			}
			return emitRealtimeAudio(c, info, state, message.Payload, activeRealtimeResponseIdentity(state))
		}
		return nil
	}
}

func realtimeProviderEventIdentity(payload []byte) realtimeV3ResponseIdentity {
	identity := realtimeV3ResponseIdentity{}
	if len(payload) == 0 {
		return identity
	}
	var value map[string]any
	if common.Unmarshal(payload, &value) != nil {
		return identity
	}
	identity.fieldNames = make([]string, 0, len(value))
	for key := range value {
		identity.fieldNames = append(identity.fieldNames, key)
	}
	sort.Strings(identity.fieldNames)
	identity.questionID = firstRealtimeString(value, "question_id", "questionId")
	identity.responseID = firstRealtimeString(value, "reply_id", "replyId", "response_id", "responseId")
	return identity
}

func firstRealtimeString(value map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := value[key].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func activeRealtimeResponseIdentity(state *realtimeV3SessionState) realtimeV3ResponseIdentity {
	return realtimeV3ResponseIdentity{
		questionID: state.activeQuestionID,
		responseID: state.activeResponseID,
	}
}

func addRealtimeResponseIdentity(event map[string]any, identity realtimeV3ResponseIdentity) {
	if identity.responseID != "" {
		event["response_id"] = identity.responseID
		event["provider_response_id"] = identity.responseID
	}
	if identity.questionID != "" {
		event["provider_question_id"] = identity.questionID
	}
}

func acceptRealtimeResponseIdentity(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	state *realtimeV3SessionState,
	identity realtimeV3ResponseIdentity,
	eventType EventType,
) (bool, error) {
	if identity.responseID == "" {
		return false, failRealtimeTurnDesync(c, info, state, eventType, "missing_response_id", identity.fieldNames)
	}
	if _, interrupted := state.interruptedResponseIDs[identity.responseID]; interrupted {
		return false, nil
	}
	if state.activeResponseID == "" {
		state.activeResponseID = identity.responseID
		state.activeQuestionID = identity.questionID
		state.responseGeneration++
		state.responseInterrupted = false
		state.awaitingResponseAfterCut = false
		return true, nil
	}
	if state.activeResponseID != identity.responseID {
		return false, failRealtimeTurnDesync(c, info, state, eventType, "response_id_mismatch", identity.fieldNames)
	}
	if state.activeQuestionID == "" {
		state.activeQuestionID = identity.questionID
	} else if identity.questionID != "" && state.activeQuestionID != identity.questionID {
		return false, failRealtimeTurnDesync(c, info, state, eventType, "question_id_mismatch", identity.fieldNames)
	}
	return true, nil
}

func interruptRealtimeResponse(state *realtimeV3SessionState) realtimeV3ResponseIdentity {
	identity := activeRealtimeResponseIdentity(state)
	state.interruptionEpoch++
	state.responseInterrupted = true
	state.awaitingResponseAfterCut = true
	if identity.responseID != "" {
		if state.interruptedResponseIDs == nil {
			state.interruptedResponseIDs = make(map[string]uint64)
		}
		state.interruptedResponseIDs[identity.responseID] = state.interruptionEpoch
	}
	state.activeQuestionID = ""
	state.activeResponseID = ""
	state.assistantText.Reset()
	finalizeRealtimeTurn(state)
	return identity
}

func failRealtimeTurnDesync(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	state *realtimeV3SessionState,
	eventType EventType,
	reason string,
	payloadFieldNames []string,
) error {
	state.desynced = true
	state.responseInterrupted = true
	state.awaitingResponseAfterCut = false
	state.assistantText.Reset()
	logger.LogWarn(c, fmt.Sprintf(
		"volcengine realtime turn desync: event_type=%s interruption_epoch=%d response_generation=%d reason=%s payload_fields=%s",
		eventType,
		state.interruptionEpoch,
		state.responseGeneration,
		reason,
		strings.Join(payloadFieldNames, ","),
	))
	if err := helper.WssObject(c, info.ClientWs, map[string]any{
		"type":     "response.interrupted",
		"event_id": helper.GetLocalRealtimeID(c),
		"reason":   "realtime_turn_desync",
	}); err != nil {
		return err
	}
	return helper.WssObject(c, info.ClientWs, map[string]any{
		"type":          "error",
		"code":          "REALTIME_TURN_DESYNC",
		"message":       "Realtime provider turn identity could not be resolved",
		"errorCategory": "protocol_desync",
		"retryable":     false,
		"fatal":         true,
		"metadata": map[string]any{
			"sourceEventType":    eventType.String(),
			"interruptionEpoch":  state.interruptionEpoch,
			"responseGeneration": state.responseGeneration,
			"payloadFieldNames":  append([]string(nil), payloadFieldNames...),
			"reason":             reason,
		},
	})
}

func logRealtimeProviderEvent(
	c *gin.Context,
	state *realtimeV3SessionState,
	message *Message,
	payloadFieldNames []string,
) {
	if state.diagnosticStartedAt.IsZero() {
		state.diagnosticStartedAt = time.Now()
	}
	state.diagnosticEventSequence++
	hasSequence := message.MsgTypeFlag == MsgTypeFlagPositiveSeq || message.MsgTypeFlag == MsgTypeFlagNegativeSeq
	logger.LogDebug(
		c,
		"volcengine realtime provider event: event_type=%s diagnostic_sequence=%d provider_sequence=%d has_provider_sequence=%t relative_ms=%d interruption_epoch=%d response_generation=%d payload_fields=%s",
		message.EventType,
		state.diagnosticEventSequence,
		message.Sequence,
		hasSequence,
		time.Since(state.diagnosticStartedAt).Milliseconds(),
		state.interruptionEpoch,
		state.responseGeneration,
		strings.Join(payloadFieldNames, ","),
	)
}

// Volcengine ASRResponse frames contain the current utterance hypothesis, not
// an independent token delta. Keep the latest hypothesis for persistence and
// emit only its newly extended suffix to clients.
func mergeRealtimeASRHypothesis(current *string, incoming string) string {
	if current == nil {
		return ""
	}
	next := strings.TrimSpace(incoming)
	if next == "" {
		return ""
	}
	previous := strings.TrimSpace(*current)
	*current = next
	if previous == "" {
		return next
	}
	if strings.HasPrefix(next, previous) {
		return next[len(previous):]
	}
	// A provider correction cannot be represented by an append-only delta; the
	// final completion frame still carries the corrected full hypothesis.
	return ""
}

func emitRealtimeAudio(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	state *realtimeV3SessionState,
	audio []byte,
	identity realtimeV3ResponseIdentity,
) error {
	if len(audio) == 0 {
		return nil
	}
	mimeType := detectRealtimeAudioMimeType(audio)
	if mimeType != "audio/pcm" {
		return fmt.Errorf("volcengine realtime requested pcm_s16le but received %s; refusing to relay encoded audio as PCM", mimeType)
	}
	addRealtimeAudioUsage(&state.turnUsage, len(audio), defaultRealtimeOutputRate, false)
	return emitRealtimeAudioPayload(c, info, audio, mimeType, identity)
}

func emitRealtimeAudioPayload(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	audio []byte,
	mimeType string,
	identity realtimeV3ResponseIdentity,
) error {
	event := map[string]any{
		"type":        "response.audio.delta",
		"event_id":    helper.GetLocalRealtimeID(c),
		"delta":       base64.StdEncoding.EncodeToString(audio),
		"mime_type":   mimeType,
		"sample_rate": defaultRealtimeOutputRate,
		"channels":    1,
	}
	addRealtimeResponseIdentity(event, identity)
	return helper.WssObject(c, info.ClientWs, event)
}

func detectRealtimeAudioMimeType(audio []byte) string {
	if len(audio) >= 4 && bytes.Equal(audio[:4], []byte("OggS")) {
		return "audio/ogg; codecs=opus"
	}
	if len(audio) >= 12 && bytes.Equal(audio[:4], []byte("RIFF")) && bytes.Equal(audio[8:12], []byte("WAVE")) {
		return "audio/wav"
	}
	return "audio/pcm"
}

func sendRealtimeCommitSilence(target *websocket.Conn, sessionID string) error {
	const frameMilliseconds = 100
	frameBytes := defaultRealtimeSampleRate * 2 * frameMilliseconds / 1000
	frame := make([]byte, frameBytes)
	for sent := 0; sent < realtimeCommitSilenceMilliseconds; sent += frameMilliseconds {
		if err := sendRealtimeProtocolEvent(target, MsgTypeAudioOnlyClient, EventType_TaskRequest, sessionID, frame); err != nil {
			return fmt.Errorf("flush volcengine realtime input: %w", err)
		}
	}
	return nil
}

func emitRealtimeAssistantTranscript(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	state *realtimeV3SessionState,
	identity realtimeV3ResponseIdentity,
) error {
	text := state.assistantText.String()
	if text == "" {
		return nil
	}
	state.assistantText.Reset()
	textTokens := service.CountTextToken(text, info.UpstreamModelName)
	state.turnUsage.OutputTokenDetails.TextTokens += textTokens
	state.turnUsage.OutputTokens += textTokens
	state.turnUsage.TotalTokens += textTokens
	event := map[string]any{
		"type": "response.audio_transcript.done", "event_id": helper.GetLocalRealtimeID(c), "transcript": text,
	}
	addRealtimeResponseIdentity(event, identity)
	return helper.WssObject(c, info.ClientWs, event)
}

func extractRealtimeText(payload []byte) string {
	if len(payload) == 0 {
		return ""
	}
	var value map[string]any
	if common.Unmarshal(payload, &value) != nil {
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

func finalizeRealtimeTurn(state *realtimeV3SessionState) {
	usage := state.turnUsage
	if usage.TotalTokens == 0 {
		return
	}
	addRealtimeUsage(&state.totalUsage, &usage)
	state.turnUsage = dto.RealtimeUsage{}
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
