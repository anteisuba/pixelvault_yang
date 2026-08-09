import { describe, expect, it } from 'vitest'

import type { VideoLegendImageReference } from './node-workflow-graph'
import {
  buildReferenceImageIndexByName,
  translatePromptTokensToPositional,
} from './node-video-prompt-translation'

const AUTO_NAME_PREFIX = {
  character: '角色',
  background: '场景',
  shot: '镜头',
  closeup: '特写',
} as const

describe('buildReferenceImageIndexByName', () => {
  it('单身份: binds one named reference to its 1-based position', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/floro.png', { kind: 'character', name: '弗洛洛' }],
    ])
    const map = buildReferenceImageIndexByName(
      ['https://cdn/floro.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(map).toEqual(new Map([['弗洛洛', 1]]))
  })

  it('多身份: each named reference gets its own FINAL index', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/floro.png', { kind: 'character', name: '弗洛洛' }],
      ['https://cdn/tavern.png', { kind: 'background', name: '长麻花馆' }],
    ])
    const map = buildReferenceImageIndexByName(
      ['https://cdn/floro.png', 'https://cdn/tavern.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(map).toEqual(
      new Map([
        ['弗洛洛', 1],
        ['长麻花馆', 2],
      ]),
    )
  })

  it('同名多图: the same name across two images binds to the FIRST position', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/floro-a.png', { kind: 'character', name: '弗洛洛' }],
      ['https://cdn/floro-b.png', { kind: 'character', name: '弗洛洛' }],
    ])
    const map = buildReferenceImageIndexByName(
      ['https://cdn/floro-a.png', 'https://cdn/floro-b.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(map).toEqual(new Map([['弗洛洛', 1]]))
  })

  it('unnamed reference falls back to the auto-name matching the composer token', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/bg.png', { kind: 'background' }],
    ])
    const map = buildReferenceImageIndexByName(
      ['https://cdn/bg.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(map).toEqual(new Map([['场景1', 1]]))
  })

  it('无参考图: an empty referenceImages array produces an empty map', () => {
    const map = buildReferenceImageIndexByName([], new Map(), AUTO_NAME_PREFIX)
    expect(map.size).toBe(0)
  })

  it('skips a referenceImages url with no legend entry (e.g. an unnamed manual upload)', () => {
    const map = buildReferenceImageIndexByName(
      ['https://cdn/unlabeled.png'],
      new Map(),
      AUTO_NAME_PREFIX,
    )
    expect(map.size).toBe(0)
  })
})

describe('translatePromptTokensToPositional', () => {
  it('单身份: @name → @ImageN with the name parenthesized on first use', () => {
    const result = translatePromptTokensToPositional(
      '@弗洛洛 微笑着看向镜头',
      new Map([['弗洛洛', 1]]),
    )
    expect(result).toBe('@Image1（弗洛洛） 微笑着看向镜头')
  })

  it('多身份: multiple distinct names each translate to their own @ImageN', () => {
    const result = translatePromptTokensToPositional(
      '@弗洛洛 和 @长麻花馆 的老板娘对视',
      new Map([
        ['弗洛洛', 1],
        ['长麻花馆', 2],
      ]),
    )
    expect(result).toBe('@Image1（弗洛洛） 和 @Image2（长麻花馆） 的老板娘对视')
  })

  it('同名多图: the same name mentioned twice collapses to a bare @ImageN after the first use', () => {
    const result = translatePromptTokensToPositional(
      '@弗洛洛 转身，@弗洛洛 挥手道别',
      new Map([['弗洛洛', 1]]),
    )
    expect(result).toBe('@Image1（弗洛洛） 转身，@Image1 挥手道别')
  })

  it('未命中@token: a mention with no reference-image binding is left verbatim', () => {
    const result = translatePromptTokensToPositional(
      '@弗洛洛 和 @陌生人 说话',
      new Map([['弗洛洛', 1]]),
    )
    expect(result).toBe('@Image1（弗洛洛） 和 @陌生人 说话')
  })

  it('无参考图: an empty binding map returns the prompt unchanged', () => {
    const prompt = '@弗洛洛 你好，今天天气不错'
    expect(translatePromptTokensToPositional(prompt, new Map())).toBe(prompt)
  })

  it('leaves @AudioN / @VideoN tokens untouched — they are not image bindings', () => {
    const result = translatePromptTokensToPositional(
      '@弗洛洛 说 (@Audio1)：你好，参考 @Video1 的运镜',
      new Map([['弗洛洛', 1]]),
    )
    expect(result).toBe(
      '@Image1（弗洛洛） 说 (@Audio1)：你好，参考 @Video1 的运镜',
    )
  })

  it('returns the prompt unchanged when it has no @ at all', () => {
    const prompt = '一段没有任何引用的纯文字 prompt'
    expect(
      translatePromptTokensToPositional(prompt, new Map([['弗洛洛', 1]])),
    ).toBe(prompt)
  })
})

describe('buildReferenceImageIndexByName（名字 → 位置）', () => {
  /**
   * ⛔ 这一族原本测的是 `filterReferencedImages`（V-3b「只送已引用」）——
   * 按正文里的 `@` 提及收窄 image_urls。**它已于 2026-08-09 退役**：槽架落成后
   * 那道收窄成了第二本账（腰带写着「图 6」，正文插一个引用就只发 1 张）。契约
   * 定死「在槽里就等于会发送」，范围归槽架，正文只管位置标注。
   *
   * 留下来的是索引器本身 —— 名字 → 位置的翻译仍然要，且下面这几条约束一条没变。
   */
  it('按连线顺序编号，与名字在正文里出现的先后无关', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/a.png', { kind: 'character', name: '甲' }],
      ['https://cdn/b.png', { kind: 'character', name: '乙' }],
      ['https://cdn/c.png', { kind: 'character', name: '丙' }],
    ])
    // 正文里 丙 出现在 甲 之前，但编号必须按连线顺序 —— Seedance 的 @ImageN
    // 位置得稳定，不能随用户在哪一句先提到谁而变。
    expect(
      buildReferenceImageIndexByName(
        ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png'],
        imageRefByUrl,
        AUTO_NAME_PREFIX,
      ),
    ).toEqual(
      new Map([
        ['甲', 1],
        ['乙', 2],
        ['丙', 3],
      ]),
    )
  })

  it('⚠ 回归：没被提到的图也占位 —— 它照样会发出去', () => {
    // 退役前这里会把「路人」挤掉、让「场景2」变成第 1 位。现在两张都发，
    // 所以 场景2 就是第 2 位，翻译出来必须是 @Image2。
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/unreferenced.png', { kind: 'character', name: '路人' }],
      ['https://cdn/bg.png', { kind: 'background' }],
    ])
    const indexByName = buildReferenceImageIndexByName(
      ['https://cdn/unreferenced.png', 'https://cdn/bg.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(indexByName).toEqual(
      new Map([
        ['路人', 1],
        ['场景2', 2],
      ]),
    )
    expect(
      translatePromptTokensToPositional('@场景2 的窗外下着雨', indexByName),
    ).toBe('@Image2（场景2） 的窗外下着雨')
  })

  it('没有参考图时给一张空表', () => {
    expect(
      buildReferenceImageIndexByName([], new Map(), AUTO_NAME_PREFIX),
    ).toEqual(new Map())
  })
})
