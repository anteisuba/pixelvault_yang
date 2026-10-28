import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  chatBubbles,
  leadingVoiceCues,
  spokenVoiceText,
  stickerUrlOf,
  voiceCueRules,
  withoutPictureHandles,
} from './chat-voice'

describe('voiceCueRules', () => {
  it('adds Drama 3 cues only for the expressive voice', () => {
    expect(voiceCueRules(false)).toContain('[laughing]')
    expect(voiceCueRules(false)).not.toContain('<whisper>')
    expect(voiceCueRules(true)).toContain('<whisper>…</whisper>')
  })
})

describe('chatBubbles', () => {
  it('splits on lines and drops empty ones', () => {
    expect(chatBubbles('  又熬夜了吧\n\n图先放着嘛\n')).toEqual([
      '又熬夜了吧',
      '图先放着嘛',
    ])
    expect(chatBubbles('')).toEqual([])
  })

  it('hides the voice cues she writes for her voice', () => {
    expect(
      chatBubbles(
        '嗨！[laughing] 我这边挺顺利的。\n[sighs]\n<whisper>别告诉别人</whisper> [压低声音，带着笑意]好吗？\nOh [laughing] really',
      ),
    ).toEqual(['嗨！我这边挺顺利的。', '别告诉别人好吗？', 'Oh really'])
    expect(chatBubbles('看[这里](https://a.b)')).toEqual([
      '看[这里](https://a.b)',
    ])
  })
})

describe('picture handles in her reply', () => {
  it('leaves only her words', () => {
    expect(withoutPictureHandles('看这张 图_12。')).toBe('看这张。')
    expect(withoutPictureHandles('图_12')).toBe('')
  })

  it('reads aloud only the words, keeping delivery cues', () => {
    expect(
      spokenVoiceText(
        '[laughing] 看 图_3，**很像**吧？来源 [官网](https://a.example) https://b.example',
      ),
    ).toBe('[laughing] 看，很像吧？来源 官网')
    expect(spokenVoiceText('图_3')).toBe('图_3')
  })
})

describe('leadingVoiceCues', () => {
  it('pulls the cues at the start apart and leaves the rest', () => {
    expect(leadingVoiceCues('[whispering] [pause] 嘘，书会被吵醒的。')).toEqual(
      {
        cues: ['[whispering]', '[pause]'],
        rest: '嘘，书会被吵醒的。',
      },
    )
    expect(leadingVoiceCues('欢迎 [laughing] 来玩')).toEqual({
      cues: [],
      rest: '欢迎 [laughing] 来玩',
    })
  })
})

describe('her stickers (4d)', () => {
  beforeEach(() =>
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', 'https://cdn.test'),
  )
  afterEach(() => vi.unstubAllEnvs())

  it('recognises a sticker line only when it points at our own storage', () => {
    expect(
      stickerUrlOf('![表情](https://cdn.test/characters/u/c/stickers/a.png)'),
    ).toBe('https://cdn.test/characters/u/c/stickers/a.png')
    expect(stickerUrlOf('![表情](https://evil.example/a.png)')).toBeNull()
    expect(stickerUrlOf('好耶')).toBeNull()
  })

  it('keeps the sticker line as its own bubble and hides a raw token while writing', () => {
    expect(
      chatBubbles('笑死\n![表情](https://cdn.test/s.png)\n[表情·ab12cd]'),
    ).toEqual(['笑死', '![表情](https://cdn.test/s.png)'])
  })

  it('never reads a sticker out loud', () => {
    expect(spokenVoiceText('笑死\n![表情](https://cdn.test/s.png)')).toBe(
      '笑死',
    )
  })
})
