export const VOICE_CARD_PROVIDER = {
  FISH_AUDIO: 'fish_audio',
  FAL_F5TTS: 'fal_f5tts',
} as const

export const VOICE_CARD_PROVIDERS = [
  VOICE_CARD_PROVIDER.FISH_AUDIO,
  VOICE_CARD_PROVIDER.FAL_F5TTS,
] as const

export const VOICE_CARD_GENDERS = ['male', 'female', 'neutral'] as const

export const VOICE_CARD_AGES = ['child', 'young', 'adult', 'senior'] as const

export const VOICE_CARD_PACES = ['slow', 'normal', 'fast'] as const

export const VOICE_CARD_PITCHES = ['low', 'medium', 'high'] as const

export const VOICE_CARD_DEFAULT_PROVIDER = VOICE_CARD_PROVIDER.FISH_AUDIO

export const VOICE_CARD_DEFAULT_PACE = 'normal'

export const AUDIO_EMOTION = {
  NEUTRAL: 'neutral',
  HAPPY: 'happy',
  SAD: 'sad',
  ANGRY: 'angry',
  EXCITED: 'excited',
  CALM: 'calm',
  FEARFUL: 'fearful',
} as const

export const AUDIO_EMOTIONS = [
  AUDIO_EMOTION.NEUTRAL,
  AUDIO_EMOTION.HAPPY,
  AUDIO_EMOTION.SAD,
  AUDIO_EMOTION.ANGRY,
  AUDIO_EMOTION.EXCITED,
  AUDIO_EMOTION.CALM,
  AUDIO_EMOTION.FEARFUL,
] as const

export type AudioEmotion = (typeof AUDIO_EMOTIONS)[number]

export const AUDIO_PACE = {
  SLOW: 'slow',
  NORMAL: 'normal',
  FAST: 'fast',
} as const

export const AUDIO_PACES = [
  AUDIO_PACE.SLOW,
  AUDIO_PACE.NORMAL,
  AUDIO_PACE.FAST,
] as const

export type AudioPace = (typeof AUDIO_PACES)[number]

export const AUDIO_PAUSE_MARKERS = [
  'after_sentence_1',
  'after_sentence_2',
  'after_sentence_3',
] as const

export const AUDIO_DEFAULT_EMOTION = AUDIO_EMOTION.NEUTRAL

export const AUDIO_DEFAULT_PACE = AUDIO_PACE.NORMAL

export const AUDIO_PACE_SPEED = {
  [AUDIO_PACE.SLOW]: 0.85,
  [AUDIO_PACE.NORMAL]: 1,
  [AUDIO_PACE.FAST]: 1.2,
} as const
