package volcengine

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
)

type ttsV3Request struct {
	RequestParams ttsV3RequestParams `json:"req_params"`
}

type ttsV3RequestParams struct {
	Text             string           `json:"text"`
	Speaker          string           `json:"speaker"`
	AudioParams      ttsV3AudioParams `json:"audio_params"`
	Speed            float64          `json:"speed,omitempty"`
	ExplicitLanguage string           `json:"explicit_language,omitempty"`
	Additions        string           `json:"additions,omitempty"`
}

type ttsV3AudioParams struct {
	Format     string `json:"format"`
	SampleRate int    `json:"sample_rate"`
}

type ttsV3Response struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    string `json:"data"`
}

func convertTTSV3Request(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	if info.RelayMode != relayconstant.RelayModeAudioSpeech {
		return nil, fmt.Errorf("volcengine TTS V3 channel cannot handle relay mode %d", info.RelayMode)
	}
	if strings.TrimSpace(request.Input) == "" {
		return nil, errors.New("input is required")
	}
	format := normalizeTTSV3Format(request.ResponseFormat)
	voice := firstNonEmpty(request.Voice, info.ChannelOtherSettings.VolcengineVoice, defaultVolcengineVoice)
	payload := ttsV3Request{RequestParams: ttsV3RequestParams{
		Text:    request.Input,
		Speaker: mapVoiceType(voice),
		AudioParams: ttsV3AudioParams{
			Format:     format,
			SampleRate: 24000,
		},
		Speed: lo.FromPtrOr(request.Speed, 0),
	}}
	if len(request.Metadata) > 0 {
		if err := json.Unmarshal(request.Metadata, &payload); err != nil {
			return nil, fmt.Errorf("invalid volcengine TTS metadata: %w", err)
		}
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal volcengine TTS V3 request: %w", err)
	}
	c.Set(contextKeyResponseFormat, format)
	c.Set(contextKeyVolcengineService, RouteTTSV3)
	return bytes.NewReader(data), nil
}

func normalizeTTSV3Format(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "wav":
		return "wav"
	case "pcm":
		return "pcm"
	case "ogg", "opus", "ogg_opus":
		return "ogg_opus"
	default:
		return "mp3"
	}
}

func handleTTSV3Response(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (any, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewErrorWithStatusCode(errors.New("volcengine TTS response is missing"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}
	defer resp.Body.Close()

	var audio bytes.Buffer
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		line = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if line == "" || line == "[DONE]" {
			continue
		}
		var chunk ttsV3Response
		if err := json.Unmarshal([]byte(line), &chunk); err != nil {
			return nil, types.NewErrorWithStatusCode(fmt.Errorf("invalid volcengine TTS response: %w", err), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
		}
		if chunk.Code != 0 && chunk.Code != 20000000 {
			return nil, types.NewErrorWithStatusCode(fmt.Errorf("volcengine TTS failed: %s (code %d)", chunk.Message, chunk.Code), types.ErrorCodeBadResponse, http.StatusBadGateway)
		}
		if chunk.Data == "" {
			continue
		}
		decoded, err := base64.StdEncoding.DecodeString(chunk.Data)
		if err != nil {
			return nil, types.NewErrorWithStatusCode(errors.New("volcengine TTS returned invalid audio data"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
		}
		_, _ = audio.Write(decoded)
	}
	if err := scanner.Err(); err != nil {
		return nil, types.NewErrorWithStatusCode(fmt.Errorf("read volcengine TTS response: %w", err), types.ErrorCodeReadResponseBodyFailed, http.StatusBadGateway)
	}
	if audio.Len() == 0 {
		return nil, types.NewErrorWithStatusCode(errors.New("volcengine TTS returned no audio"), types.ErrorCodeBadResponseBody, http.StatusBadGateway)
	}

	format := normalizeTTSV3Format(c.GetString(contextKeyResponseFormat))
	c.Data(http.StatusOK, getContentTypeByEncoding(format), audio.Bytes())
	promptTokens := info.GetEstimatePromptTokens()
	completionTokens := int(math.Ceil(float64(audio.Len()) / 1000))
	if format == "pcm" {
		duration := float64(audio.Len()) / float64(24000*2)
		completionTokens = int(math.Ceil(duration) / 60 * 1000)
	}
	if completionTokens < 1 {
		completionTokens = 1
	}
	usage := &dto.Usage{
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      promptTokens + completionTokens,
	}
	usage.PromptTokensDetails.TextTokens = promptTokens
	usage.CompletionTokenDetails.AudioTokens = completionTokens
	return usage, nil
}
