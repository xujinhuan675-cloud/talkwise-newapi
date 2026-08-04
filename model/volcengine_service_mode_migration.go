package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"gorm.io/gorm"
)

const unifiedVolcengineServiceMode = "speech_voice_v3"

var retiredVolcengineServiceModes = map[string]struct{}{
	"speech_tts_v3":      {},
	"speech_asr_v3":      {},
	"speech_realtime_v3": {},
}

// MigrateVolcengineServiceModes converts the retired per-service channel
// modes to the single endpoint-driven voice mode. Resource IDs are cleared
// because the unified adapter selects the default resource for each endpoint.
func MigrateVolcengineServiceModes() error {
	if DB == nil {
		return errors.New("database is not initialized")
	}

	var channels []Channel
	if err := DB.Where("type = ?", constant.ChannelTypeVolcEngine).Find(&channels).Error; err != nil {
		return fmt.Errorf("load Volcengine channels: %w", err)
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		for i := range channels {
			settings := channels[i].GetOtherSettings()
			if _, retired := retiredVolcengineServiceModes[settings.VolcengineServiceMode]; !retired {
				continue
			}

			settings.VolcengineServiceMode = unifiedVolcengineServiceMode
			settings.VolcengineResourceID = ""
			channels[i].SetOtherSettings(settings)
			if err := tx.Model(&Channel{}).
				Where("id = ?", channels[i].Id).
				Update("settings", channels[i].OtherSettings).Error; err != nil {
				return fmt.Errorf("migrate Volcengine channel %d: %w", channels[i].Id, err)
			}
			common.SysLog(fmt.Sprintf("migrated Volcengine channel %d to unified voice mode", channels[i].Id))
		}
		return nil
	})
}

// MigrateDoubaoVoiceChannels separates legacy 45-type voice channels from
// VolcEngine Ark channels while preserving their credentials and model list.
func MigrateDoubaoVoiceChannels() error {
	if DB == nil {
		return errors.New("database is not initialized")
	}

	var channels []Channel
	if err := DB.Where("type = ?", constant.ChannelTypeVolcEngine).Find(&channels).Error; err != nil {
		return fmt.Errorf("load Volcengine channels for Doubao Voice migration: %w", err)
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		for i := range channels {
			settings := channels[i].GetOtherSettings()
			if settings.VolcengineServiceMode != unifiedVolcengineServiceMode {
				continue
			}

			if err := tx.Model(&Channel{}).
				Where("id = ?", channels[i].Id).
				Updates(map[string]any{
					"type":     constant.ChannelTypeDoubaoVoice,
					"settings": channels[i].OtherSettings,
				}).Error; err != nil {
				return fmt.Errorf("migrate Volcengine voice channel %d to Doubao Voice: %w", channels[i].Id, err)
			}
			common.SysLog(fmt.Sprintf("migrated Volcengine voice channel %d to Doubao Voice", channels[i].Id))
		}
		return nil
	})
}
