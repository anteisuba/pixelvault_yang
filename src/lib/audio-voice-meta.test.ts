import { describe, expect, it } from 'vitest'

import {
  AudioVoiceMetaSchema,
  audioVoiceGenerationFields,
} from './audio-voice-meta'

describe('audio-voice-meta（11-17：Worker 落库丢了 voiceId → 配音台认不出这一句）', () => {
  it('队列元数据里的三样原样穿过 schema（⛔ 被 Zod 当未知键剥掉）', () => {
    const parsed = AudioVoiceMetaSchema.parse({
      voiceId: 'fish-voice-1',
      voiceName: '晴',
      audioCoverUrl: 'https://cdn.example.com/cover.png',
      unrelated: true,
    })
    expect(parsed).toEqual({
      voiceId: 'fish-voice-1',
      voiceName: '晴',
      audioCoverUrl: 'https://cdn.example.com/cover.png',
    })
  })

  it('落库字段与同步路径同形：snapshot.voiceId / snapshot.voiceName / previewUrl', () => {
    expect(
      audioVoiceGenerationFields({
        voiceId: 'fish-voice-1',
        voiceName: '晴',
        audioCoverUrl: 'https://cdn.example.com/cover.png',
      }),
    ).toEqual({
      previewUrl: 'https://cdn.example.com/cover.png',
      snapshot: { voiceId: 'fish-voice-1', voiceName: '晴' },
    })
  })

  it('没有的就不写（老任务元数据里没这几样）', () => {
    expect(audioVoiceGenerationFields({})).toEqual({ snapshot: {} })
  })
})
