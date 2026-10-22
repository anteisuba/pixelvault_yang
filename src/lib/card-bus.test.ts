import { describe, expect, it } from 'vitest'

import {
  allocateCardHandle,
  cardHandleKey,
  characterCoverUrl,
  defaultLook,
  deriveCardHandleBase,
  findCardHandleMentions,
  findLook,
  slotsCoverUrl,
} from '@/lib/card-bus'

const url = (name: string) => `https://cdn.test/${name}.png`

describe('characterCoverUrl', () => {
  const slot = (id: string, isPrimary = false) => ({
    id,
    role: 'identity' as const,
    url: url(id),
    isPrimary,
  })

  it('主图那一槽；没有主图取第一槽；没有槽是 null', () => {
    expect(slotsCoverUrl([slot('a'), slot('b', true)])).toBe(url('b'))
    expect(slotsCoverUrl([slot('a'), slot('b')])).toBe(url('a'))
    expect(slotsCoverUrl([])).toBeNull()
  })

  it('角色封面 = 默认造型的封面', () => {
    const look = (id: string, isDefault: boolean, slots: string[]) => ({
      id,
      label: null,
      isDefault,
      description: null,
      tags: [],
      referenceSlots: slots.map((name, index) => slot(name, index === 0)),
    })
    const card = {
      looks: [look('chibi', false, ['c']), look('main', true, ['m'])],
    }
    expect(characterCoverUrl(card)).toBe(url('m'))
    expect(defaultLook(card).id).toBe('main')
    expect(findLook(card, 'chibi').id).toBe('chibi')
    expect(findLook(card, 'gone').id).toBe('main')
    expect(findLook(card, null).id).toBe('main')
  })
})

describe('handle', () => {
  it('从名字派生：空白换 -、去掉符号、什么都不剩用 card', () => {
    expect(deriveCardHandleBase('林夏')).toBe('林夏')
    expect(deriveCardHandleBase('Lin Xia（雨夜）')).toBe('Lin-Xia雨夜')
    expect(deriveCardHandleBase('★☆')).toBe('card')
  })

  it('冲突依次加 -2 -3，比较不分全半角和 ASCII 大小写', () => {
    const taken = new Set([cardHandleKey('Shiye')])
    expect(allocateCardHandle('shiye', taken)).toBe('shiye-2')
    expect(allocateCardHandle('ｓｈｉｙｅ', taken)).toBe('ｓｈｉｙｅ-3')
    expect(allocateCardHandle('林夏', taken)).toBe('林夏')
  })
})

describe('findCardHandleMentions', () => {
  it('⭐ 最长匹配，⛔ 不靠词边界（中文照样切得出来）', () => {
    const text = '@林夏-雨夜走进来，@林夏看着她'
    expect(
      findCardHandleMentions(text, ['林夏', '林夏-雨夜']).map((m) => m.handle),
    ).toEqual(['林夏-雨夜', '林夏'])
  })

  it('不认得的 @ 跳过；大小写不敏感', () => {
    const mentions = findCardHandleMentions('@路人 和 @SHIYE', ['shiye'])
    expect(mentions).toEqual([{ handle: 'shiye', index: 6, length: 6 }])
  })
})
