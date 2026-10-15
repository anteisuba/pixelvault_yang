import { describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_V3_FACE_IDS,
  ASSISTANT_V3_LIMITS,
} from '@/constants/assistant-v3'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { AssistantPromptPersona } from '@/types/assistant-persona'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/lora-dialect-section', () => ({
  buildLoraDialectSection: () => '',
}))

vi.mock('@/services/kernel/assistant-operator.service', () => ({
  buildAssistantMemorySection: () => '',
  buildCanvasModelDialectSection: () => '',
  buildCharacterSection: () => '',
  buildCreatorSection: () => '',
  buildModelDialectSection: () => '',
  buildPersonaStyleSection: () => '',
  resolveResponseLanguage: () => 'chinese',
  RESPONSE_LANGUAGE_LABELS: { chinese: 'Chinese' },
}))

import { buildAssistantV3SystemPrompt } from './assistant-v3-prompt.service'

const DOMAIN_BY_FACE = {
  [ASSISTANT_V3_FACE_IDS.canvas]: 'canvas',
  [ASSISTANT_V3_FACE_IDS.lora]: 'lora',
  [ASSISTANT_V3_FACE_IDS.image]: 'image',
  [ASSISTANT_V3_FACE_IDS.video]: 'video',
  [ASSISTANT_V3_FACE_IDS.cards]: 'image',
} as const

/**
 * 反问卡怎么问（2026-10-14 反问卡多选）：五张脸**同一段** ASKING。
 * 从前五张脸的 ask 行一字没提多选，模型于是永远填 `multiSelect: false`。
 */
describe('v3 系统提示 · ASKING', () => {
  for (const face of Object.values(ASSISTANT_V3_FACE_IDS)) {
    it(`${face} 脸带着多选 / 闭集 / 缩略图 / 跳过的说法`, () => {
      const prompt = buildAssistantV3SystemPrompt({
        face,
        request: {
          domain: DOMAIN_BY_FACE[face],
        } as unknown as AssistantOperatorRequest,
        persona: {} as AssistantPromptPersona,
        rules: [],
        memories: [],
        accountName: null,
      })
      expect(prompt).toContain('ASKING')
      expect(prompt).toContain(
        `2 to ${ASSISTANT_V3_LIMITS.maxOptions} options each`,
      )
      expect(prompt).toContain(
        'multiSelect: true when several options can apply together',
      )
      expect(prompt).toContain(
        'Never split one multi-choice into several single-choice questions.',
      )
      expect(prompt).toContain('allowOther: false only for a closed set')
      expect(prompt).toContain('A skipped question is yours to decide')
    })
  }
})
