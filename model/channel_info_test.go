package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestChannelInfoScanAcceptsSQLiteTextBlobAndNull(t *testing.T) {
	payload := `{"is_multi_key":true,"multi_key_size":2}`

	tests := []struct {
		name  string
		value interface{}
	}{
		{name: "sqlite text", value: payload},
		{name: "sqlite blob", value: []byte(payload)},
		{name: "null", value: nil},
		{name: "empty text", value: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info := ChannelInfo{MultiKeySize: 99}
			require.NoError(t, info.Scan(tt.value))
			if tt.name == "null" || tt.name == "empty text" {
				require.False(t, info.IsMultiKey)
				require.Zero(t, info.MultiKeySize)
				return
			}
			require.True(t, info.IsMultiKey)
			require.Equal(t, 2, info.MultiKeySize)
		})
	}
}

func TestChannelInfoScanRejectsUnsupportedValue(t *testing.T) {
	var info ChannelInfo
	require.Error(t, info.Scan(123))
}
