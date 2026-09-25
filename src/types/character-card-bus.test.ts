import { describe, expect, it } from 'vitest'

import {
  CardExtensionsSchema,
  CardHandleSchema,
  CharacterReferenceSlotsSchema,
} from '@/types'

/**
 * 卡片总线 v3 的形状（进度表 35 · 第 ① 片）。
 *
 * 钉三件事：handle 能从正文里无歧义地切出来；参考槽的不变量；扩展键必须带命名空间。
 */

const identity = (id: string, isPrimary = false) => ({
  id,
  role: 'identity' as const,
  url: `https://cdn.test/${id}.png`,
  isPrimary,
})

describe('CardHandleSchema', () => {
  it('中文、变体写法都收', () => {
    expect(CardHandleSchema.parse('林夏')).toBe('林夏')
    expect(CardHandleSchema.parse('林夏-雨夜')).toBe('林夏-雨夜')
    expect(CardHandleSchema.parse('shiye_2')).toBe('shiye_2')
  })

  it('⛔ 空格、@、以连字符开头都不收', () => {
    expect(CardHandleSchema.safeParse('林 夏').success).toBe(false)
    expect(CardHandleSchema.safeParse('@林夏').success).toBe(false)
    expect(CardHandleSchema.safeParse('-林夏').success).toBe(false)
  })
})

describe('CharacterReferenceSlotsSchema', () => {
  it('一个主图身份槽 + 其他用途 → 通过', () => {
    const slots = CharacterReferenceSlotsSchema.parse([
      identity('a', true),
      {
        id: 'b',
        role: 'costume',
        url: 'https://cdn.test/b.png',
      },
    ])
    expect(slots[1]!.isPrimary).toBe(false)
  })

  it('没有身份槽 → 拒', () => {
    expect(
      CharacterReferenceSlotsSchema.safeParse([
        {
          id: 'a',
          role: 'pose',
          url: 'https://cdn.test/a.png',
          isPrimary: true,
        },
      ]).success,
    ).toBe(false)
  })

  it('主图不是恰好一张、或主图不是身份槽 → 拒', () => {
    expect(
      CharacterReferenceSlotsSchema.safeParse([identity('a'), identity('b')])
        .success,
    ).toBe(false)
    expect(
      CharacterReferenceSlotsSchema.safeParse([
        identity('a', true),
        identity('b', true),
      ]).success,
    ).toBe(false)
    expect(
      CharacterReferenceSlotsSchema.safeParse([
        identity('a'),
        {
          id: 'b',
          role: 'style',
          url: 'https://cdn.test/b.png',
          isPrimary: true,
        },
      ]).success,
    ).toBe(false)
  })

  it('同一张图进两个槽 → 拒；custom 没有名字 → 拒', () => {
    expect(
      CharacterReferenceSlotsSchema.safeParse([
        identity('a', true),
        { id: 'b', role: 'pose', url: 'https://cdn.test/a.png' },
      ]).success,
    ).toBe(false)
    expect(
      CharacterReferenceSlotsSchema.safeParse([
        identity('a', true),
        { id: 'b', role: 'custom', url: 'https://cdn.test/b.png' },
      ]).success,
    ).toBe(false)
  })
})

describe('CardExtensionsSchema', () => {
  it('带命名空间的键收下，值原样保留', () => {
    const value = { 'pv.variants': [{ label: '雨夜' }], 'acme.tag': 1 }
    expect(CardExtensionsSchema.parse(value)).toEqual(value)
  })

  it('⛔ 没有命名空间的键不收', () => {
    expect(CardExtensionsSchema.safeParse({ variants: [] }).success).toBe(false)
  })
})
