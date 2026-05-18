import { describe, expect, it } from 'vitest'

import {
  applyAudioFeedbackTags,
  type AudioFeedbackTag,
} from './audio-feedback-mapping'

function makeState(
  overrides?: Partial<Parameters<typeof applyAudioFeedbackTags>[1]>,
) {
  return {
    audioEmotion: 'none',
    audioPace: 'normal',
    audioPauseMarkers: [] as string[],
    audioLatency: 'low' as const,
    audioFormat: 'mp3' as const,
    audioMp3Bitrate: 128,
    audioSampleRate: 24000,
    audioNormalizeLoudness: false,
    ...overrides,
  }
}

describe('applyAudioFeedbackTags', () => {
  it('returns an empty patch when no tags are provided', () => {
    const patch = applyAudioFeedbackTags([], makeState())
    expect(patch.actions).toEqual([])
    expect(patch.openPanel).toBeNull()
    expect(patch.pronunciationHint).toBe(false)
  })

  it('voice_mismatch opens the voice selector without dispatching state changes', () => {
    const patch = applyAudioFeedbackTags(['voice_mismatch'], makeState())
    expect(patch.openPanel).toBe('voiceSelector')
    expect(patch.actions).toEqual([])
  })

  it('emotion_wrong cycles to the next reading style', () => {
    const patch = applyAudioFeedbackTags(
      ['emotion_wrong'],
      makeState({ audioEmotion: 'calm' }),
    )
    expect(patch.actions).toEqual([
      { type: 'SET_AUDIO_EMOTION', payload: 'excited' },
    ])
  })

  it('pace_wrong cycles slow → normal → fast → slow', () => {
    const slowToNormal = applyAudioFeedbackTags(
      ['pace_wrong'],
      makeState({ audioPace: 'slow' }),
    )
    expect(slowToNormal.actions).toEqual([
      { type: 'SET_AUDIO_PACE', payload: 'normal' },
    ])

    const fastToSlow = applyAudioFeedbackTags(
      ['pace_wrong'],
      makeState({ audioPace: 'fast' }),
    )
    expect(fastToSlow.actions).toEqual([
      { type: 'SET_AUDIO_PACE', payload: 'slow' },
    ])
  })

  it('pronunciation_error surfaces a hint flag instead of patching state', () => {
    const patch = applyAudioFeedbackTags(['pronunciation_error'], makeState())
    expect(patch.pronunciationHint).toBe(true)
    expect(patch.actions).toEqual([])
    expect(patch.openPanel).toBeNull()
  })

  it('pause_unnatural cycles through preset pause marker sets', () => {
    const fromEmpty = applyAudioFeedbackTags(
      ['pause_unnatural'],
      makeState({ audioPauseMarkers: [] }),
    )
    expect(fromEmpty.actions).toEqual([
      {
        type: 'SET_AUDIO_PAUSE_MARKERS',
        payload: ['after_sentence_1'],
      },
    ])

    const fromOne = applyAudioFeedbackTags(
      ['pause_unnatural'],
      makeState({ audioPauseMarkers: ['after_sentence_1'] }),
    )
    expect(fromOne.actions).toEqual([
      {
        type: 'SET_AUDIO_PAUSE_MARKERS',
        payload: ['after_sentence_1', 'after_sentence_2'],
      },
    ])

    const fromAll = applyAudioFeedbackTags(
      ['pause_unnatural'],
      makeState({
        audioPauseMarkers: [
          'after_sentence_1',
          'after_sentence_2',
          'after_sentence_3',
        ],
      }),
    )
    expect(fromAll.actions).toEqual([
      { type: 'SET_AUDIO_PAUSE_MARKERS', payload: [] },
    ])
  })

  it('audio_quality bumps every quality-related field that is below target', () => {
    const patch = applyAudioFeedbackTags(['audio_quality'], makeState())

    expect(patch.actions).toEqual([
      { type: 'SET_AUDIO_LATENCY', payload: 'normal' },
      { type: 'SET_AUDIO_MP3_BITRATE', payload: 192 },
      { type: 'SET_AUDIO_SAMPLE_RATE', payload: 44100 },
      { type: 'SET_AUDIO_NORMALIZE_LOUDNESS', payload: true },
    ])
  })

  it('audio_quality is a no-op when settings are already at or above the target', () => {
    const patch = applyAudioFeedbackTags(
      ['audio_quality'],
      makeState({
        audioLatency: 'normal',
        audioMp3Bitrate: 192,
        audioSampleRate: 48000,
        audioNormalizeLoudness: true,
      }),
    )
    expect(patch.actions).toEqual([])
  })

  it('audio_quality skips the mp3 bitrate bump when the format is not mp3', () => {
    const patch = applyAudioFeedbackTags(
      ['audio_quality'],
      makeState({
        audioFormat: 'opus',
        audioLatency: 'normal',
        audioSampleRate: 48000,
        audioNormalizeLoudness: true,
      }),
    )
    expect(patch.actions).toEqual([])
  })

  it('handles a combo of tags without conflicts', () => {
    const tags: AudioFeedbackTag[] = [
      'voice_mismatch',
      'pace_wrong',
      'audio_quality',
    ]
    const patch = applyAudioFeedbackTags(
      tags,
      makeState({ audioPace: 'normal' }),
    )

    expect(patch.openPanel).toBe('voiceSelector')
    expect(patch.actions).toEqual([
      { type: 'SET_AUDIO_PACE', payload: 'fast' },
      { type: 'SET_AUDIO_LATENCY', payload: 'normal' },
      { type: 'SET_AUDIO_MP3_BITRATE', payload: 192 },
      { type: 'SET_AUDIO_SAMPLE_RATE', payload: 44100 },
      { type: 'SET_AUDIO_NORMALIZE_LOUDNESS', payload: true },
    ])
  })
})
