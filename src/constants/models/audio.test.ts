import { describe, expect, it } from 'vitest'

import {
  AUDIO_KIND,
  AUDIO_PROMPT_PAYLOAD_MAX_CHARS,
} from '@/constants/audio-options'
import { AI_MODELS } from '@/constants/models/enum'

import {
  AUDIO_MODEL_OPTIONS,
  getAudioModelsByKind,
  resolveAudioKind,
  resolveAudioTextLimit,
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
    expect(getAudioModelsByKind(AUDIO_KIND.MUSIC).map((m) => m.id)).toEqual([
      AI_MODELS.ELEVENLABS_MUSIC_V2,
    ])
  })

  it('keeps the text ceiling per model instead of one shared number', () => {
    const byId = new Map(AUDIO_MODEL_OPTIONS.map((m) => [m.id, m]))

    // ElevenLabs v3 documents 5000/request; that number is its own and stays
    // with its entry.
    expect(resolveAudioTextLimit(byId.get(AI_MODELS.ELEVENLABS_V3))).toEqual({
      declared: 5000,
      enforced: 5000,
    })

    // Fish publishes no cap — the whole point of the L split. If someone fills
    // maxPromptChars in here, they need a vendor citation, not a guess.
    expect(
      resolveAudioTextLimit(byId.get(AI_MODELS.FISH_AUDIO_S2_PRO)),
    ).toEqual({
      declared: undefined,
      enforced: AUDIO_PROMPT_PAYLOAD_MAX_CHARS,
    })

    // Regression on the actual bug: the two must NOT resolve to the same
    // number. Before 2026-08-07 every audio model was held to v3's 5000.
    expect(AUDIO_PROMPT_PAYLOAD_MAX_CHARS).toBeGreaterThan(5000)
  })

  it('leaves SFX and music undeclared rather than inheriting the TTS number', () => {
    const byId = new Map(AUDIO_MODEL_OPTIONS.map((m) => [m.id, m]))

    for (const id of [
      AI_MODELS.ELEVENLABS_SFX_V2,
      AI_MODELS.ELEVENLABS_MUSIC_V2,
    ]) {
      expect(resolveAudioTextLimit(byId.get(id)).declared).toBeUndefined()
    }
  })

  it('falls back to the payload guard for an unknown model', () => {
    expect(resolveAudioTextLimit(undefined)).toEqual({
      declared: undefined,
      enforced: AUDIO_PROMPT_PAYLOAD_MAX_CHARS,
    })
  })

  it('pins Fish production execution id to s2.1-pro', () => {
    const fish = AUDIO_MODEL_OPTIONS.find(
      (m) => m.id === AI_MODELS.FISH_AUDIO_S2_PRO,
    )
    expect(fish?.externalModelId).toBe('s2.1-pro')
    expect(fish?.available).toBe(true)
  })
})
