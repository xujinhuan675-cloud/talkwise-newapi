package volcengine

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProtocolMessageRoundTripPreservesSerializationAndEvent(t *testing.T) {
	message, err := NewMessage(MsgTypeFullClientRequest, MsgTypeFlagWithEvent)
	require.NoError(t, err)
	message.EventType = EventType_StartSession
	message.SessionID = "session-1"
	message.Payload = []byte(`{"request":{"model_version":"1.2.1.1"}}`)

	frame, err := message.Marshal()
	require.NoError(t, err)
	decoded, err := NewMessageFromBytes(frame)
	require.NoError(t, err)
	assert.Equal(t, SerializationJSON, decoded.Serialization)
	assert.Equal(t, CompressionNone, decoded.Compression)
	assert.Equal(t, EventType_StartSession, decoded.EventType)
	assert.Equal(t, "session-1", decoded.SessionID)
	assert.Equal(t, message.Payload, decoded.Payload)
}

func TestProtocolAudioTaskRoundTrip(t *testing.T) {
	message, err := NewMessage(MsgTypeAudioOnlyClient, MsgTypeFlagWithEvent)
	require.NoError(t, err)
	message.EventType = EventType_TaskRequest
	message.SessionID = "session-2"
	message.Payload = []byte{0x00, 0x01, 0x02, 0x03}

	frame, err := message.Marshal()
	require.NoError(t, err)
	decoded, err := NewMessageFromBytes(frame)
	require.NoError(t, err)
	assert.Equal(t, MsgTypeAudioOnlyClient, decoded.MsgType)
	assert.Equal(t, EventType_TaskRequest, decoded.EventType)
	assert.Equal(t, message.Payload, decoded.Payload)
}
