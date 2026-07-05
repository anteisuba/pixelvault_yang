export const VOICE_CARD_PROVIDER = {
  FISH_AUDIO: 'fish_audio',
  FAL_F5TTS: 'fal_f5tts',
} as const

export const VOICE_CARD_PROVIDERS = [
  VOICE_CARD_PROVIDER.FISH_AUDIO,
  VOICE_CARD_PROVIDER.FAL_F5TTS,
] as const

export type VoiceCardProvider = (typeof VOICE_CARD_PROVIDERS)[number]

export const VOICE_MARKET_SOURCE = {
  ALL: 'all',
  FISH_AUDIO: VOICE_CARD_PROVIDER.FISH_AUDIO,
} as const

export const VOICE_MARKET_SOURCES = [
  VOICE_MARKET_SOURCE.ALL,
  VOICE_MARKET_SOURCE.FISH_AUDIO,
] as const

export type VoiceMarketSource = (typeof VOICE_MARKET_SOURCES)[number]

export const VOICE_CARD_GENDERS = ['male', 'female', 'neutral'] as const

export const VOICE_CARD_AGES = ['child', 'young', 'adult', 'senior'] as const

export const VOICE_CARD_PACES = ['slow', 'normal', 'fast'] as const

export const VOICE_CARD_PITCHES = ['low', 'medium', 'high'] as const

export const VOICE_CARD_DEFAULT_PROVIDER = VOICE_CARD_PROVIDER.FISH_AUDIO

export const VOICE_API_ERROR_CODES = {
  MISSING_API_KEY: 'MISSING_API_KEY',
  PUBLIC_LIBRARY_UNAVAILABLE: 'PUBLIC_LIBRARY_UNAVAILABLE',
} as const

export const VOICE_TRAIN_MAX_FILES = 8
export const VOICE_TRAIN_MAX_FILE_BYTES = 10 * 1024 * 1024

export const VOICE_CARD_DEFAULT_PACE = 'normal'

export const AUDIO_STYLE = {
  NONE: 'none',
  CALM: 'calm',
  EXCITED: 'excited',
  WHISPER: 'whisper',
  NARRATION: 'narration',
  DIALOGUE: 'dialogue',
} as const

export const AUDIO_STYLES = [
  AUDIO_STYLE.NONE,
  AUDIO_STYLE.CALM,
  AUDIO_STYLE.EXCITED,
  AUDIO_STYLE.WHISPER,
  AUDIO_STYLE.NARRATION,
  AUDIO_STYLE.DIALOGUE,
] as const

export type AudioStyle = (typeof AUDIO_STYLES)[number]

/**
 * Canonical single-word bracket cues. The service wraps each as `[word]` and
 * injects it at the start of every sentence (see `applyAudioStylePrompt`).
 * Both providers are instruction-following: ElevenLabs v3 treats `[whispers]`
 * as an audio tag, Fish s2-pro accepts the same word as a free-form cue. Strong
 * canonical words (`excited`, `whispers`) land far harder than the old
 * descriptive phrases (`excited and energetic`), which read as flat narration.
 */
export const AUDIO_STYLE_PROMPTS = {
  [AUDIO_STYLE.NONE]: null,
  [AUDIO_STYLE.CALM]: 'calm',
  [AUDIO_STYLE.EXCITED]: 'excited',
  [AUDIO_STYLE.WHISPER]: 'whispers',
  [AUDIO_STYLE.NARRATION]: 'narrating',
  [AUDIO_STYLE.DIALOGUE]: 'conversational',
} as const satisfies Record<AudioStyle, string | null>

/**
 * Voice emotion = the reading styles plus three true emotions (b3 canvas
 * draft: 愤怒/悲伤/惊讶). Kept SEPARATE from AUDIO_STYLE so the Studio reading-
 * style chips (STYLE_OPTIONS, 6 values) and the audio-feedback cycle stay
 * unchanged, while the voice node's emotion picker can use the wider set. Fish
 * has no structured emotion field, so each maps to a prompt prefix below.
 */
export const AUDIO_EMOTION = {
  ...AUDIO_STYLE,
  ANGRY: 'angry',
  SAD: 'sad',
  SURPRISED: 'surprised',
} as const

export const AUDIO_EMOTIONS = [
  ...AUDIO_STYLES,
  AUDIO_EMOTION.ANGRY,
  AUDIO_EMOTION.SAD,
  AUDIO_EMOTION.SURPRISED,
] as const

export type AudioEmotion = (typeof AUDIO_EMOTIONS)[number]

export const AUDIO_EMOTION_PROMPTS = {
  ...AUDIO_STYLE_PROMPTS,
  [AUDIO_EMOTION.ANGRY]: 'angry',
  [AUDIO_EMOTION.SAD]: 'sad',
  [AUDIO_EMOTION.SURPRISED]: 'surprised',
} as const satisfies Record<AudioEmotion, string | null>

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

export const AUDIO_DEFAULT_EMOTION = AUDIO_STYLE.NONE

export const AUDIO_DEFAULT_PACE = AUDIO_PACE.NORMAL

export const AUDIO_PACE_SPEED = {
  [AUDIO_PACE.SLOW]: 0.75,
  [AUDIO_PACE.NORMAL]: 1,
  [AUDIO_PACE.FAST]: 1.35,
} as const

export const VOICE_LIBRARY_PAGE_SIZE = 20

export const VOICE_LIBRARY_LANGUAGES = ['all', 'zh', 'en', 'ja', 'es'] as const

export type VoiceLibraryLanguage = (typeof VOICE_LIBRARY_LANGUAGES)[number]

export const VOICE_LIBRARY_LANGUAGE_FILTERS = [
  { value: 'all', labelKey: 'voiceLanguageAll' },
  { value: 'zh', labelKey: 'voiceLanguageChinese' },
  { value: 'en', labelKey: 'voiceLanguageEnglish' },
  { value: 'ja', labelKey: 'voiceLanguageJapanese' },
  { value: 'es', labelKey: 'voiceLanguageSpanish' },
] as const satisfies readonly {
  value: VoiceLibraryLanguage
  labelKey: string
}[]

export const VOICE_LIBRARY_SORT_BY_VALUES = [
  'score',
  'task_count',
  'created_at',
] as const

export type VoiceLibrarySortBy = (typeof VOICE_LIBRARY_SORT_BY_VALUES)[number]

export const VOICE_LIBRARY_SORT_OPTIONS = [
  { value: 'score', labelKey: 'voiceSortRecommended' },
  { value: 'task_count', labelKey: 'voiceSortPopular' },
  { value: 'created_at', labelKey: 'voiceSortNewest' },
] as const satisfies readonly {
  value: VoiceLibrarySortBy
  labelKey: string
}[]
