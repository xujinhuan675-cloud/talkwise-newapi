package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const defaultTalkWiseHomePageConfig = `{"version":2,"sections":{"stats":true,"features":true,"workflow":true,"cta":true,"scenarioSupport":true},"locales":{"zhCN":{"hero":{"badge":"AI 沟通训练","title":"为每一次重要沟通","highlightedTitle":"做好准备","description":"把重要沟通放进可重复演练的真实场景，在对话中获得提示，并把每次复盘变成下一轮针对性训练。","supportEyebrow":"训练场景","supportDescription":"选择目标、对手角色与难度，让文本、语音与复盘共用同一训练上下文。"},"cta":{"titleFirst":"从下一场","titleSecond":"重要沟通开始准备","description":"进入训练工作台，选择你的场景，开始一次有针对性的演练。","actionLabel":"进入训练"}},"en":{"hero":{"badge":"AI Communication Training","title":"For every important conversation","highlightedTitle":"be prepared","description":"Rehearse realistic conversations, receive guidance in the moment, and turn every review into the next focused practice session.","supportEyebrow":"Training scenarios","supportDescription":"Choose a goal, counterpart, and difficulty, then keep every modality in one training context."},"cta":{"titleFirst":"Prepare for the next","titleSecond":"conversation that matters","description":"Enter the training workspace, choose a scenario, and begin a focused rehearsal.","actionLabel":"Enter training"}},"fr":{"hero":{"badge":"AI Communication Training","title":"For every important conversation","highlightedTitle":"be prepared","description":"Rehearse realistic conversations, receive guidance in the moment, and turn every review into the next focused practice session.","supportEyebrow":"Training scenarios","supportDescription":"Choose a goal, counterpart, and difficulty, then keep every modality in one training context."},"cta":{"titleFirst":"Prepare for the next","titleSecond":"conversation that matters","description":"Enter the training workspace, choose a scenario, and begin a focused rehearsal.","actionLabel":"Enter training"}},"ru":{"hero":{"badge":"AI Communication Training","title":"For every important conversation","highlightedTitle":"be prepared","description":"Rehearse realistic conversations, receive guidance in the moment, and turn every review into the next focused practice session.","supportEyebrow":"Training scenarios","supportDescription":"Choose a goal, counterpart, and difficulty, then keep every modality in one training context."},"cta":{"titleFirst":"Prepare for the next","titleSecond":"conversation that matters","description":"Enter the training workspace, choose a scenario, and begin a focused rehearsal.","actionLabel":"Enter training"}},"ja":{"hero":{"badge":"AI Communication Training","title":"For every important conversation","highlightedTitle":"be prepared","description":"Rehearse realistic conversations, receive guidance in the moment, and turn every review into the next focused practice session.","supportEyebrow":"Training scenarios","supportDescription":"Choose a goal, counterpart, and difficulty, then keep every modality in one training context."},"cta":{"titleFirst":"Prepare for the next","titleSecond":"conversation that matters","description":"Enter the training workspace, choose a scenario, and begin a focused rehearsal.","actionLabel":"Enter training"}},"vi":{"hero":{"badge":"AI Communication Training","title":"For every important conversation","highlightedTitle":"be prepared","description":"Rehearse realistic conversations, receive guidance in the moment, and turn every review into the next focused practice session.","supportEyebrow":"Training scenarios","supportDescription":"Choose a goal, counterpart, and difficulty, then keep every modality in one training context."},"cta":{"titleFirst":"Prepare for the next","titleSecond":"conversation that matters","description":"Enter the training workspace, choose a scenario, and begin a focused rehearsal.","actionLabel":"Enter training"}},"zhTW":{"hero":{"badge":"AI 沟通训练","title":"为每一次重要沟通","highlightedTitle":"做好准备","description":"把重要沟通放进可重复演练的真实场景，在对话中获得提示，并把每次复盘变成下一轮针对性训练。","supportEyebrow":"训练场景","supportDescription":"选择目标、对手角色与难度，让文本、语音与复盘共用同一训练上下文。"},"cta":{"titleFirst":"从下一场","titleSecond":"重要沟通开始准备","description":"进入训练工作台，选择你的场景，开始一次有针对性的演练。","actionLabel":"进入训练"}}}}`

// MigrateTalkWiseSiteOptions materializes effective built-in presentation
// defaults so the database, settings UI, status API, and public pages share
// the same source of truth. Existing non-empty administrator values win.
func MigrateTalkWiseSiteOptions() error {
	if DB == nil {
		return errors.New("database is not initialized")
	}

	defaults := []Option{
		{Key: "Footer", Value: common.DefaultFooter},
		{Key: "HomePageConfig", Value: defaultTalkWiseHomePageConfig},
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		for _, fallback := range defaults {
			var option Option
			err := tx.Where(&Option{Key: fallback.Key}).First(&option).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if err := tx.Create(&fallback).Error; err != nil {
					return fmt.Errorf("create site option %s: %w", fallback.Key, err)
				}
				continue
			}
			if err != nil {
				return fmt.Errorf("read site option %s: %w", fallback.Key, err)
			}
			if strings.TrimSpace(option.Value) != "" {
				continue
			}
			if err := tx.Model(&option).Update("value", fallback.Value).Error; err != nil {
				return fmt.Errorf("initialize site option %s: %w", fallback.Key, err)
			}
		}
		return nil
	})
}
