import { describe, expect, it } from 'vitest'

import { ASSISTANT_MENTION_LIMITS } from '@/constants/generation-naming'
import {
  buildGenerationDisplayName,
  buildGenerationTag,
  formatGenerationSerial,
  readGenerationMentions,
  resolveGenerationDisplayName,
  resolveGenerationMentions,
} from '@/lib/generation-name'

const ID = '5f0f9b0c-1a2b-4c3d-8e4f-0a1b2c3d4e5f'

describe('formatGenerationSerial', () => {
  it('补零到三位', () => {
    expect(formatGenerationSerial(7)).toBe('007')
    expect(formatGenerationSerial(12)).toBe('012')
    expect(formatGenerationSerial(999)).toBe('999')
  })

  it('第 1000 件自然扩位，⛔ 不回绕、不截断', () => {
    expect(formatGenerationSerial(1000)).toBe('1000')
    expect(formatGenerationSerial(12345)).toBe('12345')
  })
})

describe('buildGenerationTag', () => {
  it('域前缀按产物类型分，序号就是 seq', () => {
    expect(buildGenerationTag({ seq: 12, outputType: 'IMAGE' })).toBe('图_012')
    expect(buildGenerationTag({ seq: 7, outputType: 'VIDEO' })).toBe('视频_007')
    expect(buildGenerationTag({ seq: 100, outputType: 'AUDIO' })).toBe(
      '音频_100',
    )
    expect(buildGenerationTag({ seq: 3 })).toBe('图_003')
  })

  it('⛔ seq 缺席就没有身份段', () => {
    expect(buildGenerationTag({})).toBeUndefined()
    expect(buildGenerationTag({ seq: null })).toBeUndefined()
    expect(buildGenerationTag({ seq: 1.5 })).toBeUndefined()
  })
})

describe('buildGenerationDisplayName', () => {
  it('摘要取提示词前 8 个字', () => {
    expect(
      buildGenerationDisplayName({
        seq: 12,
        outputType: 'IMAGE',
        prompt: '银发少女立绘，站在雪原上，冷色调',
      }),
    ).toBe('图_012·银发少女立绘，站')
  })

  it('label 覆盖摘要', () => {
    expect(
      buildGenerationDisplayName({
        seq: 12,
        prompt: '银发少女立绘',
        label: '主视觉',
      }),
    ).toBe('图_012·主视觉')
  })

  it('提示词为空时只有身份段，⛔ 不留一个孤零零的分隔符', () => {
    expect(buildGenerationDisplayName({ seq: 12, prompt: '   ' })).toBe(
      '图_012',
    )
    expect(buildGenerationDisplayName({ seq: 12 })).not.toContain('·')
  })

  it('换行与连续空白压平', () => {
    expect(
      buildGenerationDisplayName({
        seq: 12,
        prompt: 'a\n\n  b   c d e f g h i',
      }),
    ).toBe('图_012·a b c d')
  })

  /**
   * ⭐ 这两条是本切片的核心判据：**没有号就不编号**。一个编出来的号与真号长得
   * 一模一样，而 `@` 解析只按号命中 —— 编一个就等于把用户指向别人的那一张。
   */
  it('seq 缺席时名字只有摘要，⛔ 不编号', () => {
    const name = buildGenerationDisplayName({ prompt: '银发少女立绘，雪原' })
    expect(name).toBe('银发少女立绘，雪')
    expect(name).not.toMatch(/_\d/)
  })

  it('seq 与摘要都缺席时退到域前缀，⛔ 不给一个空名字', () => {
    expect(buildGenerationDisplayName({})).toBe('图')
    expect(buildGenerationDisplayName({ outputType: 'VIDEO' })).toBe('视频')
  })

  it('幂等：同一份输入算两次一样', () => {
    const input = { seq: 12, outputType: 'IMAGE', prompt: '银发少女' }
    expect(buildGenerationDisplayName(input)).toBe(
      buildGenerationDisplayName(input),
    )
  })
})

describe('resolveGenerationDisplayName', () => {
  it('存了就用存的', () => {
    expect(
      resolveGenerationDisplayName({
        seq: 40,
        outputType: 'IMAGE',
        prompt: '别的提示词',
        snapshot: { displayName: '图_012·主视觉' },
      }),
    ).toBe('图_012·主视觉')
  })

  it('存量行没有名字时按同一规则现算', () => {
    expect(
      resolveGenerationDisplayName({
        seq: 12,
        outputType: 'IMAGE',
        prompt: '银发少女立绘',
        snapshot: { referenceAssets: [] },
      }),
    ).toBe('图_012·银发少女立绘')
  })

  it('空 displayName 不算名字', () => {
    expect(
      resolveGenerationDisplayName({
        seq: 12,
        prompt: '银发少女',
        snapshot: { displayName: '   ' },
      }),
    ).toBe('图_012·银发少女')
  })

  it('迁移前的行（seq 缺席）现算出的名字不带号', () => {
    expect(
      resolveGenerationDisplayName({ prompt: '银发少女', snapshot: null }),
    ).toBe('银发少女')
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

  it('第 1000 件那样的四位号也读得出', () => {
    expect(readGenerationMentions('@图_1000')).toEqual([
      { tag: '图_1000', serial: 1000 },
    ])
  })

  it('视频与音频前缀', () => {
    expect(
      readGenerationMentions('@视频_007 @音频_100').map((m) => m.tag),
    ).toEqual(['视频_007', '音频_100'])
  })
})

describe('resolveGenerationMentions', () => {
  const candidates = [
    { id: ID, seq: 12, label: '图_012·银发少女' },
    { id: 'other-id', seq: 999, label: '图_999' },
  ]

  it('名字命中候选（按 seq 精确相等）', () => {
    expect(resolveGenerationMentions('看看 @图_012', candidates)).toEqual([
      candidates[0],
    ])
  })

  it('未知名字不成 chip', () => {
    expect(resolveGenerationMentions('@图_512', candidates)).toEqual([])
  })

  /** ⛔ 摘要里恰好写着别人的号也不算命中 —— 判据是 `seq`，不是字符串包含。 */
  it('label 里含号但 seq 对不上 → 不命中', () => {
    expect(
      resolveGenerationMentions('@图_012', [
        { id: 'x', seq: 3, label: '图_003·封面图_012' },
      ]),
    ).toEqual([])
  })

  it('seq 缺席的候选永远不命中', () => {
    expect(
      resolveGenerationMentions('@图_012', [{ id: 'x', label: '图_012' }]),
    ).toEqual([])
  })

  it('同一条被写两次只挂一次', () => {
    expect(
      resolveGenerationMentions('@图_012 与 @图_012', candidates),
    ).toHaveLength(1)
  })
})

/** 2026-09-24 真机：名字成了「图_713·以referen」。 */
describe('buildGenerationDisplayName · 跳过点名参考图的句子', () => {
  it('取第一句真正描述画面的话', () => {
    expect(
      buildGenerationDisplayName({
        seq: 713,
        outputType: 'IMAGE',
        prompt:
          '以reference image 1作为角色身份与三视图排版参照。保持角色设计不变，改为2D赛璐璐动画风格。',
      }),
    ).toBe('图_713·保持角色设计不变')
  })

  it('全是参考图说明时退回原文，不留空', () => {
    expect(
      buildGenerationDisplayName({
        seq: 1,
        outputType: 'IMAGE',
        prompt: '参考图1的发型',
      }),
    ).toBe('图_001·参考图1的发型')
  })
})
