import { describe, expect, it } from 'vitest'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import {
  allocateCardHandle,
  cardHandleKey,
  deriveCardHandleBase,
  deriveVariantHandleBase,
  findCardHandleMentions,
  legacyImagesToReferenceSlots,
} from '@/lib/card-bus'
import { CharacterReferenceSlotsSchema } from '@/types'

const url = (name: string) => `https://cdn.test/${name}.png`

describe('legacyImagesToReferenceSlots', () => {
  it('主图是身份槽且唯一主图；上传在前、精修在后；结果过得了不变量', () => {
    const slots = legacyImagesToReferenceSlots({
      sourceImageUrl: url('main'),
      sourceImages: [url('main'), url('side')],
      referenceImages: [url('refined')],
      referenceRoles: { [url('side')]: 'costume' },
    })
    expect(slots.map((slot) => [slot.url, slot.role, slot.origin])).toEqual([
      [url('main'), 'identity', 'upload'],
      [url('side'), 'costume', 'upload'],
      [url('refined'), 'identity', 'refine'],
    ])
    expect(slots.filter((slot) => slot.isPrimary)).toHaveLength(1)
    expect(CharacterReferenceSlotsSchema.safeParse(slots).success).toBe(true)
  })

  it('⭐ 用途表给主图记了别的用途，也以主图为准记成身份', () => {
    const slots = legacyImagesToReferenceSlots({
      sourceImageUrl: url('main'),
      referenceRoles: { [url('main')]: 'style' },
    })
    expect(slots[0]).toMatchObject({ role: 'identity', isPrimary: true })
  })

  it('结构化列表优先；视角带过来；custom 用途补上名字', () => {
    const slots = legacyImagesToReferenceSlots({
      sourceImageUrl: url('main'),
      sourceImages: [url('ignored')],
      sourceImageEntries: [
        { url: url('back'), viewType: 'back' },
        { url: url('weapon'), label: '武器' },
      ],
      referenceRoles: { [url('weapon')]: 'custom' },
    })
    expect(slots.map((slot) => slot.url)).not.toContain(url('ignored'))
    expect(slots.find((slot) => slot.url === url('back'))?.viewType).toBe(
      'back',
    )
    expect(slots.find((slot) => slot.url === url('weapon'))).toMatchObject({
      role: 'custom',
      customLabel: '武器',
    })
    expect(CharacterReferenceSlotsSchema.safeParse(slots).success).toBe(true)
  })

  it('超出上限从尾部丢，⛔ 不丢主图；id 确定', () => {
    const many = Array.from({ length: 20 }, (_, i) => url(`u${i}`))
    const slots = legacyImagesToReferenceSlots({
      sourceImageUrl: url('main'),
      sourceImages: many,
    })
    expect(slots).toHaveLength(CHARACTER_CARD.MAX_REFERENCE_SLOTS)
    expect(slots[0]).toMatchObject({ url: url('main'), id: 'slot-1' })
  })
})

describe('handle', () => {
  it('从名字派生：空白换 -、去掉符号、什么都不剩用 card', () => {
    expect(deriveCardHandleBase('林夏')).toBe('林夏')
    expect(deriveCardHandleBase('Lin Xia（雨夜）')).toBe('Lin-Xia雨夜')
    expect(deriveCardHandleBase('★☆')).toBe('card')
  })

  it('变体写成 父-变体', () => {
    expect(deriveVariantHandleBase('林夏', '雨夜版')).toBe('林夏-雨夜版')
    expect(deriveVariantHandleBase('林夏', null)).toBe('林夏')
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
