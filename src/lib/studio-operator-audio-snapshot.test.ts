import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/types/model-option'

import {
  audioPatchActions,
  buildAudioOperatorSnapshot,
  type StudioAudioForm,
} from './studio-operator-audio-snapshot'

function option(
  overrides: Partial<StudioModelOption> & { optionId: string; modelId: string },
): StudioModelOption {
  return {
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: { label: 'fal.ai' } as StudioModelOption['providerConfig'],
    requestCount: 30,
    isBuiltIn: true,
    sourceType: 'workspace',
    ...overrides,
  }
}

const FORM: StudioAudioForm = {
  prompt: '你好',
  audioKind: 'speech',
  voiceId: 'voice-1',
  voiceCardId: 'card-1',
  audioSpeakerVoiceIds: [],
  pronunciationDictionary: {},
  audioReferenceUrl: null,
  audioReferenceFileName: null,
  audioReferenceText: '',
  audioEmotion: 'none',
  audioExpressiveness: 'auto',
  audioPace: 'normal',
  audioPauseMarkers: [],
  audioSfxDurationSeconds: 5,
  audioMusicDurationSeconds: 30,
  audioSfxLoop: false,
  audioSfxVariantCount: 1,
  audioVolume: 0,
  audioTemperature: 0.7,
  audioTopP: 0.7,
  audioFormat: 'mp3',
} as StudioAudioForm

describe('配音台快照', () => {
  it('同一型号多条线路只留一条（有 key 的优先），三档模型都给', () => {
    const noKey = option({ optionId: 'a', modelId: 'fish' })
    const withKey = option({ optionId: 'b', modelId: 'fish', keyId: 'k' })
    const music = option({ optionId: 'm', modelId: 'music' })
    const snapshot = buildAudioOperatorSnapshot({
      form: FORM,
      modelsByKind: { speech: [noKey, withKey], sfx: [], music: [music] },
      selectedModel: withKey,
      labelOf: (item) => item.modelId,
    })
    expect(snapshot.audio?.models).toEqual([
      { id: 'b', label: 'fish', kind: 'speech' },
      { id: 'm', label: 'music', kind: 'music' },
    ])
    expect(snapshot.model).toEqual({
      id: 'b',
      label: 'fish',
      catalogId: 'fish',
    })
    expect(snapshot.audio?.voice).toEqual({
      cardId: 'card-1',
      voiceId: 'voice-1',
    })
  })
})

describe('set_audio 落到表单', () => {
  it('只派发给了的那几格（⛔ 没给的不当成设回默认）', () => {
    expect(
      audioPatchActions({
        voice: { cardId: 'card-2', voiceId: 'voice-2' },
        pace: 'slow',
      }),
    ).toEqual([
      { type: 'SET_VOICE_CARD_ID', payload: 'card-2' },
      { type: 'SET_VOICE_ID', payload: 'voice-2' },
      { type: 'SET_AUDIO_PACE', payload: 'slow' },
    ])
  })
})
