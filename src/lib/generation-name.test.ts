import { describe, expect, it } from 'vitest'

import { ASSISTANT_MENTION_LIMITS } from '@/constants/generation-naming'
import {
  buildGenerationDisplayName,
  buildGenerationTag,
  deriveGenerationSerial,
  formatGenerationSerial,
  readGenerationMentions,
  resolveGenerationDisplayName,
  resolveGenerationMentions,
} from '@/lib/generation-name'

const ID = '5f0f9b0c-1a2b-4c3d-8e4f-0a1b2c3d4e5f'

describe('deriveGenerationSerial', () => {
  it('同一个 id 永远同一个号（幂等）', () => {
    expect(deriveGenerationSerial(ID)).toBe(deriveGenerationSerial(ID))
  })

  it('落在三位数的取值域里', () => {
    for (const id of [ID, 'a', '', 'x'.repeat(200)]) {
      const serial = deriveGenerationSerial(id)
      expect(serial).toBeGreaterThanOrEqual(0)
      expect(serial).toBeLessThan(1000)
      expect(Number.isInteger(serial)).toBe(true)
    }
  })

  it('不同 id 基本不撞（100 个 uuid 里撞号 < 20）', () => {
    const serials = new Set(
      Array.from({ length: 100 }, (_, index) =>
        deriveGenerationSerial(`${ID}-${index}`),
      ),
    )
    expect(serials.size).toBeGreaterThan(80)
  })
})

describe('formatGenerationSerial', () => {
  it('补零到三位', () => {
    expect(formatGenerationSerial(7)).toBe('007')
    expect(formatGenerationSerial(12)).toBe('012')
    expect(formatGenerationSerial(999)).toBe('999')
  })
})

describe('buildGenerationDisplayName', () => {
  it('域前缀按产物类型分', () => {
    expect(buildGenerationTag({ id: ID, outputType: 'IMAGE' })).toMatch(
      /^图_\d{3}$/,
    )
    expect(buildGenerationTag({ id: ID, outputType: 'VIDEO' })).toMatch(
      /^视频_\d{3}$/,
    )
    expect(buildGenerationTag({ id: ID, outputType: 'AUDIO' })).toMatch(
      /^音频_\d{3}$/,
    )
    expect(buildGenerationTag({ id: ID })).toMatch(/^图_\d{3}$/)
  })

  it('摘要取提示词前 8 个字', () => {
    const name = buildGenerationDisplayName({
      id: ID,
      outputType: 'IMAGE',
      prompt: '银发少女立绘，站在雪原上，冷色调',
    })
    expect(name).toBe(`${buildGenerationTag({ id: ID })}·银发少女立绘，站`)
  })

  it('label 覆盖摘要', () => {
    const name = buildGenerationDisplayName({
      id: ID,
      prompt: '银发少女立绘',
      label: '主视觉',
    })
    expect(name).toBe(`${buildGenerationTag({ id: ID })}·主视觉`)
  })

  it('提示词为空时只有身份段，⛔ 不留一个孤零零的分隔符', () => {
    expect(buildGenerationDisplayName({ id: ID, prompt: '   ' })).toBe(
      buildGenerationTag({ id: ID }),
    )
    expect(buildGenerationDisplayName({ id: ID })).not.toContain('·')
  })

  it('换行与连续空白压平', () => {
    expect(
      buildGenerationDisplayName({
        id: ID,
        prompt: 'a\n\n  b   c d e f g h i',
      }),
    ).toBe(`${buildGenerationTag({ id: ID })}·a b c d`)
  })

  it('幂等：同一份输入算两次一样', () => {
    const input = { id: ID, outputType: 'IMAGE', prompt: '银发少女' }
    expect(buildGenerationDisplayName(input)).toBe(
      buildGenerationDisplayName(input),
    )
  })
})

describe('resolveGenerationDisplayName', () => {
  it('存了就用存的', () => {
    expect(
      resolveGenerationDisplayName({
        id: ID,
        outputType: 'IMAGE',
        prompt: '别的提示词',
        snapshot: { displayName: '图_012·主视觉' },
      }),
    ).toBe('图_012·主视觉')
  })

  it('存量行没有名字时按同一规则现算', () => {
    expect(
      resolveGenerationDisplayName({
        id: ID,
        outputType: 'IMAGE',
        prompt: '银发少女立绘',
        snapshot: { referenceAssets: [] },
      }),
    ).toBe(buildGenerationDisplayName({ id: ID, prompt: '银发少女立绘' }))
  })

  it('空 displayName 不算名字', () => {
    expect(
      resolveGenerationDisplayName({
        id: ID,
        prompt: '银发少女',
        snapshot: { displayName: '   ' },
      }),
    ).toBe(buildGenerationDisplayName({ id: ID, prompt: '银发少女' }))
  })
})

describe('readGenerationMentions', () => {
  it('读出正文里的名字', () => {
    expect(readGenerationMentions('把 @图_012 再来一版')).toEqual([
      { tag: '图_012', serial: 12 },
    ])
  })

  it('带摘要段也只认身份段', () => {
    expect(readGenerationMentions('@图_012·银发少女 换个背景')).toEqual([
      { tag: '图_012', serial: 12 },
    ])
  })

  it('⛔ 不匹配邮箱里的 @', () => {
    expect(readGenerationMentions('写信到 a@图_012.com')).toEqual([])
  })

  it('⛔ 序号不是数字就不是提及', () => {
    expect(readGenerationMentions('@图片很好看 @图_ab')).toEqual([])
  })

  it('去重', () => {
    expect(readGenerationMentions('@图_012 和 @图_012')).toHaveLength(1)
  })

  it(`超过 ${ASSISTANT_MENTION_LIMITS.maxPerMessage} 个只取前 ${ASSISTANT_MENTION_LIMITS.maxPerMessage} 个`, () => {
    const text = Array.from(
      { length: ASSISTANT_MENTION_LIMITS.maxPerMessage + 5 },
      (_, index) => `@图_${String(index).padStart(3, '0')}`,
    ).join(' ')
    expect(readGenerationMentions(text)).toHaveLength(
      ASSISTANT_MENTION_LIMITS.maxPerMessage,
    )
  })

  it('视频与音频前缀', () => {
    expect(
      readGenerationMentions('@视频_007 @音频_100').map((m) => m.tag),
    ).toEqual(['视频_007', '音频_100'])
  })
})

describe('resolveGenerationMentions', () => {
  const candidates = [
    {
      id: ID,
      label: buildGenerationDisplayName({ id: ID, prompt: '银发少女' }),
    },
    { id: 'other-id', label: '图_999' },
  ]
  const tag = buildGenerationTag({ id: ID })

  it('名字命中候选', () => {
    expect(resolveGenerationMentions(`看看 @${tag}`, candidates)).toEqual([
      candidates[0],
    ])
  })

  it('未知名字不成 chip', () => {
    const unknownSerial = (deriveGenerationSerial(ID) + 500) % 1000
    expect(
      resolveGenerationMentions(
        `@图_${formatGenerationSerial(unknownSerial)}`,
        [candidates[0]!],
      ),
    ).toEqual([])
  })

  it('同一条被写两次只挂一次', () => {
    expect(
      resolveGenerationMentions(`@${tag} 与 @${tag}`, candidates),
    ).toHaveLength(1)
  })
})
