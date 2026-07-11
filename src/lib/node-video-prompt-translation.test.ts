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
