package zhipu_4v

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
)

func TestRequestOpenAI2ZhipuPreservesReasoningEffort(t *testing.T) {
	got := requestOpenAI2Zhipu(dto.GeneralOpenAIRequest{
		Model:           "glm-4.5",
		ReasoningEffort: "high",
	})

	if got.ReasoningEffort != "high" {
		t.Fatalf("reasoning_effort = %q, want %q", got.ReasoningEffort, "high")
	}
}
