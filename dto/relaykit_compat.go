package dto

import kitdto "github.com/QuantumNous/new-api/relaykit/dto"

// Compatibility aliases keep legacy controller imports stable while the
// relay DTO implementation lives under relaykit/dto.
type Request = kitdto.Request
type BaseRequest = kitdto.BaseRequest
type GeneralOpenAIRequest = kitdto.GeneralOpenAIRequest
type AudioRequest = kitdto.AudioRequest
type EmbeddingRequest = kitdto.EmbeddingRequest
type ImageRequest = kitdto.ImageRequest
type Message = kitdto.Message
type StreamOptions = kitdto.StreamOptions
type OpenAIResponsesRequest = kitdto.OpenAIResponsesRequest
type OpenAIResponsesCompactionRequest = kitdto.OpenAIResponsesCompactionRequest
type RerankRequest = kitdto.RerankRequest
type Usage = kitdto.Usage
type ChannelOtherSettings = kitdto.ChannelOtherSettings
type UserSetting = kitdto.UserSetting

const (
	AdvancedCustomModelListPath = kitdto.AdvancedCustomModelListPath
	NotifyTypeChannelTest       = kitdto.NotifyTypeChannelTest
)

var (
	NotifyTypeEmail   = kitdto.NotifyTypeEmail
	NotifyTypeWebhook = kitdto.NotifyTypeWebhook
	NotifyTypeBark    = kitdto.NotifyTypeBark
	NotifyTypeGotify  = kitdto.NotifyTypeGotify
)

var IsOpenAIReasoningOModel = kitdto.IsOpenAIReasoningOModel
