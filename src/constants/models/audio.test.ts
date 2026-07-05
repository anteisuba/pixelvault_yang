import { describe, expect, it } from 'vitest'

import { AUDIO_KIND } from '@/constants/audio-options'
import { AI_MODELS } from '@/constants/models/enum'

import {
  AUDIO_MODEL_OPTIONS,
  getAudioModelsByKind,
  resolveAudioKind,
} from './audio'

describe('audio model kinds', () => {
  it('tags the TTS models as speech and the SFX model as sfx', () => {
    const byId = new Map(AUDIO_MODEL_OPTIONS.map((m) => [m.id, m]))
    expect(resolveAudioKind(byId.get(AI_MODELS.FISH_AUDIO_S2_PRO)!)).toBe(
      AUDIO_KIND.SPEECH,
    )
    expect(resolveAudioKind(byId.get(AI_MODELS.ELEVENLABS_V3)!)).toBe(
      AUDIO_KIND.SPEECH,
    )
    expect(resolveAudioKind(byId.get(AI_MODELS.ELEVENLABS_SFX_V2)!)).toBe(
      AUDIO_KIND.SFX,
    )
  })

  it('defaults to speech when audioKind is unset', () => {
    const model = { ...AUDIO_MODEL_OPTIONS[0]!, audioKind: undefined }
    expect(resolveAudioKind(model)).toBe(AUDIO_KIND.SPEECH)
  })

  it('filters models by kind', () => {
    expect(getAudioModelsByKind(AUDIO_KIND.SPEECH).map((m) => m.id)).toEqual([
      AI_MODELS.FISH_AUDIO_S2_PRO,
      AI_MODELS.ELEVENLABS_V3,
    ])
    expect(getAudioModelsByKind(AUDIO_KIND.SFX).map((m) => m.id)).toEqual([
      AI_MODELS.ELEVENLABS_SFX_V2,
    ])
    expect(getAudioModelsByKind(AUDIO_KIND.MUSIC)).toEqual([])
  })
})
