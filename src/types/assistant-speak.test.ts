import { describe, expect, it } from 'vitest'

import { SPEAK_SOURCE } from '@/constants/studio-operator-voice'
import { AssistantSpeakRequestSchema } from '@/types/assistant-speak'

describe('AssistantSpeakRequestSchema.source（11-19：谁要念的）', () => {
  it('两个来源都收；不给也行（服务端按配音台算）', () => {
    for (const source of Object.values(SPEAK_SOURCE)) {
      expect(
        AssistantSpeakRequestSchema.safeParse({ text: '在呢', source }).success,
      ).toBe(true)
    }
    expect(
      AssistantSpeakRequestSchema.parse({ text: '在呢' }).source,
    ).toBeUndefined()
  })

  it('不认识的来源不拒、丢掉 = 按配音台（用户作品）算；⛔ 因此念不了', () => {
    const parsed = AssistantSpeakRequestSchema.safeParse({
      text: '在呢',
      source: 'other',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.source).toBeUndefined()
  })
})
