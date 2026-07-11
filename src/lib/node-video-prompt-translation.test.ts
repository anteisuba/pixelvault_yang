import { describe, expect, it } from 'vitest'

import type { VideoLegendImageReference } from './node-workflow-graph'
import {
  buildReferenceImageIndexByName,
  filterReferencedImages,
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

describe('filterReferencedImages (V-3b 只送已引用)', () => {
  it('narrows referenceImages down to only the @-mentioned ones', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/floro.png', { kind: 'character', name: '弗洛洛' }],
      ['https://cdn/tavern.png', { kind: 'background', name: '长麻花馆' }],
    ])
    const result = filterReferencedImages(
      '@弗洛洛 微笑着看向镜头',
      ['https://cdn/floro.png', 'https://cdn/tavern.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(result).toEqual({
      referenceImages: ['https://cdn/floro.png'],
      imageIndexByName: new Map([['弗洛洛', 1]]),
      filtered: true,
    })
  })

  it('迁移红线: no @-mention hits any known image name → keeps the full set unfiltered', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/floro.png', { kind: 'character', name: '弗洛洛' }],
      ['https://cdn/tavern.png', { kind: 'background', name: '长麻花馆' }],
    ])
    const result = filterReferencedImages(
      '一段完全没有 @ 语法的老项目 prompt',
      ['https://cdn/floro.png', 'https://cdn/tavern.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(result).toEqual({
      referenceImages: ['https://cdn/floro.png', 'https://cdn/tavern.png'],
      imageIndexByName: new Map([
        ['弗洛洛', 1],
        ['长麻花馆', 2],
      ]),
      filtered: false,
    })
  })

  it('迁移红线: an empty prompt keeps the full connected set unfiltered', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/floro.png', { kind: 'character', name: '弗洛洛' }],
    ])
    const result = filterReferencedImages(
      '',
      ['https://cdn/floro.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(result.filtered).toBe(false)
    expect(result.referenceImages).toEqual(['https://cdn/floro.png'])
  })

  it('无参考图: an empty legend map keeps the (empty) input unfiltered', () => {
    const result = filterReferencedImages(
      '@弗洛洛 说话',
      [],
      new Map(),
      AUTO_NAME_PREFIX,
    )
    expect(result).toEqual({
      referenceImages: [],
      imageIndexByName: new Map(),
      filtered: false,
    })
  })

  it('preserves original connection order, not prompt-mention order', () => {
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/a.png', { kind: 'character', name: '甲' }],
      ['https://cdn/b.png', { kind: 'character', name: '乙' }],
      ['https://cdn/c.png', { kind: 'character', name: '丙' }],
    ])
    // Prompt mentions 丙 before 甲, but the ORIGINAL connection order (a, b, c)
    // must win — Seedance's @ImageN slots have to stay stable regardless of
    // where in the prose each name is first typed.
    const result = filterReferencedImages(
      '@丙 转身看向 @甲',
      ['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(result.referenceImages).toEqual([
      'https://cdn/a.png',
      'https://cdn/c.png',
    ])
    expect(result.imageIndexByName).toEqual(
      new Map([
        ['甲', 1],
        ['丙', 2],
      ]),
    )
  })

  it('auto-named reference keeps matching after narrowing shifts its position', () => {
    // Composer shows an unnamed background auto-numbered off the FULL list
    // (index 1 → "场景2"); the user types that exact auto name. After
    // narrowing drops the first (unreferenced) image, 场景2's ACTUAL sent
    // position becomes 1 — the returned map must reflect that new position,
    // not silently recompute a different fallback name that no longer
    // matches what the user typed.
    const imageRefByUrl = new Map<string, VideoLegendImageReference>([
      ['https://cdn/unreferenced.png', { kind: 'character', name: '路人' }],
      ['https://cdn/bg.png', { kind: 'background' }],
    ])
    const result = filterReferencedImages(
      '@场景2 的窗外下着雨',
      ['https://cdn/unreferenced.png', 'https://cdn/bg.png'],
      imageRefByUrl,
      AUTO_NAME_PREFIX,
    )
    expect(result.referenceImages).toEqual(['https://cdn/bg.png'])
    expect(result.imageIndexByName).toEqual(new Map([['场景2', 1]]))
    // The translation layer must still resolve @场景2 → @Image1 off this map.
    expect(
      translatePromptTokensToPositional(
        '@场景2 的窗外下着雨',
        result.imageIndexByName,
      ),
    ).toBe('@Image1（场景2） 的窗外下着雨')
  })
})
