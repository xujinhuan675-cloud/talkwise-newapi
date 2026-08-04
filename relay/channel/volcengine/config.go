package volcengine

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	channelconstant "github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/google/uuid"
)

const (
	ServiceModeArk     = "ark"
	ServiceModeVoiceV3 = "speech_voice_v3"

	RouteTTSV3      = "tts_v3"
	RouteASRV3      = "asr_v3"
	RouteRealtimeV3 = "realtime_v3"

	defaultSpeechBaseURL        = "https://openspeech.bytedance.com"
	defaultTTSV3Path            = "/api/v3/tts/unidirectional"
	defaultASRV3Path            = "/api/v3/sauc/bigmodel"
	defaultRealtimeV3Path       = "/api/v3/realtime/dialogue"
	defaultTTSResourceID        = "seed-tts-2.0"
	defaultASRResourceID        = "volc.bigasr.sauc.duration"
	defaultRealtimeResourceID   = "volc.speech.dialog"
	defaultRealtimeModel        = "1.2.1.1"
	defaultVolcengineVoice      = "zh_female_vv_uranus_bigtts"
	defaultASRSampleRate        = 16000
	defaultRealtimeSampleRate   = 16000
	defaultRealtimeOutputRate   = 24000
	contextKeyASRRequest        = "volcengine_asr_v3_request"
	contextKeyVolcengineService = "volcengine_service_mode"
)

type speechAuth struct {
	Secret     string
	ResourceID string
}

func serviceMode(info *relaycommon.RelayInfo) string {
	if info == nil {
		return ServiceModeArk
	}
	mode := strings.TrimSpace(info.ChannelOtherSettings.VolcengineServiceMode)
	if mode == "" {
		if info.ChannelMeta != nil && info.ChannelMeta.ChannelType == channelconstant.ChannelTypeDoubaoVoice {
			return ServiceModeVoiceV3
		}
		return ServiceModeArk
	}
	return mode
}

func resolvedServiceMode(info *relaycommon.RelayInfo) string {
	mode := serviceMode(info)
	if mode != ServiceModeVoiceV3 || info == nil {
		return mode
	}

	switch info.RelayMode {
	case relayconstant.RelayModeAudioSpeech:
		return RouteTTSV3
	case relayconstant.RelayModeAudioTranscription,
		relayconstant.RelayModeAudioTranslation:
		return RouteASRV3
	case relayconstant.RelayModeRealtime:
		return RouteRealtimeV3
	default:
		return ServiceModeVoiceV3
	}
}

// ResolveServiceModeForModel is used by channel diagnostics only. Runtime
// dispatch for a unified voice channel is endpoint-driven; model heuristics are
// limited to selecting a useful default probe path.
func ResolveServiceModeForModel(mode, model string) string {
	if mode != ServiceModeVoiceV3 {
		return mode
	}
	normalizedModel := strings.ToLower(strings.TrimSpace(model))
	switch {
	case normalizedModel == defaultRealtimeModel ||
		strings.Contains(normalizedModel, "realtime"):
		return RouteRealtimeV3
	case normalizedModel == defaultASRResourceID ||
		strings.Contains(normalizedModel, "asr") ||
		strings.Contains(normalizedModel, "transcrib"):
		return RouteASRV3
	default:
		return RouteTTSV3
	}
}

func speechResourceID(info *relaycommon.RelayInfo, fallback string) string {
	if info != nil {
		if resourceID := strings.TrimSpace(info.ChannelOtherSettings.VolcengineResourceID); resourceID != "" {
			return resourceID
		}
		if fallback != defaultRealtimeResourceID {
			if model := strings.TrimSpace(info.UpstreamModelName); model != "" {
				return model
			}
		}
	}
	return fallback
}

func resolveSpeechAuth(info *relaycommon.RelayInfo, fallbackResourceID string) (speechAuth, error) {
	if info == nil {
		return speechAuth{}, fmt.Errorf("volcengine channel metadata is missing")
	}
	auth := speechAuth{
		Secret:     strings.TrimSpace(info.ApiKey),
		ResourceID: speechResourceID(info, fallbackResourceID),
	}
	if auth.Secret == "" {
		return speechAuth{}, fmt.Errorf("volcengine credential is required")
	}
	if auth.ResourceID == "" {
		return speechAuth{}, fmt.Errorf("volcengine resource ID is required")
	}
	return auth, nil
}

func resolveRealtimeAuth(info *relaycommon.RelayInfo) (speechAuth, error) {
	return resolveSpeechAuth(info, defaultRealtimeResourceID)
}

func applySpeechAuthHeaders(header http.Header, auth speechAuth, connectID string) {
	header.Set("X-Api-Resource-Id", auth.ResourceID)
	header.Set("X-Api-Key", auth.Secret)
	if connectID != "" {
		header.Set("X-Api-Connect-Id", connectID)
	}
}

func speechEndpoint(baseURL, defaultPath, defaultScheme string) (string, error) {
	raw := strings.TrimSpace(baseURL)
	if raw == "" {
		raw = defaultSpeechBaseURL
	}
	if !strings.Contains(raw, "://") {
		raw = defaultScheme + "://" + raw
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return "", fmt.Errorf("invalid volcengine speech base URL")
	}
	if parsed.Path == "" || parsed.Path == "/" {
		parsed.Path = defaultPath
	}
	if defaultScheme == "wss" {
		switch parsed.Scheme {
		case "https":
			parsed.Scheme = "wss"
		case "http":
			parsed.Scheme = "ws"
		}
	}
	return strings.TrimRight(parsed.String(), "/"), nil
}

func newConnectID() string {
	return uuid.New().String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
