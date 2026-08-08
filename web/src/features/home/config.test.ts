/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  HOME_PAGE_LANGUAGE_CODES,
  parseHomePageConfig,
  resolveHomePageLocale,
  serializeHomePageConfig,
} from './config'

describe('home page configuration', () => {
  test('provides the existing built-in copy for every interface language', () => {
    const config = parseHomePageConfig('')

    assert.deepEqual(Object.keys(config.locales), HOME_PAGE_LANGUAGE_CODES)
    assert.equal(
      config.locales.en.hero.title,
      'For every important conversation'
    )
    assert.equal(config.locales.zhCN.hero.title, '为每一次重要沟通')
    assert.equal(config.locales.zhTW.hero.title, '为每一次重要沟通')
    assert.equal(
      config.locales.fr.hero.title,
      'For every important conversation'
    )
  })

  test('resolves configured copy from the active global interface language', () => {
    const config = parseHomePageConfig({
      locales: {
        ja: {
          hero: { title: '重要な会話に備える' },
          cta: { actionLabel: 'トレーニングを開始' },
        },
      },
    })

    assert.equal(
      resolveHomePageLocale(config, 'ja').hero.title,
      '重要な会話に備える'
    )
    assert.equal(
      resolveHomePageLocale(config, 'ja').cta.actionLabel,
      'トレーニングを開始'
    )
    assert.equal(
      resolveHomePageLocale(config, 'fr-FR').hero.title,
      'For every important conversation'
    )
  })

  test('migrates the first structured string format without losing behavior', () => {
    const config = parseHomePageConfig({
      sections: { stats: false },
      hero: { title: 'One title for every language' },
      cta: { actionLabel: 'Open training' },
    })

    assert.equal(config.sections.stats, false)
    assert.equal(config.locales.en.hero.title, 'One title for every language')
    assert.equal(config.locales.zhCN.hero.title, 'One title for every language')
    assert.equal(config.locales.vi.cta.actionLabel, 'Open training')
  })

  test('serializes malformed or partial values into a complete versioned config', () => {
    const serialized = serializeHomePageConfig(
      parseHomePageConfig('{"sections":{"workflow":"false"}}')
    )
    const parsed = JSON.parse(serialized) as {
      version: number
      sections: { workflow: boolean }
      locales: Record<string, unknown>
    }

    assert.equal(parsed.version, 2)
    assert.equal(parsed.sections.workflow, false)
    assert.deepEqual(Object.keys(parsed.locales), HOME_PAGE_LANGUAGE_CODES)
  })
})
