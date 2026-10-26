import { describe, expect, it } from 'vitest'

import {
  chatBubbles,
  spokenVoiceText,
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
