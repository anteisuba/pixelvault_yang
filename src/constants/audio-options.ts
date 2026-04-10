/** Supported audio output formats */
export const AUDIO_FORMATS = ['mp3', 'wav', 'opus'] as const
export type AudioFormat = (typeof AUDIO_FORMATS)[number]

/** Supported audio sample rates (Hz) */
export const AUDIO_SAMPLE_RATES = [24000, 44100, 48000] as const
export type AudioSampleRate = (typeof AUDIO_SAMPLE_RATES)[number]

/** TTS text input constraints */
export const TTS_MAX_TEXT_LENGTH = 5000

/** Speed control range for TTS */
export const TTS_SPEED_RANGE = {
  min: 0.5,
  max: 2.0,
  step: 0.1,
  default: 1.0,
} as const

/** Default audio format */
export const DEFAULT_AUDIO_FORMAT: AudioFormat = 'mp3'

/** Default audio sample rate */
export const DEFAULT_AUDIO_SAMPLE_RATE: AudioSampleRate = 44100

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
