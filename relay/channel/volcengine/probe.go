package volcengine

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ProbeSpeechChannel validates the configured Volcengine speech service without
// assuming that a speech model supports the chat-completions endpoint.
func ProbeSpeechChannel(c *gin.Context, info *relaycommon.RelayInfo) error {
	if c == nil || info == nil {
		return errors.New("volcengine speech probe context is missing")
	}
	switch resolvedServiceMode(info) {
	case RouteTTSV3:
		return probeTTSV3(c, info)
	case RouteASRV3:
		return probeASRV3(c, info)
	case RouteRealtimeV3:
		return probeRealtimeV3(c, info)
	default:
		return errors.New("volcengine speech probe requires an audio or realtime endpoint")
	}
}

func probeTTSV3(c *gin.Context, info *relaycommon.RelayInfo) error {
	adaptor := &Adaptor{}
	body, err := adaptor.ConvertAudioRequest(c, info, dto.AudioRequest{
		Model:          info.UpstreamModelName,
		Input:          "hello",
		Voice:          info.ChannelOtherSettings.VolcengineVoice,
		ResponseFormat: "mp3",
	})
	if err != nil {
		return err
	}
	respAny, err := adaptor.DoRequest(c, info, body)
	if err != nil {
		return err
	}
	resp, ok := respAny.(*http.Response)
	if !ok || resp == nil {
		return errors.New("volcengine TTS probe returned no HTTP response")
	}
	if resp.StatusCode != http.StatusOK {
		return service.RelayErrorHandler(c.Request.Context(), resp, false)
	}
	_, relayErr := adaptor.DoResponse(c, resp, info)
	if relayErr != nil {
		return relayErr
	}
	return nil
}

func probeASRV3(c *gin.Context, info *relaycommon.RelayInfo) error {
	auth, err := resolveSpeechAuth(info, defaultASRResourceID)
	if err != nil {
		return err
	}
	requestURL, err := speechEndpoint(info.ChannelBaseUrl, defaultASRV3Path, "wss")
	if err != nil {
		return err
	}
	header := http.Header{}
	applySpeechAuthHeaders(header, auth, "")
	requestID := newConnectID()
	header.Set("X-Api-Request-Id", requestID)
	header.Set("X-Api-Sequence", "-1")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	conn, response, err := websocket.DefaultDialer.DialContext(ctx, requestURL, header)
	if err != nil {
		if response != nil {
			return fmt.Errorf("connect volcengine ASR probe: status %d: %w", response.StatusCode, err)
		}
		return fmt.Errorf("connect volcengine ASR probe: %w", err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(15 * time.Second))

	request := asrV3Request{AudioFormat: "pcm", RequestID: requestID}
	configFrame, err := encodeASRFrame(
		asrMessageFullClientRequest,
		asrFlagPositiveSequence,
		asrSerializationJSON,
		asrCompressionGzip,
		1,
		buildASRRequestPayload(request),
	)
	if err != nil {
		return err
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, configFrame); err != nil {
		return fmt.Errorf("send volcengine ASR probe config: %w", err)
	}
	finalFrame, err := encodeASRFrame(
		asrMessageAudioOnlyRequest,
		asrFlagNegativeSequence,
		asrSerializationNone,
		asrCompressionGzip,
		-2,
		make([]byte, 3200),
	)
	if err != nil {
		return err
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, finalFrame); err != nil {
		return fmt.Errorf("send volcengine ASR probe audio: %w", err)
	}
	_, err = receiveASRFrame(conn)
	return err
}

func probeRealtimeV3(c *gin.Context, info *relaycommon.RelayInfo) error {
	auth, err := resolveRealtimeAuth(info)
	if err != nil {
		return err
	}
	requestURL, err := speechEndpoint(info.ChannelBaseUrl, defaultRealtimeV3Path, "wss")
	if err != nil {
		return err
	}
	header := http.Header{}
	applySpeechAuthHeaders(header, auth, newConnectID())

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	conn, response, err := websocket.DefaultDialer.DialContext(ctx, requestURL, header)
	if err != nil {
		if response != nil {
			return fmt.Errorf("connect volcengine realtime probe: status %d: %w", response.StatusCode, err)
		}
		return fmt.Errorf("connect volcengine realtime probe: %w", err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(15 * time.Second))

	if err := sendRealtimeProtocolEvent(conn, MsgTypeFullClientRequest, EventType_StartConnection, "", []byte("{}")); err != nil {
		return err
	}
	message, err := ReceiveMessage(conn)
	if err != nil {
		return err
	}
	if message.MsgType == MsgTypeError {
		return protocolMessageError(message)
	}
	if message.EventType != EventType_ConnectionStarted {
		return fmt.Errorf("unexpected realtime connection event: %s", message.EventType)
	}

	sessionID := newConnectID()
	payload, err := buildRealtimeStartSessionPayload(info, dto.RealtimeSession{})
	if err != nil {
		return err
	}
	if err := sendRealtimeProtocolEvent(conn, MsgTypeFullClientRequest, EventType_StartSession, sessionID, payload); err != nil {
		return err
	}
	message, err = ReceiveMessage(conn)
	if err != nil {
		return err
	}
	if message.MsgType == MsgTypeError {
		return protocolMessageError(message)
	}
	if message.EventType != EventType_SessionStarted {
		return fmt.Errorf("unexpected realtime session event: %s", message.EventType)
	}
	_ = sendRealtimeProtocolEvent(conn, MsgTypeFullClientRequest, EventType_FinishSession, sessionID, []byte("{}"))
	_ = sendRealtimeProtocolEvent(conn, MsgTypeFullClientRequest, EventType_FinishConnection, "", []byte("{}"))
	return nil
}
