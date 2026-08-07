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
export type ConversationAssistCopy = {
  english: string
  chinese: string
}

export const CONVERSATION_ASSIST_COPY = {
  productName: {
    english: 'In-conversation assist',
    chinese: '临场辅助',
  },
  setupDescription: {
    english:
      'Prepare side guidance for an ongoing human conversation. Audio is not captured automatically; enter the latest turn manually during the conversation.',
    chinese:
      '为正在进行的真人会话准备辅助建议。系统不会自动采集音频；请在会话中手动输入最新一句。',
  },
  turnDescription: {
    english:
      'Choose who just spoke, then manually enter or paste the latest turn. The assistant suggests what to say without speaking for you.',
    chinese:
      '选择刚才是谁说的，再手动输入或粘贴最新一句。辅助会告诉你如何回应，但不会代替你发言。',
  },
  userSpeaker: {
    english: 'Me',
    chinese: '我',
  },
  counterpartSpeaker: {
    english: 'Other person',
    chinese: '对方',
  },
} as const satisfies Record<string, ConversationAssistCopy>
