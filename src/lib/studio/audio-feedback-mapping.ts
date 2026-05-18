import {
  AUDIO_PACES,
  AUDIO_PAUSE_MARKERS,
  AUDIO_STYLES,
} from '@/constants/voice-cards'
import type { AudioFormat, AudioLatency } from '@/constants/audio-options'
import type {
  PanelName,
  StudioAction,
  StudioFormState,
} from '@/contexts/studio-context'

/**
 * The reactive feedback the user can attach to a freshly generated audio
 * clip. Each tag maps to a deterministic patch + optional UI affordance
 * (open a panel, surface a hint) so "Retry with fixes" produces a
 * predictable, repeatable adjustment.
 */
export const AUDIO_FEEDBACK_TAGS = [
  'voice_mismatch',
  'emotion_wrong',
  'pace_wrong',
  'pronunciation_error',
  'pause_unnatural',
  'audio_quality',
] as const

export type AudioFeedbackTag = (typeof AUDIO_FEEDBACK_TAGS)[number]

export interface AudioFeedbackPatch {
  actions: StudioAction[]
  openPanel: PanelName | null
  pronunciationHint: boolean
}

type AudioFeedbackInput = Pick<
  StudioFormState,
  | 'audioEmotion'
  | 'audioPace'
  | 'audioPauseMarkers'
  | 'audioLatency'
  | 'audioFormat'
  | 'audioMp3Bitrate'
  | 'audioSampleRate'
  | 'audioNormalizeLoudness'
>

const QUALITY_MIN_SAMPLE_RATE = 44100
const QUALITY_MP3_BITRATE = 192

function cycle<T extends string>(items: readonly T[], current: string): T {
  const index = items.indexOf(current as T)
  if (index === -1) return items[0]
  return items[(index + 1) % items.length]
}

function cyclePauseMarkers(current: readonly string[]): string[] {
  // Cycle: [] -> [m1] -> [m1, m2] -> [m1, m2, m3] -> []
  if (current.length === 0) return [AUDIO_PAUSE_MARKERS[0]]
  if (current.length >= AUDIO_PAUSE_MARKERS.length) return []
  return AUDIO_PAUSE_MARKERS.slice(0, current.length + 1)
}

export function applyAudioFeedbackTags(
  tags: readonly AudioFeedbackTag[],
  state: AudioFeedbackInput,
): AudioFeedbackPatch {
  const actions: StudioAction[] = []
  let openPanel: PanelName | null = null
  let pronunciationHint = false

  for (const tag of tags) {
    switch (tag) {
      case 'voice_mismatch':
        openPanel = 'voiceSelector'
        break

      case 'emotion_wrong': {
        const next = cycle(AUDIO_STYLES, state.audioEmotion)
        if (next !== state.audioEmotion) {
          actions.push({ type: 'SET_AUDIO_EMOTION', payload: next })
        }
        break
      }

      case 'pace_wrong': {
        const next = cycle(AUDIO_PACES, state.audioPace)
        if (next !== state.audioPace) {
          actions.push({ type: 'SET_AUDIO_PACE', payload: next })
        }
        break
      }

      case 'pronunciation_error':
        pronunciationHint = true
        break

      case 'pause_unnatural':
        actions.push({
          type: 'SET_AUDIO_PAUSE_MARKERS',
          payload: cyclePauseMarkers(state.audioPauseMarkers),
        })
        break

      case 'audio_quality': {
        const targetLatency: AudioLatency = 'normal'
        const targetFormat: AudioFormat = state.audioFormat

        if (state.audioLatency !== targetLatency) {
          actions.push({ type: 'SET_AUDIO_LATENCY', payload: targetLatency })
        }
        if (
          targetFormat === 'mp3' &&
          state.audioMp3Bitrate < QUALITY_MP3_BITRATE
        ) {
          actions.push({
            type: 'SET_AUDIO_MP3_BITRATE',
            payload: QUALITY_MP3_BITRATE,
          })
        }
        if (state.audioSampleRate < QUALITY_MIN_SAMPLE_RATE) {
          actions.push({
            type: 'SET_AUDIO_SAMPLE_RATE',
            payload: QUALITY_MIN_SAMPLE_RATE,
          })
        }
        if (!state.audioNormalizeLoudness) {
          actions.push({
            type: 'SET_AUDIO_NORMALIZE_LOUDNESS',
            payload: true,
          })
        }
        break
      }
    }
  }

  return { actions, openPanel, pronunciationHint }
}
