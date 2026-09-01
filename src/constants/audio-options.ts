/**
 * 参考音频的体积上限。
 *
 * ⚠ 这个数**必须只有一份**：`services/audio-reference.service.ts` 是
 * `import 'server-only'`，客户端够不到它，于是 `StudioAudioParams` 当初就地抄了
 * 一份 25MB。2026-08-29 加视频音频参考面板时这本该抄第三份 —— 收在这里，服务端
 * 与两个客户端面板读同一个数（Hard Rule 1）。
 */
export const REFERENCE_AUDIO_MAX_MB = 25
export const REFERENCE_AUDIO_MAX_BYTES = REFERENCE_AUDIO_MAX_MB * 1024 * 1024

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

/**
 * Absolute ceiling on the text of ONE audio request — a **payload guard, not a
 * capability ceiling**. Nothing derives a vendor's ability from this number.
 *
 * Per-model capability lives on `ModelOption.maxPromptChars` (see
 * `constants/models/audio.ts`); `resolveAudioTextLimit()` there is the single
 * place that combines the two. A model that documents no ceiling declares none,
 * and only this guard applies.
 *
 * 40_000 = the largest per-request ceiling any mainstream TTS vendor publishes
 * (ElevenLabs Flash v2.5; the same table lists v3 at 5000, Multilingual v2 at
 * 10_000 — https://elevenlabs.io/docs/overview/models). A single request longer
 * than the biggest number anyone documents is not a synthesis request, it is an
 * accident or abuse, so it is refused outright rather than billed per character.
 * ⚠ It is **not** a promise that 40_000 works: at TTS_ESTIMATED_CHARS_PER_MINUTE
 * that is ~44 min of speech and would almost certainly hit the model's
 * `timeoutMs` (Fish: 60s) first. Where that wall actually stands is unmeasured —
 * measure it before turning this into a user-facing promise. Long text is meant
 * to go to a chunked pipeline instead — one that splits above the *resolved
 * per-model* limit rather than at a single platform-wide number. **That
 * pipeline does not exist yet**; until it does, this guard is the only ceiling.
 *
 * History: this replaces `TTS_MAX_TEXT_LENGTH = 5000`, which was ElevenLabs
 * v3's number applied to every provider — including Fish Audio (publishes "no
 * hard character cap", fair-use only), ElevenLabs SFX and ElevenLabs Music.
 * v3 itself has been `available: false` since 2026-07-26, so the one model the
 * number belonged to was not even reachable. Verified + split 2026-08-07 (L).
 */
export const AUDIO_PROMPT_PAYLOAD_MAX_CHARS = 40_000

/** Soft "you're close" warning, at 90% of whichever limit is in force. */
export const TTS_PROMPT_WARNING_RATIO = 0.9

/**
 * Transcript of the reference audio clip in a Fish Audio `references` pair —
 * a short cloning sample's text, never synthesis input.
 *
 * ⚠ Inherited, not derived: it rode the old shared TTS cap and is kept at that
 * value so nothing that works today breaks. Fish documents no limit on
 * `references[].text`
 * (https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech),
 * so this is a payload guard too. Tightening it on a guess is the risky
 * direction (it would reject working clone pairs); leave it unless a real
 * upstream limit turns up.
 */
export const TTS_REFERENCE_TEXT_MAX_CHARS = 5000
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

// ─── Audio kind (speech / sfx / music) ────────────────────────────
//
// A capability ATTRIBUTE on audio models, not a separate mode/route/outputType.
// The audio workspace filters AUDIO_MODEL_OPTIONS by the active kind; every
// audio model declares which kind it produces (default: speech).

export const AUDIO_KIND = {
  SPEECH: 'speech',
  SFX: 'sfx',
  MUSIC: 'music',
} as const

export const AUDIO_KINDS = [
  AUDIO_KIND.SPEECH,
  AUDIO_KIND.SFX,
  AUDIO_KIND.MUSIC,
] as const

export type AudioKind = (typeof AUDIO_KINDS)[number]

export const DEFAULT_AUDIO_KIND: AudioKind = AUDIO_KIND.SPEECH

export function isAudioKind(value: string): value is AudioKind {
  return AUDIO_KINDS.includes(value as AudioKind)
}

// ─── Sound effects (SFX) ───────────────────────────────────────────
//
// ElevenLabs SFX V2 (`POST /v1/sound-generation`): a text prompt → one sound
// clip. Duration is optional (the model auto-picks when omitted), capped at
// 30s; `promptInfluence` trades prompt adherence vs creativity; `loop` makes a
// seamless loop. Variant count (×N) is a client concern — issue N requests.

export const SFX_DURATION_RANGE = {
  min: 0.5,
  max: 30,
  step: 0.5,
} as const

export const SFX_PROMPT_INFLUENCE_RANGE = {
  min: 0,
  max: 1,
  step: 0.05,
  default: 0.3,
} as const

export const SFX_VARIANT_COUNTS = [1, 2, 4] as const
export type SfxVariantCount = (typeof SFX_VARIANT_COUNTS)[number]
export const DEFAULT_SFX_VARIANT_COUNT: SfxVariantCount = 4

export const DEFAULT_SFX_DURATION_SECONDS = 5

// ─── Music ─────────────────────────────────────────────────────────
//
// ⚠ 上游（ElevenLabs Music v2 `POST /v1/music`）声明的是 `music_length_ms`
// **3000–600000**，也就是 3–600 秒；适配器省略时按 30 秒发。
// 这里下限取 **5 秒**而不是 3：3–4 秒的「音乐」没有产品意义，而 5 起步能让
// step=5 的档位落得整齐（5 / 10 / 15 …）。取值仍在厂商区间内，不会被拒。
// ⚠ 这是**我拍的产品下限**，不是厂商限制 —— 要放宽到 3 只需改这里，服务端不用动。
export const MUSIC_DURATION_RANGE = {
  min: 5,
  max: 600,
  step: 5,
} as const

/** 与 `elevenlabs.adapter.ts` 省略 duration 时的兜底同一个数，两处不能各写各的。 */
export const DEFAULT_MUSIC_DURATION_SECONDS = 30

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
