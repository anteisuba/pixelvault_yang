/** Supported audio output formats */
export const AUDIO_FORMATS = ['mp3', 'wav', 'pcm', 'opus'] as const
export type AudioFormat = (typeof AUDIO_FORMATS)[number]

/** Supported audio sample rates (Hz) */
export const AUDIO_SAMPLE_RATES = [
  8000, 16000, 24000, 32000, 44100, 48000,
] as const
export type AudioSampleRate = (typeof AUDIO_SAMPLE_RATES)[number]

export const AUDIO_MP3_BITRATES = [64, 128, 192] as const
export type AudioMp3Bitrate = (typeof AUDIO_MP3_BITRATES)[number]

export const AUDIO_OPUS_BITRATES = [-1000, 24000, 32000, 48000, 64000] as const
export type AudioOpusBitrate = (typeof AUDIO_OPUS_BITRATES)[number]

export const AUDIO_LATENCIES = ['normal', 'balanced', 'low'] as const
export type AudioLatency = (typeof AUDIO_LATENCIES)[number]

/** TTS text input constraints */
export const TTS_MAX_TEXT_LENGTH = 5000
export const TTS_PROMPT_WARNING_LENGTH = 4500
export const TTS_ESTIMATED_CHARS_PER_MINUTE = 900
export const TTS_MIN_PREVIEW_MINUTES = 0.1
export const AUDIO_SPEAKER_VOICE_IDS_MAX = 8
export const AUDIO_SPEAKER_VOICE_ID_MAX_LENGTH = 200

export const AUDIO_ADVANCED_TAB_IDS = {
  OUTPUT: 'output',
  VOICE: 'voice',
  MODEL: 'model',
} as const

export type AudioAdvancedTabId =
  (typeof AUDIO_ADVANCED_TAB_IDS)[keyof typeof AUDIO_ADVANCED_TAB_IDS]

export function isAudioAdvancedTabId(
  value: string,
): value is AudioAdvancedTabId {
  return Object.values(AUDIO_ADVANCED_TAB_IDS).includes(
    value as AudioAdvancedTabId,
  )
}

/** Speed control range for TTS */
export const TTS_SPEED_RANGE = {
  min: 0.5,
  max: 2.0,
  step: 0.1,
  default: 1.0,
} as const

export const TTS_VOLUME_RANGE = {
  min: -20,
  max: 20,
  step: 1,
  default: 0,
} as const

export const TTS_TEMPERATURE_RANGE = {
  min: 0,
  max: 1,
  step: 0.05,
  default: 0.7,
} as const

export const TTS_TOP_P_RANGE = {
  min: 0,
  max: 1,
  step: 0.05,
  default: 0.7,
} as const

export const TTS_CHUNK_LENGTH_RANGE = {
  min: 100,
  max: 300,
  step: 10,
  default: 300,
} as const

export const TTS_REPETITION_PENALTY_RANGE = {
  min: 1,
  max: 2,
  step: 0.05,
  default: 1.2,
} as const

/** Default audio format */
export const DEFAULT_AUDIO_FORMAT: AudioFormat = 'mp3'

/** Default audio sample rate */
export const DEFAULT_AUDIO_SAMPLE_RATE: AudioSampleRate = 44100

export const DEFAULT_AUDIO_MP3_BITRATE: AudioMp3Bitrate = 128

export const DEFAULT_AUDIO_OPUS_BITRATE: AudioOpusBitrate = 32000

export const DEFAULT_AUDIO_LATENCY: AudioLatency = 'normal'

// ─── Expressiveness (emotion responsiveness) ───────────────────────
//
// One user-facing knob that each TTS provider compiles differently:
//   - ElevenLabs v3: `stability` — LOWER = more responsive to emotion tags
//   - Fish s2-pro:   `temperature` — HIGHER = more expressive
// `auto` is the default UI state; the service resolves it from emotion intent
// (emotion present → dramatic, else natural). The three concrete tiers are the
// user's manual override.

export const AUDIO_EXPRESSIVENESS = {
  AUTO: 'auto',
  RESTRAINED: 'restrained',
  NATURAL: 'natural',
  DRAMATIC: 'dramatic',
} as const

export const AUDIO_EXPRESSIVENESS_VALUES = [
  AUDIO_EXPRESSIVENESS.AUTO,
  AUDIO_EXPRESSIVENESS.RESTRAINED,
  AUDIO_EXPRESSIVENESS.NATURAL,
  AUDIO_EXPRESSIVENESS.DRAMATIC,
] as const

export type AudioExpressiveness = (typeof AUDIO_EXPRESSIVENESS_VALUES)[number]

/** Concrete tiers shown as buttons (AUTO is the resolved default, not a button). */
export const AUDIO_EXPRESSIVENESS_TIERS = [
  AUDIO_EXPRESSIVENESS.RESTRAINED,
  AUDIO_EXPRESSIVENESS.NATURAL,
  AUDIO_EXPRESSIVENESS.DRAMATIC,
] as const

export type AudioExpressivenessTier =
  (typeof AUDIO_EXPRESSIVENESS_TIERS)[number]

export const AUDIO_DEFAULT_EXPRESSIVENESS: AudioExpressiveness =
  AUDIO_EXPRESSIVENESS.AUTO

export function isAudioExpressiveness(
  value: string,
): value is AudioExpressiveness {
  return AUDIO_EXPRESSIVENESS_VALUES.includes(value as AudioExpressiveness)
}

/** ElevenLabs v3 voice_settings per tier. Lower stability = more expressive. */
export const EXPRESSIVENESS_TO_ELEVENLABS = {
  [AUDIO_EXPRESSIVENESS.RESTRAINED]: { stability: 1, style: 0 },
  [AUDIO_EXPRESSIVENESS.NATURAL]: { stability: 0.5, style: 0.35 },
  [AUDIO_EXPRESSIVENESS.DRAMATIC]: { stability: 0, style: 0.6 },
} as const satisfies Record<
  AudioExpressivenessTier,
  { stability: number; style: number }
>

/** Fish s2-pro temperature per tier. Higher = more expressive. */
export const EXPRESSIVENESS_TO_FISH_TEMPERATURE = {
  [AUDIO_EXPRESSIVENESS.RESTRAINED]: 0.5,
  [AUDIO_EXPRESSIVENESS.NATURAL]: 0.7,
  [AUDIO_EXPRESSIVENESS.DRAMATIC]: 0.9,
} as const satisfies Record<AudioExpressivenessTier, number>

/** Preset voice options for Fish Audio */
export const FISH_AUDIO_VOICES = [
  { id: 'alloy', labelKey: 'alloy', descKey: 'alloyDesc' },
  { id: 'echo', labelKey: 'echo', descKey: 'echoDesc' },
  { id: 'fable', labelKey: 'fable', descKey: 'fableDesc' },
  { id: 'onyx', labelKey: 'onyx', descKey: 'onyxDesc' },
  { id: 'nova', labelKey: 'nova', descKey: 'novaDesc' },
  { id: 'shimmer', labelKey: 'shimmer', descKey: 'shimmerDesc' },
] as const

export type FishAudioVoiceId = (typeof FISH_AUDIO_VOICES)[number]['id']

export function isAudioFormat(value: string): value is AudioFormat {
  return AUDIO_FORMATS.includes(value as AudioFormat)
}

export function isAudioLatency(value: string): value is AudioLatency {
  return AUDIO_LATENCIES.includes(value as AudioLatency)
}

/**
 * Trim, drop empties / oversized entries, de-duplicate, and cap to the max
 * speaker count. Used by the reducer so every consumer reads an already
 * normalized list — UI components can `trust` props instead of re-normalizing.
 */
export function normalizeSpeakerVoiceIds(voiceIds: string[]): string[] {
  const next: string[] = []

  for (const voiceId of voiceIds) {
    const trimmed = voiceId.trim()
    if (
      !trimmed ||
      trimmed.length > AUDIO_SPEAKER_VOICE_ID_MAX_LENGTH ||
      next.includes(trimmed)
    ) {
      continue
    }

    next.push(trimmed)
    if (next.length >= AUDIO_SPEAKER_VOICE_IDS_MAX) break
  }

  return next
}
