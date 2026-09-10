import { describe, expect, it } from 'vitest'

import {
  compileVoiceMarkup,
  countVoiceMarkupInSentence,
  insertVoiceMarkup,
  parseVoiceMarkup,
  VOICE_MARKUP,
  VOICE_MARKUP_INTENSITY_IDS,
  voiceMarkupDeletionRangeAt,
  voiceMarkupSentenceStart,
} from './voice-markup'

describe('parseVoiceMarkup', () => {
  it('splits text into text and marker segments', () => {
    const segments = parseVoiceMarkup('[愤怒]把她还给我！')
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ kind: 'marker' })
    expect(segments[1]).toEqual({ kind: 'text', text: '把她还给我！' })
  })

  it('reads the intensity prefix only when it is exactly an intensity label', () => {
    const [strong] = parseVoiceMarkup('[强·愤怒]x')
    expect(strong).toMatchObject({
      kind: 'marker',
      token: { label: '愤怒', intensity: VOICE_MARKUP_INTENSITY_IDS.strong },
    })

    const [custom] = parseVoiceMarkup('[像在·憋着笑]x')
    expect(custom).toMatchObject({
      kind: 'marker',
      token: { label: '像在·憋着笑' },
    })
    expect(custom?.kind === 'marker' && custom.token.intensity).toBeUndefined()
  })

  it('ignores empty brackets and unterminated brackets', () => {
    expect(parseVoiceMarkup('a[]b')).toEqual([{ kind: 'text', text: 'a[]b' }])
    expect(parseVoiceMarkup('a[愤怒 b')).toEqual([
      { kind: 'text', text: 'a[愤怒 b' },
    ])
  })
})

describe('voiceMarkupDeletionRangeAt', () => {
  it('deletes the whole chip when the caret sits right after it', () => {
    const text = '前[愤怒]后'
    expect(voiceMarkupDeletionRangeAt(text, 5)).toEqual({ start: 1, end: 5 })
  })

  it('returns null anywhere else', () => {
    expect(voiceMarkupDeletionRangeAt('前[愤怒]后', 6)).toBeNull()
    expect(voiceMarkupDeletionRangeAt('没有标记', 2)).toBeNull()
  })
})

describe('insertVoiceMarkup', () => {
  it('inserts at the start of the sentence holding the caret', () => {
    const text = '第一句。第二句结束'
    const result = insertVoiceMarkup(text, text.length, [{ label: '愤怒' }])
    expect(result.text).toBe('第一句。[愤怒]第二句结束')
    expect(result.caret).toBe('第一句。[愤怒]'.length)
  })

  it('writes the intensity into the text for non-medium levels', () => {
    expect(
      insertVoiceMarkup('台词', 0, [
        { label: '愤怒', intensity: VOICE_MARKUP_INTENSITY_IDS.strong },
        { label: '咬牙切齿' },
      ]).text,
    ).toBe('[强·愤怒][咬牙切齿]台词')

    expect(
      insertVoiceMarkup('台词', 0, [
        { label: '愤怒', intensity: VOICE_MARKUP_INTENSITY_IDS.medium },
      ]).text,
    ).toBe('[愤怒]台词')
  })

  it('drops inserts beyond the official three-per-sentence ceiling', () => {
    const text = '[愤怒][耳语][喊]台词'
    expect(insertVoiceMarkup(text, text.length, [{ label: '悲伤' }])).toEqual({
      text,
      caret: text.length,
    })
    expect(countVoiceMarkupInSentence(text, text.length)).toBe(
      VOICE_MARKUP.maxPerSentence,
    )
  })
})

describe('voiceMarkupSentenceStart', () => {
  it('backtracks to just after the previous sentence ender', () => {
    expect(voiceMarkupSentenceStart('一。二', 3)).toBe(2)
    expect(voiceMarkupSentenceStart('一二', 1)).toBe(0)
  })
})

describe('compileVoiceMarkup', () => {
  it('compiles the owner use case into official Fish markup', () => {
    const result = compileVoiceMarkup('[强·愤怒][咬牙切齿]把她还给我！')
    expect(result.text).toBe('[very angry][through gritted teeth]把她还给我！')
    expect(result.tags).toEqual(['very angry', 'through gritted teeth'])
    expect(result.plainText).toBe('把她还给我！')
  })

  it('keeps a custom description verbatim inside the brackets', () => {
    const result = compileVoiceMarkup('[像在憋着笑]你听见了吗。')
    expect(result.text).toBe('[像在憋着笑]你听见了吗。')
    expect(result.tags).toEqual(['像在憋着笑'])
  })

  it('compiles markers in place, not hoisted to the sentence head', () => {
    expect(compileVoiceMarkup('把她[耳语]还给我').text).toBe(
      '把她[whispering]还给我',
    )
  })

  it('is a no-op for plain text', () => {
    const result = compileVoiceMarkup('真正的告别从来不发生在车站。')
    expect(result.text).toBe('真正的告别从来不发生在车站。')
    expect(result.tags).toEqual([])
  })
})
