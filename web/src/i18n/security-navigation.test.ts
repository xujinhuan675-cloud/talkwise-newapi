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
import { createInstance } from 'i18next'
import { describe, expect, test } from 'vitest'

import en from './locales/en.json'
import fr from './locales/fr.json'
import ja from './locales/ja.json'
import ru from './locales/ru.json'
import vi from './locales/vi.json'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh.json'

const resources = { en, fr, ja, ru, vi, zhCN, zhTW }

describe('security navigation translations', () => {
  test('follows language changes instead of showing the English fallback', async () => {
    const i18n = createInstance()
    await i18n.init({ resources, lng: 'en', fallbackLng: 'en' })
    expect(i18n.t('Security & Access')).toBe('Security & Access')
    await i18n.changeLanguage('zhCN')
    expect(i18n.t('Security & Access')).toBe('安全与访问')
    await i18n.changeLanguage('zhTW')
    expect(i18n.t('Security & Access')).toBe('安全與存取')
    await i18n.changeLanguage('en')
    expect(i18n.t('Security & Access')).toBe('Security & Access')
  })

  test.each(Object.keys(resources))('provides the security menu label in %s', async (language) => {
    const i18n = createInstance()
    await i18n.init({ resources, lng: language, fallbackLng: false })
    expect(i18n.exists('Security & Access')).toBe(true)
    if (language !== 'en') {
      expect(i18n.t('Security & Access')).not.toBe('Security & Access')
    }
  })
})
