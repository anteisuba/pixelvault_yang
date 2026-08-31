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
/** 单段样本的上限，MB。字节数由它推出来，别两处各写一个数。 */
export const VOICE_TRAIN_MAX_FILE_MB = 10
export const VOICE_TRAIN_MAX_FILE_BYTES = VOICE_TRAIN_MAX_FILE_MB * 1024 * 1024

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
 * 送进 `[方括号]` 的提示词。服务端把它包成 `[word]` 放在文本开头
 * （见 `applyAudioStylePrompt`）。
 *
 * ⭐ **每一个词都必须能在 Fish 的标记表里查到**（2026-08-30 owner 定：对不上的退场）。
 * 表在 https://docs.fish.audio/developer-guide/core-features/emotions，六类：
 * 基础情感 24 · 进阶情感 25 · 语气与表达 6 · 音效 11 · 停顿 2 · 特效 3。
 *
 * ⚠ 加新档位前先去那张表里找词。以前这里有三个查无此词的自造词——
 * `whispers`（正确写法是 `whispering`）、`narrating`、`conversational`。
 * S2 确实支持自由描述，所以它们不会报错，只会被**静默地当成别的东西**处理掉，
 * 于是「点了没反应」而且没有任何日志能告诉你为什么。
 *
 * ⚠ 别拿音频时长去验这里的选词：Fish 输出是采样的，同输入长度方差就有 ±7%
 * （实测五次极差 9613 字节），分辨不出选词差异。只能听。
 */
export const AUDIO_STYLE_PROMPTS = {
  [AUDIO_STYLE.NONE]: null,
  // 基础情感表里有
  [AUDIO_STYLE.CALM]: 'calm',
  [AUDIO_STYLE.EXCITED]: 'excited',
  // 语气与表达表里有（`whispers` 不在任何一类里）
  [AUDIO_STYLE.WHISPER]: 'whispering',
  /*
   * 旁白 → `soft tone`（语气与表达表：gentle, quiet）。
   * 表里没有「narration」这一类；旁白要的是收着讲、不带情绪起伏，`soft tone` 是
   * 最接近的一条，且与 `calm` 分得开（后者已经被「平静」占了）。
   */
  [AUDIO_STYLE.NARRATION]: 'soft tone',
  /*
   * 对话 → `relaxed`（基础情感表）。
   * 表里没有「conversational」；日常对话要的是放松随意，`relaxed` 是表里唯一对得上
   * 这个意思的词。
   */
  [AUDIO_STYLE.DIALOGUE]: 'relaxed',
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
