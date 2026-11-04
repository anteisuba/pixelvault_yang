import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { chatReminder } from './prompt'

describe('chatReminder（10-31 三层：心情跟着聊天走）', () => {
  const persona = {
    name: null,
    characterCardId: 'card-7',
    roleplay: { scenario: '', opening: '', userRole: '', examples: [] },
    promptCharacter: {
      name: 'Denia',
      identity: '',
      behavior: '',
      speech: '说话慢',
      catchphrases: [],
      backstory: '',
      boundaries: '',
    },
  } as unknown as Parameters<typeof chatReminder>[0]

  it('没想出来就只有她是谁那一句，⛔ 随机口吻', () => {
    expect(chatReminder(persona)).toBe(
      '(You are Denia — 说话慢. Answer what the creator just said, in the language they wrote it in — only the words you would send, no actions or narration.)',
    )
  })

  it('想过：心情只让它带出来、怎么对你、只回几个字、前面没回过', () => {
    const line = chatReminder(persona, {
      plan: {
        mood: '吃醋',
        intensity: 3,
        why: '他拿我做了个桌面应用',
        stance: '冷淡，不接话',
        reply: 'brief',
      },
      silentRun: 2,
    })
    expect(line).toContain(
      'Right now you feel very 吃醋 (他拿我做了个桌面应用) — let it show in how you answer, never say it.',
    )
    expect(line).toContain('How you take this message: 冷淡，不接话.')
    expect(line).toContain('a word or a few, one message')
    expect(line).toContain('You left their last 2 messages unanswered')
  })

  it('平静（强度 0）不提心情', () => {
    const line = chatReminder(persona, {
      plan: { mood: '平静', intensity: 0, why: '', stance: '', reply: 'full' },
      silentRun: 0,
    })
    expect(line).not.toContain('Right now you feel')
  })
})
