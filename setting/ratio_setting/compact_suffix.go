package ratio_setting

import "strings"

const CompactModelSuffix = "-openai-compact"

// WithCompactModelSuffix preserves the responses compact endpoint's model
// lookup contract after the upstream compact-model helper was removed.
func WithCompactModelSuffix(modelName string) string {
	if strings.HasSuffix(modelName, CompactModelSuffix) {
		return modelName
	}
	return modelName + CompactModelSuffix
}
