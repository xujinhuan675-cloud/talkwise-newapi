package volcengine

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSpeechEndpointUsesServicePathAndWebsocketScheme(t *testing.T) {
	endpoint, err := speechEndpoint("https://openspeech.bytedance.com", defaultRealtimeV3Path, "wss")
	require.NoError(t, err)
	assert.Equal(t, "wss://openspeech.bytedance.com/api/v3/realtime/dialogue", endpoint)
}

func TestResolveRealtimeAuthAcceptsAPIKeyCredentials(t *testing.T) {
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ApiKey: "api-key",
	}}
	auth, err := resolveRealtimeAuth(info)
	require.NoError(t, err)
	header := http.Header{}
	applySpeechAuthHeaders(header, auth, "")
	assert.Equal(t, "api-key", header.Get("X-Api-Key"))
	assert.Empty(t, header.Get("X-Api-App-Id"))
	assert.Empty(t, header.Get("X-Api-Access-Key"))
}

func TestApplySpeechAuthHeadersUsesAPIKeyOnly(t *testing.T) {
	header := http.Header{}
	applySpeechAuthHeaders(header, speechAuth{
		Secret:     "api-key",
		ResourceID: defaultTTSResourceID,
	}, "connect-id")
	assert.Equal(t, "api-key", header.Get("X-Api-Key"))
	assert.Empty(t, header.Get("X-Api-App-Id"))
	assert.Empty(t, header.Get("X-Api-App-Key"))
	assert.Empty(t, header.Get("X-Api-Access-Key"))
	assert.Equal(t, defaultTTSResourceID, header.Get("X-Api-Resource-Id"))
	assert.Equal(t, "connect-id", header.Get("X-Api-Connect-Id"))
}

func TestResolvedServiceModeRoutesUnifiedVoiceByRelayMode(t *testing.T) {
	tests := []struct {
		name string
		mode int
		want string
	}{
		{name: "tts", mode: relayconstant.RelayModeAudioSpeech, want: RouteTTSV3},
		{name: "stt", mode: relayconstant.RelayModeAudioTranscription, want: RouteASRV3},
		{name: "translation", mode: relayconstant.RelayModeAudioTranslation, want: RouteASRV3},
		{name: "realtime", mode: relayconstant.RelayModeRealtime, want: RouteRealtimeV3},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			info := &relaycommon.RelayInfo{
				RelayMode: test.mode,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelOtherSettings: dto.ChannelOtherSettings{
						VolcengineServiceMode: ServiceModeVoiceV3,
					},
				},
			}
			assert.Equal(t, test.want, resolvedServiceMode(info))
		})
	}
}

func TestSpeechResourceIDKeepsRealtimeModelSeparateFromResourceID(t *testing.T) {
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: defaultRealtimeModel,
		},
	}

	assert.Equal(t, defaultRealtimeResourceID, speechResourceID(info, defaultRealtimeResourceID))
}
