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

func TestResolveRealtimeAuthRequiresLegacyCredentials(t *testing.T) {
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ApiKey: "api-key",
		ChannelOtherSettings: dto.ChannelOtherSettings{
			VolcengineAuthMode: AuthModeAPIKey,
		},
	}}
	_, err := resolveRealtimeAuth(info)
	require.ErrorContains(t, err, "requires legacy")
}

func TestResolveRealtimeAuthUsesFixedAppKeyByDefault(t *testing.T) {
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ApiKey: "access-key",
		ChannelOtherSettings: dto.ChannelOtherSettings{
			VolcengineAuthMode: AuthModeLegacy,
			VolcengineAppID:    "app-id",
		},
	}}
	auth, err := resolveRealtimeAuth(info)
	require.NoError(t, err)
	assert.Equal(t, defaultRealtimeAppKey, auth.AppKey)

	header := http.Header{}
	applySpeechAuthHeaders(header, auth, "connect-id")
	assert.Equal(t, "app-id", header.Get("X-Api-App-Id"))
	assert.Equal(t, "access-key", header.Get("X-Api-Access-Key"))
	assert.Equal(t, defaultRealtimeAppKey, header.Get("X-Api-App-Key"))
	assert.Equal(t, defaultRealtimeResourceID, header.Get("X-Api-Resource-Id"))
	assert.Equal(t, "connect-id", header.Get("X-Api-Connect-Id"))
}

func TestApplySpeechAuthHeadersDoesNotUseAppIDAsAppKey(t *testing.T) {
	header := http.Header{}
	applySpeechAuthHeaders(header, speechAuth{
		Mode:       AuthModeLegacy,
		AppID:      "app-id",
		Secret:     "access-key",
		ResourceID: defaultTTSResourceID,
	}, "")
	assert.Empty(t, header.Get("X-Api-App-Key"))
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
