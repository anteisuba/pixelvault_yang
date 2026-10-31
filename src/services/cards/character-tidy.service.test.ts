import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: vi.fn(),
}))
vi.mock('@/services/llm-text.service', () => ({ llmTextCompletion: vi.fn() }))

import { CharacterPersonaSchema } from '@/types'

import { mergeTidyDraft, parseTidyDraft } from './character-tidy.service'

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

  it('只填空格；经历换成拆出来的；性格写过就不动', () => {
    const next = mergeTidyDraft(imported, {
      identity: '十七岁的天才少女',
      behavior: '嘴上嫌弃，其实很照顾人',
      speech: '说话快，爱用反问',
      backstory: '从小在研究所长大',
      boundaries: '不会当面道歉',
      catchphrases: ['哼'],
    })
    expect(next).toMatchObject({
      identity: '十七岁的天才少女',
      behavior: '傲娇',
      speech: '说话快，爱用反问',
      backstory: '从小在研究所长大',
      boundaries: '不会当面道歉',
      catchphrases: ['哼'],
    })
  })

  it('钉住的格不动；什么都没变 = null', () => {
    const draft = {
      identity: '',
      behavior: '',
      speech: '说话快',
      backstory: '',
      boundaries: '',
      catchphrases: [],
    }
    expect(mergeTidyDraft(imported, draft, ['speech'])).toBeNull()
    expect(mergeTidyDraft(imported, draft)).toMatchObject({ speech: '说话快' })
  })
})
