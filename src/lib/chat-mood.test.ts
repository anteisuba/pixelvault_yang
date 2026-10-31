import { describe, expect, it } from 'vitest'

import {
  chatMoodFromPlan,
  fadeChatMood,
  parseChatPlan,
  readChatMood,
  settleChatPlan,
  silentRunOf,
} from '@/lib/chat-mood'

const NOW = new Date('2026-10-31T12:00:00Z')

describe('她此刻的心情（10-31 三层）', () => {
  it('读卡上那份：没有、坏了都当没有', () => {
    const state = {
      mood: '吃醋',
      intensity: 2,
      why: '他夸别人',
      at: NOW.toISOString(),
    }
    expect(readChatMood({ 'pv.chatMood': state })).toEqual(state)
    expect(readChatMood({ 'pv.chatMood': { mood: '' } })).toBeNull()
    expect(readChatMood(null)).toBeNull()
  })

  it('按真实时间消：每 3 小时降一档，降到 0 = 平静', () => {
    const state = {
      mood: '生气',
      intensity: 3,
      why: '',
      at: '2026-10-31T11:00:00Z',
    }
    expect(fadeChatMood(state, NOW)).toMatchObject({
      intensity: 3,
      hoursAgo: 1,
    })
    expect(
      fadeChatMood({ ...state, at: '2026-10-31T05:00:00Z' }, NOW),
    ).toMatchObject({ intensity: 1 })
    // 隔一晚基本好了。
    expect(
      fadeChatMood({ ...state, at: '2026-10-30T23:00:00Z' }, NOW),
    ).toBeNull()
    expect(fadeChatMood(null, NOW)).toBeNull()
  })

  it('连着没回几句：她最后说话之后你发了几句，减去刚发的这句；空白助手行不算', () => {
    expect(silentRunOf([{ role: 'user', content: '在吗' }])).toBe(0)
    expect(
      silentRunOf([
        { role: 'assistant', content: '嗯' },
        { role: 'user', content: '在吗' },
        { role: 'assistant', content: '' },
        { role: 'user', content: '别不理我' },
        { role: 'user', content: '我错了' },
      ]),
    ).toBe(2)
  })

  it('读那一步的回答：写长了截、强度夹到 0–3、认不出的回法当正常回', () => {
    expect(
      parseChatPlan(
        '```json\n{"mood":"有点不爽但也说不上来为什么就是不爽","intensity":"5","why":"他提到别的 AI","stance":"冷淡","reply":"sulk"}\n```',
      ),
    ).toEqual({
      mood: '有点不爽但也说不上来为什么就是不爽'.slice(0, 20),
      intensity: 3,
      why: '他提到别的 AI',
      stance: '冷淡',
      reply: 'full',
    })
    expect(parseChatPlan('不是 JSON')).toBeNull()
    expect(parseChatPlan('{"mood":""}')).toBeNull()
  })

  it('「不回」只在真不高兴时作数，连着不回两次后至少回几个字', () => {
    const none = {
      mood: '生气',
      intensity: 3,
      why: '',
      stance: '',
      reply: 'none' as const,
    }
    expect(settleChatPlan(none, 0).reply).toBe('none')
    expect(settleChatPlan(none, 1).reply).toBe('none')
    expect(settleChatPlan(none, 2).reply).toBe('brief')
    expect(settleChatPlan({ ...none, intensity: 1 }, 0).reply).toBe('brief')
  })

  it('平静了就从卡上清掉', () => {
    const plan = {
      mood: '平静',
      intensity: 0,
      why: '',
      stance: '',
      reply: 'full' as const,
    }
    expect(chatMoodFromPlan(plan, NOW)).toBeNull()
    expect(
      chatMoodFromPlan({ ...plan, mood: '开心', intensity: 1 }, NOW),
    ).toEqual({
      mood: '开心',
      intensity: 1,
      why: '',
      at: NOW.toISOString(),
    })
  })
})
