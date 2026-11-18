import { describe, expect, it } from 'vitest'

import { renderVoiceBenchView } from '@/features/assistant/voice-bench-view'
import { toVoiceBenchView } from '@/hooks/use-voice-bench-view'
import {
  ASSISTANT_VOICE_BENCH_VIEW_LIMITS,
  AssistantOperatorRequestSchema,
} from '@/types/assistant-operator'

/**
 * 11-17：配音台没有宿主 —— 在 /studio/audio 问「把台词框里那句改温柔点」，板子上只有首页那块，
 * 助手不知道台词框里写着什么、用的哪副嗓子、几倍速。旧代码里请求根本没有这一格（schema 会剥掉）。
 */
describe('配音台旁路：看得见', () => {
  const view = toVoiceBenchView({
    voice: 'Aemeath',
    model: 'fish-s1',
    speed: 1.2,
    draft: '[soft tone] 晚安，今天辛苦了。',
    recent: Array.from({ length: 8 }, (_, i) => `第 ${i + 1} 句`),
  })

  it('收成过得了 schema 的一份：最近几句只留最后 N 句', () => {
    expect(view?.recent).toHaveLength(
      ASSISTANT_VOICE_BENCH_VIEW_LIMITS.recentLines,
    )
    expect(view?.recent.at(-1)).toBe('第 8 句')
  })

  it('板子上那一段：嗓子 · 档 · 语速 · 台词框原文 · 最近几句 · 不能替他念', () => {
    const text = renderVoiceBenchView(view ?? undefined)
    expect(text).toContain('voice: Aemeath')
    expect(text).toContain('model tier: fish-s1')
    expect(text).toContain('speed: 1.2×')
    expect(text).toContain('[soft tone] 晚安，今天辛苦了。')
    expect(text).toContain('5. 第 8 句')
    expect(text).toContain('press speak')
    expect(renderVoiceBenchView(undefined)).toBe('')
  })

  it('请求 schema 收这一格（旧代码会把它剥掉）', () => {
    const shape = AssistantOperatorRequestSchema.shape
    expect('voiceBench' in shape).toBe(true)
  })

  it('台词框超长：截到上限而不是整份作废', () => {
    const long = toVoiceBenchView({
      model: 'm',
      speed: 1,
      draft: 'x'.repeat(5000),
      recent: [],
    })
    expect(long?.draft).toHaveLength(
      ASSISTANT_VOICE_BENCH_VIEW_LIMITS.draftChars,
    )
    expect(long?.voice).toBeUndefined()
  })
})
