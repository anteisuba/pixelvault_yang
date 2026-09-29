import { describe, expect, it } from 'vitest'

import { toRunnerPromptSyntax } from './runner-prompt-syntax'

describe('toRunnerPromptSyntax', () => {
  it('turns bracketed per-artist weights into ComfyUI weights', () => {
    expect(
      toRunnerPromptSyntax(
        '[artist:ciloranko:0.65, artist:nyantcha:0.65, artist:quasarcake:0.6, ] graphite (medium), very eyecatching, sexy pose:0.25, 1girl',
      ),
    ).toBe(
      '(artist:ciloranko:0.65), (artist:nyantcha:0.65), (artist:quasarcake:0.6) graphite (medium), very eyecatching, (sexy pose:0.25), 1girl',
    )
  })

  it('drops the trailing comma that hides a weight inside parentheses', () => {
    expect(
      toRunnerPromptSyntax(
        '(artist:nekodayo22:0.8, ) 1girl, (night bedroom, dramatic light, depth of field:1.1, ) female focus',
      ),
    ).toBe(
      '(artist:nekodayo22:0.8) 1girl, (night bedroom, dramatic light, depth of field:1.1) female focus',
    )
  })

  it('leaves ComfyUI-native syntax untouched', () => {
    const prompt =
      'masterpiece, (looking at viewer:1.2), (smile), graphite \\(medium\\), artist:foo, score_9, year 2024'
    expect(toRunnerPromptSyntax(prompt)).toBe(prompt)
  })

  it('maps A1111 de-emphasis brackets, nested ones compounding', () => {
    expect(toRunnerPromptSyntax('[blurry], [[lowres]]')).toBe(
      '(blurry:0.91), (lowres:0.83)',
    )
    expect(toRunnerPromptSyntax('[(freckles:1.2)]')).toBe('(freckles:1.09)')
  })

  it('maps NovelAI braces but keeps dynamic-prompt choices', () => {
    expect(toRunnerPromptSyntax('{{hat}}, {red|blue} eyes')).toBe(
      '(hat:1.1), {red|blue} eyes',
    )
  })

  it('keeps only the words for schedules and alternation', () => {
    expect(toRunnerPromptSyntax('[dog:10], [cat|fox]')).toBe(
      '(dog:0.91), (cat:0.91), (fox:0.91)',
    )
  })

  it('does not read ratios, times or tag namespaces as weights', () => {
    const prompt = '16:9, at 12:30, rating:general, artist:foo'
    expect(toRunnerPromptSyntax(prompt)).toBe(prompt)
  })

  it('replaces BREAK with a comma', () => {
    expect(toRunnerPromptSyntax('1girl, solo BREAK red dress\nBREAK')).toBe(
      '1girl, solo, red dress',
    )
  })

  it('turns escaped square brackets into plain characters', () => {
    expect(toRunnerPromptSyntax('\\[sic\\], [unclosed')).toBe(
      '[sic], [unclosed',
    )
  })
})
