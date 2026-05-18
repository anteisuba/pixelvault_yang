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
