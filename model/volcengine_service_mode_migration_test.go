package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateVolcengineServiceModes(t *testing.T) {
	previousDB := DB
	previousType := common.MainDatabaseType()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Channel{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousType)
	})

	legacy := &Channel{
		Type: constant.ChannelTypeVolcEngine,
		Name: "legacy-voice",
	}
	legacy.SetOtherSettings(dto.ChannelOtherSettings{
		VolcengineServiceMode: "speech_tts_v3",
		VolcengineResourceID:  "seed-tts-2.0",
	})
	require.NoError(t, db.Create(legacy).Error)

	ark := &Channel{
		Type: constant.ChannelTypeVolcEngine,
		Name: "ark",
	}
	ark.SetOtherSettings(dto.ChannelOtherSettings{
		VolcengineServiceMode: "ark",
	})
	require.NoError(t, db.Create(ark).Error)

	require.NoError(t, MigrateVolcengineServiceModes())

	var migrated Channel
	require.NoError(t, db.First(&migrated, legacy.Id).Error)
	migratedSettings := migrated.GetOtherSettings()
	assert.Equal(t, unifiedVolcengineServiceMode, migratedSettings.VolcengineServiceMode)
	assert.Empty(t, migratedSettings.VolcengineResourceID)

	var unchanged Channel
	require.NoError(t, db.First(&unchanged, ark.Id).Error)
	assert.Equal(t, "ark", unchanged.GetOtherSettings().VolcengineServiceMode)
}

func TestMigrateDoubaoVoiceChannels(t *testing.T) {
	previousDB := DB
	previousType := common.MainDatabaseType()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Channel{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousType)
	})

	voice := &Channel{
		Type: constant.ChannelTypeVolcEngine,
		Name: "legacy-voice",
	}
	voice.SetOtherSettings(dto.ChannelOtherSettings{
		VolcengineServiceMode: unifiedVolcengineServiceMode,
	})
	require.NoError(t, db.Create(voice).Error)

	ark := &Channel{
		Type: constant.ChannelTypeVolcEngine,
		Name: "ark",
	}
	ark.SetOtherSettings(dto.ChannelOtherSettings{
		VolcengineServiceMode: "ark",
	})
	require.NoError(t, db.Create(ark).Error)

	require.NoError(t, MigrateDoubaoVoiceChannels())

	var migrated Channel
	require.NoError(t, db.First(&migrated, voice.Id).Error)
	assert.Equal(t, constant.ChannelTypeDoubaoVoice, migrated.Type)

	var unchanged Channel
	require.NoError(t, db.First(&unchanged, ark.Id).Error)
	assert.Equal(t, constant.ChannelTypeVolcEngine, unchanged.Type)
}
