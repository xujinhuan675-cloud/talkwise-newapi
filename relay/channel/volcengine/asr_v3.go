package volcengine

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	asrMessageFullClientRequest  = 0b0001
	asrMessageAudioOnlyRequest   = 0b0010
	asrMessageFullServerResponse = 0b1001
	asrMessageError              = 0b1111
	asrFlagPositiveSequence      = 0b0001
	asrFlagNegativeSequence      = 0b0011
	asrSerializationNone         = 0b0000
	asrSerializationJSON         = 0b0001
	asrCompressionGzip           = 0b0001
	asrChunkSize                 = 3200
)

type asrV3Request struct {
	Audio          []byte
	AudioFormat    string
	Language       string
	ResponseFormat string
	RequestID      string
	FileName       string
}

type asrV3Frame struct {
	MessageType int
	Flags       int
	Sequence    int32
	Payload     map[string]any
}

func convertASRV3Request(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	if info.RelayMode != relayconstant.RelayModeAudioTranscription && info.RelayMode != relayconstant.RelayModeAudioTranslation {
		return nil, fmt.Errorf("volcengine ASR V3 channel cannot handle relay mode %d", info.RelayMode)
	}
	form, err := common.ParseMultipartFormReusable(c)
	if err != nil {
		return nil, fmt.Errorf("parse audio form: %w", err)
	}
	fileHeader, err := firstAudioFile(form)
	if err != nil {
		return nil, err
	}
	file, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("open audio file: %w", err)
	}
	defer file.Close()
	audio, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("read audio file: %w", err)
	}
	if len(audio) == 0 {
		return nil, errors.New("audio file is empty")
	}
	audioFormat, err := normalizeASRFormat(fileHeader.Filename, fileHeader.Header.Get("Content-Type"))
	if err != nil {
		return nil, err
	}
	asrRequest := asrV3Request{
		Audio:          audio,
		AudioFormat:    audioFormat,
		Language:       firstFormValue(form, "language"),
		ResponseFormat: firstNonEmpty(request.ResponseFormat, firstFormValue(form, "response_format"), "json"),
		RequestID:      newConnectID(),
		FileName:       fileHeader.Filename,
	}
	c.Set(contextKeyASRRequest, asrRequest)
	c.Set(contextKeyVolcengineService, RouteASRV3)
	return bytes.NewReader(nil), nil
}

func firstAudioFile(form *multipart.Form) (*multipart.FileHeader, error) {
	if form == nil || len(form.File["file"]) == 0 {
		return nil, errors.New("file is required")
	}
	return form.File["file"][0], nil
}

func firstFormValue(form *multipart.Form, key string) string {
	if form == nil || len(form.Value[key]) == 0 {
		return ""
	}
	return strings.TrimSpace(form.Value[key][0])
}

func normalizeASRFormat(filename, contentType string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".wav", ".mp3", ".ogg", ".pcm", ".raw":
		return strings.TrimPrefix(ext, "."), nil
	}
	switch strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0])) {
	case "audio/wav", "audio/x-wav":
		return "wav", nil
	case "audio/mpeg", "audio/mp3":
		return "mp3", nil
	case "audio/ogg", "audio/opus":
		return "ogg", nil
	case "audio/pcm", "application/octet-stream":
		return "pcm", nil
	}
	return "", errors.New("volcengine ASR supports wav, mp3, ogg/opus, or pcm audio; convert WebM before upload")
}

func doASRV3Request(c *gin.Context, info *relaycommon.RelayInfo) (*http.Response, error) {
	value, ok := c.Get(contextKeyASRRequest)
	if !ok {
		return nil, errors.New("volcengine ASR request is missing")
	}
	request, ok := value.(asrV3Request)
	if !ok {
		return nil, errors.New("invalid volcengine ASR request")
	}
	auth, err := resolveSpeechAuth(info, defaultASRResourceID)
	if err != nil {
		return nil, err
	}
	requestURL, err := speechEndpoint(info.ChannelBaseUrl, defaultASRV3Path, "wss")
	if err != nil {
		return nil, err
	}
	header := http.Header{}
	applySpeechAuthHeaders(header, auth, "")
	header.Set("X-Api-Request-Id", request.RequestID)
	header.Set("X-Api-Sequence", "-1")

	dialer := websocket.DefaultDialer
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	conn, response, err := dialer.DialContext(ctx, requestURL, header)
	if err != nil {
		if response != nil {
			return nil, fmt.Errorf("connect volcengine ASR: status %d: %w", response.StatusCode, err)
		}
		return nil, fmt.Errorf("connect volcengine ASR: %w", err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	payload := buildASRRequestPayload(request)
	frame, err := encodeASRFrame(asrMessageFullClientRequest, asrFlagPositiveSequence, asrSerializationJSON, asrCompressionGzip, 1, payload)
	if err != nil {
		return nil, err
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, frame); err != nil {
		return nil, fmt.Errorf("send volcengine ASR config: %w", err)
	}

	sequence := int32(2)
	for offset := 0; offset < len(request.Audio); offset += asrChunkSize {
		end := offset + asrChunkSize
		if end > len(request.Audio) {
			end = len(request.Audio)
		}
		flags := asrFlagPositiveSequence
		currentSequence := sequence
		if end == len(request.Audio) {
			flags = asrFlagNegativeSequence
			currentSequence = -sequence
		}
		frame, err = encodeASRFrame(asrMessageAudioOnlyRequest, flags, asrSerializationNone, asrCompressionGzip, currentSequence, request.Audio[offset:end])
		if err != nil {
			return nil, err
		}
		if err := conn.WriteMessage(websocket.BinaryMessage, frame); err != nil {
			return nil, fmt.Errorf("send volcengine ASR audio: %w", err)
		}
		sequence++
	}

	var result map[string]any
	for {
		parsed, err := receiveASRFrame(conn)
		if err != nil {
			return nil, err
		}
		if parsed.Payload != nil {
			result = parsed.Payload
		}
		if parsed.Flags == asrFlagNegativeSequence || parsed.Sequence < 0 || isASRFinal(parsed.Payload) {
			break
		}
	}
	text := extractASRText(result)
	if text == "" {
		return nil, errors.New("volcengine ASR returned no transcript")
	}
	duration := extractASRDuration(result)
	if duration <= 0 {
		duration = estimateASRDuration(request.Audio, request.AudioFormat)
	}
	responseBody, contentType, err := buildASRResponseBody(text, request.Language, duration, request.ResponseFormat)
	if err != nil {
		return nil, err
	}
	usage := audioInputUsage(duration, len(request.Audio))
	c.Set("volcengine_asr_v3_usage", usage)
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{contentType}},
		Body:       io.NopCloser(bytes.NewReader(responseBody)),
	}, nil
}

func isASRFinal(payload map[string]any) bool {
	if payload == nil {
		return false
	}
	for _, key := range []string{"is_final", "final", "isFinal"} {
		if value, ok := payload[key].(bool); ok && value {
			return true
		}
	}
	if result, ok := payload["result"].(map[string]any); ok {
		return isASRFinal(result)
	}
	return false
}

func buildASRRequestPayload(request asrV3Request) []byte {
	codec := "raw"
	if request.AudioFormat == "ogg" {
		codec = "opus"
	}
	audio := map[string]any{
		"format":  request.AudioFormat,
		"codec":   codec,
		"rate":    defaultASRSampleRate,
		"bits":    16,
		"channel": 1,
	}
	if request.Language != "" {
		audio["language"] = normalizeASRLanguage(request.Language)
	}
	payload := map[string]any{
		"user":  map[string]any{"uid": "new-api"},
		"audio": audio,
		"request": map[string]any{
			"reqid":       request.RequestID,
			"model_name":  "bigmodel",
			"enable_punc": true,
			"enable_itn":  true,
			"enable_ddc":  false,
		},
	}
	data, _ := json.Marshal(payload)
	return data
}

func normalizeASRLanguage(language string) string {
	switch strings.ToLower(strings.ReplaceAll(strings.TrimSpace(language), "_", "-")) {
	case "zh", "zh-cn":
		return "zh-CN"
	case "en", "en-us":
		return "en-US"
	default:
		return strings.TrimSpace(language)
	}
}

func encodeASRFrame(messageType, flags, serialization, compression int, sequence int32, payload []byte) ([]byte, error) {
	if compression == asrCompressionGzip {
		var compressed bytes.Buffer
		writer := gzip.NewWriter(&compressed)
		if _, err := writer.Write(payload); err != nil {
			return nil, err
		}
		if err := writer.Close(); err != nil {
			return nil, err
		}
		payload = compressed.Bytes()
	}
	buf := bytes.NewBuffer([]byte{0x11, byte(messageType<<4 | flags), byte(serialization<<4 | compression), 0x00})
	if err := binary.Write(buf, binary.BigEndian, sequence); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.BigEndian, uint32(len(payload))); err != nil {
		return nil, err
	}
	_, _ = buf.Write(payload)
	return buf.Bytes(), nil
}

func receiveASRFrame(conn *websocket.Conn) (*asrV3Frame, error) {
	_, raw, err := conn.ReadMessage()
	if err != nil {
		return nil, fmt.Errorf("receive volcengine ASR response: %w", err)
	}
	if len(raw) < 8 {
		return nil, errors.New("volcengine ASR response is too short")
	}
	headerSize := int(raw[0]&0x0f) * 4
	messageType := int(raw[1] >> 4)
	flags := int(raw[1] & 0x0f)
	serialization := int(raw[2] >> 4)
	compression := int(raw[2] & 0x0f)
	offset := headerSize
	frame := &asrV3Frame{MessageType: messageType, Flags: flags}
	if flags == asrFlagPositiveSequence || flags == asrFlagNegativeSequence {
		if len(raw) < offset+4 {
			return nil, errors.New("volcengine ASR response sequence is missing")
		}
		frame.Sequence = int32(binary.BigEndian.Uint32(raw[offset : offset+4]))
		offset += 4
	}
	if messageType == asrMessageError {
		if len(raw) < offset+8 {
			return nil, errors.New("volcengine ASR error response is too short")
		}
		code := binary.BigEndian.Uint32(raw[offset : offset+4])
		size := int(binary.BigEndian.Uint32(raw[offset+4 : offset+8]))
		if len(raw) < offset+8+size {
			return nil, errors.New("volcengine ASR error payload is truncated")
		}
		return nil, fmt.Errorf("volcengine ASR error %d: %s", code, string(raw[offset+8:offset+8+size]))
	}
	if messageType != asrMessageFullServerResponse {
		return frame, nil
	}
	if len(raw) < offset+4 {
		return nil, errors.New("volcengine ASR payload size is missing")
	}
	size := int(binary.BigEndian.Uint32(raw[offset : offset+4]))
	offset += 4
	if len(raw) < offset+size {
		return nil, errors.New("volcengine ASR payload is truncated")
	}
	payload := raw[offset : offset+size]
	if compression == asrCompressionGzip {
		reader, err := gzip.NewReader(bytes.NewReader(payload))
		if err != nil {
			return nil, fmt.Errorf("decompress volcengine ASR payload: %w", err)
		}
		payload, err = io.ReadAll(reader)
		_ = reader.Close()
		if err != nil {
			return nil, err
		}
	}
	if serialization == asrSerializationJSON && len(payload) > 0 {
		if err := json.Unmarshal(payload, &frame.Payload); err != nil {
			return nil, fmt.Errorf("parse volcengine ASR payload: %w", err)
		}
	}
	return frame, nil
}

func extractASRText(payload map[string]any) string {
	if payload == nil {
		return ""
	}
	if text, ok := payload["text"].(string); ok {
		return strings.TrimSpace(text)
	}
	result := payload["result"]
	switch value := result.(type) {
	case map[string]any:
		if text, ok := value["text"].(string); ok {
			return strings.TrimSpace(text)
		}
	case []any:
		for _, item := range value {
			if object, ok := item.(map[string]any); ok {
				if text, ok := object["text"].(string); ok && strings.TrimSpace(text) != "" {
					return strings.TrimSpace(text)
				}
			}
		}
	}
	return ""
}

func extractASRDuration(payload map[string]any) float64 {
	if payload == nil {
		return 0
	}
	var visit func(any) float64
	visit = func(node any) float64 {
		switch value := node.(type) {
		case map[string]any:
			for _, key := range []string{"duration", "audio_duration"} {
				if raw, ok := value[key]; ok {
					if parsed, err := strconv.ParseFloat(fmt.Sprint(raw), 64); err == nil && parsed > 0 {
						if parsed > 100 {
							parsed /= 1000
						}
						return parsed
					}
				}
			}
			for _, key := range []string{"duration_ms", "audio_duration_ms"} {
				if raw, ok := value[key]; ok {
					if parsed, err := strconv.ParseFloat(fmt.Sprint(raw), 64); err == nil && parsed > 0 {
						return parsed / 1000
					}
				}
			}
			for _, key := range []string{"audio_info", "addition", "additions", "result"} {
				if nested, ok := value[key]; ok {
					if parsed := visit(nested); parsed > 0 {
						return parsed
					}
				}
			}
		case []any:
			for _, item := range value {
				if parsed := visit(item); parsed > 0 {
					return parsed
				}
			}
		}
		return 0
	}
	return visit(payload)
}

func estimateASRDuration(audio []byte, format string) float64 {
	if format == "pcm" {
		return float64(len(audio)) / float64(defaultASRSampleRate*2)
	}
	if format == "wav" && len(audio) > 44 {
		return float64(len(audio)-44) / float64(defaultASRSampleRate*2)
	}
	return 0
}

func audioInputUsage(duration float64, audioBytes int) *dto.Usage {
	tokens := 0
	if duration > 0 {
		tokens = int(math.Ceil(duration) / 60 * 1000)
	} else {
		tokens = int(math.Ceil(float64(audioBytes) / 1000))
	}
	if tokens < 1 {
		tokens = 1
	}
	usage := &dto.Usage{PromptTokens: tokens, TotalTokens: tokens}
	usage.PromptTokensDetails.AudioTokens = tokens
	return usage
}

func buildASRResponseBody(text, language string, duration float64, responseFormat string) ([]byte, string, error) {
	switch strings.ToLower(strings.TrimSpace(responseFormat)) {
	case "text":
		return []byte(text), "text/plain; charset=utf-8", nil
	case "srt":
		return []byte(fmt.Sprintf("1\n00:00:00,000 --> %s\n%s\n", formatSubtitleTime(duration, ','), text)), "text/plain; charset=utf-8", nil
	case "vtt":
		return []byte(fmt.Sprintf("WEBVTT\n\n00:00:00.000 --> %s\n%s\n", formatSubtitleTime(duration, '.'), text)), "text/vtt; charset=utf-8", nil
	case "verbose_json":
		body, err := json.Marshal(dto.WhisperVerboseJSONResponse{Task: "transcribe", Language: language, Duration: duration, Text: text})
		return body, "application/json", err
	case "", "json":
		fallthrough
	default:
		body, err := json.Marshal(dto.AudioResponse{Text: text})
		return body, "application/json", err
	}
}

func formatSubtitleTime(duration float64, separator rune) string {
	if duration <= 0 {
		duration = 1
	}
	totalMillis := int64(math.Ceil(duration * 1000))
	hours := totalMillis / 3600000
	minutes := totalMillis / 60000 % 60
	seconds := totalMillis / 1000 % 60
	millis := totalMillis % 1000
	return fmt.Sprintf("%02d:%02d:%02d%c%03d", hours, minutes, seconds, separator, millis)
}

func handleASRV3Response(c *gin.Context, resp *http.Response) (any, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewErrorWithStatusCode(errors.New("volcengine ASR response is missing"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewErrorWithStatusCode(err, types.ErrorCodeReadResponseBodyFailed, http.StatusBadGateway)
	}
	contentType := firstNonEmpty(resp.Header.Get("Content-Type"), "application/json")
	c.Data(http.StatusOK, contentType, body)
	if usage, ok := c.Get("volcengine_asr_v3_usage"); ok {
		if typed, ok := usage.(*dto.Usage); ok {
			return typed, nil
		}
	}
	return audioInputUsage(0, len(body)), nil
}
