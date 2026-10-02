package types

import kittypes "github.com/QuantumNous/new-api/relaykit/types"

type (
	OpenAIError                  = kittypes.OpenAIError
	ClaudeError                  = kittypes.ClaudeError
	ErrorType                    = kittypes.ErrorType
	ErrorCode                    = kittypes.ErrorCode
	NewAPIError                  = kittypes.NewAPIError
	NewAPIErrorOptions           = kittypes.NewAPIErrorOptions
	ChannelError                 = kittypes.ChannelError
	RelayFormat                  = kittypes.RelayFormat
	EndpointType                 = kittypes.EndpointType
	TokenCountMeta               = kittypes.TokenCountMeta
	TokenType                    = kittypes.TokenType
	FileType                     = kittypes.FileType
	FileMeta                     = kittypes.FileMeta
	FileSource                   = kittypes.FileSource
	URLSource                    = kittypes.URLSource
	Base64Source                 = kittypes.Base64Source
	CachedFileData               = kittypes.CachedFileData
	LocalFileData                = kittypes.LocalFileData
	ConversionDiagnosticSeverity = kittypes.ConversionDiagnosticSeverity
	ConversionDiagnostic         = kittypes.ConversionDiagnostic
	ConversionLossPolicy         = kittypes.ConversionLossPolicy
	ConversionLossError          = kittypes.ConversionLossError
)

const (
	ErrorTypeNewAPIError     = kittypes.ErrorTypeNewAPIError
	ErrorTypeOpenAIError     = kittypes.ErrorTypeOpenAIError
	ErrorTypeClaudeError     = kittypes.ErrorTypeClaudeError
	ErrorTypeMidjourneyError = kittypes.ErrorTypeMidjourneyError
	ErrorTypeGeminiError     = kittypes.ErrorTypeGeminiError
	ErrorTypeRerankError     = kittypes.ErrorTypeRerankError
	ErrorTypeUpstreamError   = kittypes.ErrorTypeUpstreamError

	ErrorCodeInvalidRequest               = kittypes.ErrorCodeInvalidRequest
	ErrorCodeSensitiveWordsDetected       = kittypes.ErrorCodeSensitiveWordsDetected
	ErrorCodeViolationFeeGrokCSAM         = kittypes.ErrorCodeViolationFeeGrokCSAM
	ErrorCodeCountTokenFailed             = kittypes.ErrorCodeCountTokenFailed
	ErrorCodeModelPriceError              = kittypes.ErrorCodeModelPriceError
	ErrorCodeInvalidApiType               = kittypes.ErrorCodeInvalidApiType
	ErrorCodeJsonMarshalFailed            = kittypes.ErrorCodeJsonMarshalFailed
	ErrorCodeDoRequestFailed              = kittypes.ErrorCodeDoRequestFailed
	ErrorCodeGetChannelFailed             = kittypes.ErrorCodeGetChannelFailed
	ErrorCodeGenRelayInfoFailed           = kittypes.ErrorCodeGenRelayInfoFailed
	ErrorCodeChannelNoAvailableKey        = kittypes.ErrorCodeChannelNoAvailableKey
	ErrorCodeChannelParamOverrideInvalid  = kittypes.ErrorCodeChannelParamOverrideInvalid
	ErrorCodeChannelHeaderOverrideInvalid = kittypes.ErrorCodeChannelHeaderOverrideInvalid
	ErrorCodeChannelModelMappedError      = kittypes.ErrorCodeChannelModelMappedError
	ErrorCodeChannelAwsClientError        = kittypes.ErrorCodeChannelAwsClientError
	ErrorCodeChannelInvalidKey            = kittypes.ErrorCodeChannelInvalidKey
	ErrorCodeChannelResponseTimeExceeded  = kittypes.ErrorCodeChannelResponseTimeExceeded
	ErrorCodeReadRequestBodyFailed        = kittypes.ErrorCodeReadRequestBodyFailed
	ErrorCodeConvertRequestFailed         = kittypes.ErrorCodeConvertRequestFailed
	ErrorCodeAccessDenied                 = kittypes.ErrorCodeAccessDenied
	ErrorCodeBadRequestBody               = kittypes.ErrorCodeBadRequestBody
	ErrorCodeReadResponseBodyFailed       = kittypes.ErrorCodeReadResponseBodyFailed
	ErrorCodeBadResponseStatusCode        = kittypes.ErrorCodeBadResponseStatusCode
	ErrorCodeBadResponse                  = kittypes.ErrorCodeBadResponse
	ErrorCodeBadResponseBody              = kittypes.ErrorCodeBadResponseBody
	ErrorCodeEmptyResponse                = kittypes.ErrorCodeEmptyResponse
	ErrorCodeAwsInvokeError               = kittypes.ErrorCodeAwsInvokeError
	ErrorCodeModelNotFound                = kittypes.ErrorCodeModelNotFound
	ErrorCodePromptBlocked                = kittypes.ErrorCodePromptBlocked
	ErrorCodeQueryDataError               = kittypes.ErrorCodeQueryDataError
	ErrorCodeUpdateDataError              = kittypes.ErrorCodeUpdateDataError
	ErrorCodeInsufficientUserQuota        = kittypes.ErrorCodeInsufficientUserQuota
	ErrorCodePreConsumeTokenQuotaFailed   = kittypes.ErrorCodePreConsumeTokenQuotaFailed

	RelayFormatOpenAI                    = kittypes.RelayFormatOpenAI
	RelayFormatClaude                    = kittypes.RelayFormatClaude
	RelayFormatGemini                    = kittypes.RelayFormatGemini
	RelayFormatEmbedding                 = kittypes.RelayFormatEmbedding
	RelayFormatRerank                    = kittypes.RelayFormatRerank
	RelayFormatOpenAIAudio               = kittypes.RelayFormatOpenAIAudio
	RelayFormatOpenAIImage               = kittypes.RelayFormatOpenAIImage
	RelayFormatOpenAIRealtime            = kittypes.RelayFormatOpenAIRealtime
	RelayFormatOpenAIResponses           = kittypes.RelayFormatOpenAIResponses
	RelayFormatOpenAIResponsesCompaction = kittypes.RelayFormatOpenAIResponsesCompaction
	RelayFormatOpenAIAlphaSearch         = kittypes.RelayFormatOpenAIAlphaSearch
	RelayFormatMjProxy                   = kittypes.RelayFormatMjProxy
	RelayFormatTask                      = kittypes.RelayFormatTask

	FileTypeFile                = kittypes.FileTypeFile
	FileTypeImage               = kittypes.FileTypeImage
	FileTypeAudio               = kittypes.FileTypeAudio
	FileTypeVideo               = kittypes.FileTypeVideo
	TokenTypeTokenizer          = kittypes.TokenTypeTokenizer
	TokenTypeTextNumber         = kittypes.TokenTypeTextNumber
	ConversionDiagnosticWarning = kittypes.ConversionDiagnosticWarning
	ConversionDiagnosticError   = kittypes.ConversionDiagnosticError
	ConversionLossPolicyAllow   = kittypes.ConversionLossPolicyAllow
	ConversionLossPolicySafe    = kittypes.ConversionLossPolicySafe
	ConversionLossPolicyStrict  = kittypes.ConversionLossPolicyStrict
	TokenTypeImage              = kittypes.TokenTypeImage
)

var (
	NewError                      = kittypes.NewError
	NewOpenAIError                = kittypes.NewOpenAIError
	InitOpenAIError               = kittypes.InitOpenAIError
	NewErrorWithStatusCode        = kittypes.NewErrorWithStatusCode
	WithOpenAIError               = kittypes.WithOpenAIError
	WithClaudeError               = kittypes.WithClaudeError
	NewChannelError               = kittypes.NewChannelError
	IsChannelError                = kittypes.IsChannelError
	IsSkipRetryError              = kittypes.IsSkipRetryError
	ErrOptionWithSkipRetry        = kittypes.ErrOptionWithSkipRetry
	ErrOptionWithNoRecordErrorLog = kittypes.ErrOptionWithNoRecordErrorLog
	ErrOptionWithStatusCode       = kittypes.ErrOptionWithStatusCode
	ErrOptionWithHideErrMsg       = kittypes.ErrOptionWithHideErrMsg
	IsRecordErrorLog              = kittypes.IsRecordErrorLog
	NewFileMeta                   = kittypes.NewFileMeta
	NewImageFileMeta              = kittypes.NewImageFileMeta
	NewURLFileSource              = kittypes.NewURLFileSource
	NewBase64FileSource           = kittypes.NewBase64FileSource
	NewFileSourceFromData         = kittypes.NewFileSourceFromData
	NewMemoryCachedData           = kittypes.NewMemoryCachedData
	NewDiskCachedData             = kittypes.NewDiskCachedData
	RejectConversionLoss          = kittypes.RejectConversionLoss
)
