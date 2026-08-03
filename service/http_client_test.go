package service

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
)

func TestNewRelayHTTPTransportUsesConfiguredConnectionLimits(t *testing.T) {
	previousMaxIdleConns := common.RelayMaxIdleConns
	previousMaxIdleConnsPerHost := common.RelayMaxIdleConnsPerHost
	previousMaxConnsPerHost := common.RelayMaxConnsPerHost
	previousIdleConnTimeout := common.RelayIdleConnTimeout
	t.Cleanup(func() {
		common.RelayMaxIdleConns = previousMaxIdleConns
		common.RelayMaxIdleConnsPerHost = previousMaxIdleConnsPerHost
		common.RelayMaxConnsPerHost = previousMaxConnsPerHost
		common.RelayIdleConnTimeout = previousIdleConnTimeout
	})

	common.RelayMaxIdleConns = 2048
	common.RelayMaxIdleConnsPerHost = 512
	common.RelayMaxConnsPerHost = 256
	common.RelayIdleConnTimeout = 120

	transport := newRelayHTTPTransport()
	assert.Equal(t, 2048, transport.MaxIdleConns)
	assert.Equal(t, 512, transport.MaxIdleConnsPerHost)
	assert.Equal(t, 256, transport.MaxConnsPerHost)
	assert.Equal(t, 120*time.Second, transport.IdleConnTimeout)
}
