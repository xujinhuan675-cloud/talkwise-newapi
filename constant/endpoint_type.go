package constant

import kittypes "github.com/QuantumNous/new-api/relaykit/types"

type EndpointType = kittypes.EndpointType

const (
	EndpointTypeOpenAI                = kittypes.EndpointTypeOpenAI
	EndpointTypeOpenAIResponse        = kittypes.EndpointTypeOpenAIResponse
	EndpointTypeOpenAIResponseCompact = kittypes.EndpointTypeOpenAIResponseCompact
	EndpointTypeOpenAIAlphaSearch     = kittypes.EndpointTypeOpenAIAlphaSearch
	EndpointTypeAnthropic             = kittypes.EndpointTypeAnthropic
	EndpointTypeGemini                = kittypes.EndpointTypeGemini
	EndpointTypeJinaRerank            = kittypes.EndpointTypeJinaRerank
	EndpointTypeImageGeneration       = kittypes.EndpointTypeImageGeneration
	EndpointTypeEmbeddings            = kittypes.EndpointTypeEmbeddings
	EndpointTypeOpenAIVoice           = kittypes.EndpointTypeOpenAIVoice
	EndpointTypeOpenAIVideo           = kittypes.EndpointTypeOpenAIVideo
	//EndpointTypeMidjourney     EndpointType = "midjourney-proxy"
	//EndpointTypeSuno           EndpointType = "suno-proxy"
	//EndpointTypeKling          EndpointType = "kling"
	//EndpointTypeJimeng         EndpointType = "jimeng"
)
