package relay

import (
	"net/http"
	"testing"
)

func TestIsSuccessfulTaskSubmissionStatus(t *testing.T) {
	for _, status := range []int{http.StatusOK, http.StatusCreated, http.StatusAccepted, 299} {
		if !isSuccessfulTaskSubmissionStatus(status) {
			t.Fatalf("status %d should be accepted", status)
		}
	}

	for _, status := range []int{199, http.StatusMultipleChoices, http.StatusBadRequest, http.StatusBadGateway} {
		if isSuccessfulTaskSubmissionStatus(status) {
			t.Fatalf("status %d should be rejected", status)
		}
	}
}
