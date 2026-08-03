package volcengine

import (
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertTTSV3RequestUsesConfiguredVoice(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeAudioSpeech,
		ChannelMeta: &relaycommon.ChannelMeta{ChannelOtherSettings: dto.ChannelOtherSettings{
			VolcengineVoice: "zh_female_vv_uranus_bigtts",
		}},
	}
	body, err := convertTTSV3Request(c, info, dto.AudioRequest{
		Input:          "你好",
		ResponseFormat: "wav",
	})
	require.NoError(t, err)
	data, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.Contains(t, string(data), `"speaker":"zh_female_vv_uranus_bigtts"`)
	assert.Contains(t, string(data), `"format":"wav"`)
}

func TestHandleTTSV3ResponseDecodesStreamingAudio(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Set(contextKeyResponseFormat, "mp3")
	info := &relaycommon.RelayInfo{}
	info.SetEstimatePromptTokens(2)
	audio := []byte{1, 2, 3, 4}
	encoded := base64.StdEncoding.EncodeToString(audio)
	resp := &http.Response{Body: io.NopCloser(strings.NewReader(`{"code":0,"data":"` + encoded + `"}` + "\n"))}

	usageAny, relayErr := handleTTSV3Response(c, resp, info)
	require.Nil(t, relayErr)
	usage := usageAny.(*dto.Usage)
	assert.Equal(t, audio, recorder.Body.Bytes())
	assert.Equal(t, 2, usage.PromptTokensDetails.TextTokens)
	assert.Greater(t, usage.CompletionTokenDetails.AudioTokens, 0)
}
