import { describe, expect, it } from 'vitest'

import { fillOperatorChatMacros } from '@/lib/studio-operator-chat'

describe('fillOperatorChatMacros', () => {
  it('开场白与备选里的 {{char}} / {{user}}（含老写法）换成名字', () => {
    const filled = fillOperatorChatMacros(
      {
        character: { id: 'card-1', name: '莉莉' },
        opening: '{{user}}，我是{{Char}}。',
        alternateOpenings: ['<USER>来了，<BOT>很高兴。'],
      },
      '旅人',
    )
    expect(filled.opening).toBe('旅人，我是莉莉。')
    expect(filled.alternateOpenings).toEqual(['旅人来了，莉莉很高兴。'])
  })

  it('没有备选时不凭空加一格', () => {
    const filled = fillOperatorChatMacros(
      { character: { id: 'card-1', name: '莉莉' }, opening: '你好' },
      '你',
    )
    expect(filled).not.toHaveProperty('alternateOpenings')
  })
})
