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
