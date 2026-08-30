import { describe, expect, it } from 'vitest'

import { AUDIO_EMOTION } from '@/constants/voice-cards'
import { parseVoiceLineEmotion } from './voice-line-emotion'

describe('parseVoiceLineEmotion', () => {
  it('剥离句首的中文全角情感括号', () => {
    expect(parseVoiceLineEmotion('（耳语）别回头，他就在你身后。')).toEqual({
      text: '别回头，他就在你身后。',
      emotion: AUDIO_EMOTION.WHISPER,
    })
  })

  it('半角括号与方头括号同样收', () => {
    expect(parseVoiceLineEmotion('(兴奋)八点前挂出来！').emotion).toBe(
      AUDIO_EMOTION.EXCITED,
    )
    expect(parseVoiceLineEmotion('【愤怒】你再说一遍。').emotion).toBe(
      AUDIO_EMOTION.ANGRY,
    )
  })

  it('英文别名大小写不敏感', () => {
    expect(parseVoiceLineEmotion("(WHISPER) don't look back")).toEqual({
      text: "don't look back",
      emotion: AUDIO_EMOTION.WHISPER,
    })
  })

  it('没有括号时 emotion 是 null（交给模型自己判断）', () => {
    expect(parseVoiceLineEmotion('今晚的画展，八点开始。')).toEqual({
      text: '今晚的画展，八点开始。',
      emotion: null,
    })
  })

  /**
   * 这条是这个函数最重要的保证：认不出的括号**原样留着**。
   * 悄悄吞掉用户写的字，比念错语气严重得多。
   */
  it('括号里不是情感词时整句原样保留', () => {
    expect(parseVoiceLineEmotion('（他压低声音）别回头')).toEqual({
      text: '（他压低声音）别回头',
      emotion: null,
    })
  })

  it('只剥第一个括号——两个情感是矛盾的，不该都吃掉', () => {
    expect(parseVoiceLineEmotion('（耳语）（兴奋）别回头')).toEqual({
      text: '（兴奋）别回头',
      emotion: AUDIO_EMOTION.WHISPER,
    })
  })

  it('超长括号内容不当情感（防止把整段叙述吃掉）', () => {
    const long = '（他压低了声音凑到耳边缓缓地说）别回头'
    expect(parseVoiceLineEmotion(long)).toEqual({ text: long, emotion: null })
  })

  it('句中的括号不动——只看句首', () => {
    expect(parseVoiceLineEmotion('别回头（耳语）')).toEqual({
      text: '别回头（耳语）',
      emotion: null,
    })
  })

  it('剥完为空串照样返回，非空校验归调用方', () => {
    expect(parseVoiceLineEmotion('（耳语）')).toEqual({
      text: '',
      emotion: AUDIO_EMOTION.WHISPER,
    })
  })

  it('容忍括号内外的空白', () => {
    expect(parseVoiceLineEmotion('  （ 耳语 ）  别回头  ')).toEqual({
      text: '别回头',
      emotion: AUDIO_EMOTION.WHISPER,
    })
  })

  it('空输入不炸', () => {
    expect(parseVoiceLineEmotion('')).toEqual({ text: '', emotion: null })
  })
})
