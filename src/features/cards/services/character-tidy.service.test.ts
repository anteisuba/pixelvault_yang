import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: vi.fn(),
}))
vi.mock('@/services/llm-text.service', () => ({ llmTextCompletion: vi.fn() }))

import { CharacterPersonaSchema } from '@/types'

import {
  keepOriginalOpening,
  mergeTidyDraft,
  parseTidyDraft,
  tidySystemPrompt,
} from './character-tidy.service'

const imported = CharacterPersonaSchema.parse({
  behavior: '傲娇',
  backstory: '{{char}} 是一名十七岁的天才少女……（整段描述）',
})

describe('导入后自动整理（⑪）', () => {
  it('读模型的回答：写长了截、口头禅去空、读不出来 = null', () => {
    expect(
      parseTidyDraft(
        '```json\n{"identity":"十七岁的天才少女","speech":"说话快","catchphrases":["哼"," ",""],"extra":1}\n```',
      ),
    ).toMatchObject({
      identity: '十七岁的天才少女',
      speech: '说话快',
      behavior: '',
      catchphrases: ['哼'],
    })
    expect(parseTidyDraft('不是 JSON')).toBeNull()
  })

  const blank = {
    name: '',
    identity: '',
    behavior: '',
    speech: '',
    backstory: '',
    boundaries: '',
    scenario: '',
    catchphrases: [],
    opening: '',
    examples: [],
  }

  it('有内容的格整格换（翻成你的语言）；空的不动', () => {
    const next = mergeTidyDraft(imported, {
      ...blank,
      identity: '十七岁的天才少女',
      behavior: '嘴上嫌弃，其实很照顾人',
      backstory: '从小在研究所长大',
      catchphrases: ['哼'],
      opening: '你终于来了？',
      examples: [{ user: '早', reply: '才几点啊……早。' }],
    })
    expect(next).toMatchObject({
      identity: '十七岁的天才少女',
      behavior: '嘴上嫌弃，其实很照顾人',
      speech: '',
      backstory: '从小在研究所长大',
      catchphrases: ['哼'],
      opening: '你终于来了？',
      examples: [{ user: '早', reply: '才几点啊……早。' }],
    })
  })

  it('钉住的格不动；什么都没变 = null', () => {
    const draft = { ...blank, speech: '说话快' }
    expect(mergeTidyDraft(imported, draft, ['speech'])).toBeNull()
    expect(mergeTidyDraft(imported, draft)).toMatchObject({ speech: '说话快' })
  })

  it('原来的开场白挪进备选开场白最前面，已有就不重复', () => {
    expect(
      keepOriginalOpening(
        { 'st.card': { spec: 'v2', alternateGreetings: ['旧备选'] } },
        '*旁白* 你好',
      ),
    ).toEqual({
      'st.card': { spec: 'v2', alternateGreetings: ['*旁白* 你好', '旧备选'] },
    })
    expect(
      keepOriginalOpening({ 'st.card': { alternateGreetings: ['a'] } }, 'a'),
    ).toBeNull()
  })

  it('提示按你的界面语言写', () => {
    expect(tidySystemPrompt('zh')).toContain('written in Simplified Chinese')
    expect(tidySystemPrompt('ja')).toContain('Japanese')
  })
})
