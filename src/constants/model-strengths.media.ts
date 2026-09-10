/**
 * Per-model prompt dialects for the **video and audio** catalog.
 *
 * Split from `model-strengths.ts` on purpose: that file carries the image
 * roster plus the router weights, and a video model's rules are a different
 * kind of knowledge (shot labelling, reserved characters, reference-asset
 * contracts, audible tags). Same `ModelStrength` shape, so
 * `getModelEnhanceHint` semantics carry over unchanged.
 *
 * ⚠ Every hint here is what the vendor documents, not what reads nicely.
 * Where no vendor guide exists the entry says so in the first sentence —
 * an invented rule is worse than an admitted gap, because the operator will
 * follow it.
 */

import { AI_MODELS } from '@/constants/models'
import type { ModelStrength } from '@/constants/model-strengths'
import {
  SEEDANCE_20_CONTROL_RULES,
  SEEDANCE_25_CONTROL_RULES,
} from '@/constants/seedance-prompt-plan'

/* ── Seedance ──────────────────────────────────────────────────────────────
 * https://www.volcengine.com/docs/82379/2607689
 * The one difference that decides whether a prompt lands: 2.0 reads shot
 * labels (镜头1 / 镜头2) and ignores second ranges; 2.5 reads whole-second
 * ranges. Writing 2.5's segmentation into a 2.0 prompt loses the whole
 * timeline silently — no error, just one undifferentiated shot.
 */
const SEEDANCE_20_HINT =
  'Seedance 2.0 (ByteDance). Four blocks in order: reference bindings, a one-line summary of the whole clip, the beats, then a closing line for what runs through all of them. Label beats 镜头1 / 镜头2 / 镜头3 — 2.0 reads shot labels only and ignores second ranges, so a range written here is dead text. Bind assets first (将<图片1>中的[特征]定义为<主体1>) and refer to them afterwards as <主体1>@<图片1>. Reserved characters carry meaning: （）music, <>sound effect, {}spoken line, 【】on-screen caption; name the language of any non-English line. One camera move per 镜头. The trailing switches --rs --dur --cf are weakly validated: a typo is silently ignored rather than refused. Lock identity, wardrobe and space; never lock the pose.'

const SEEDANCE_25_HINT =
  'Seedance 2.5 (ByteDance). Four blocks in order: reference bindings, a one-line summary of the whole clip, the beats, then a closing line for what runs through all of them. 2.5 reads a whole-second timestamp, so segment the beats as ranges (0-3s / 3-7s) over a four-beat spine — opener, development, escalation, resolution — and keep the whole prompt under 500 Chinese characters. Bind assets first (将<图片1>中的[特征]定义为<主体1>) and refer to them afterwards as <主体1>@<图片1>. Reserved characters carry meaning: （）music, <>sound effect, {}spoken line, 【】on-screen caption. One camera move per beat. The trailing switches --rs --dur --cf are weakly validated: a typo is silently ignored. Lock identity, wardrobe and space; never lock the pose.'

/** Reference-to-video variants: the mounted assets ARE the bindings. */
const SEEDANCE_REFERENCE_SUFFIX =
  ' Reference variant: mounted assets are numbered in mount order as <图片1>, <图片2>; bind each before you use it, and give each one job.'

const SEEDANCE_20_REFERENCE_HINT = `${SEEDANCE_20_HINT}${SEEDANCE_REFERENCE_SUFFIX}`
const SEEDANCE_25_REFERENCE_HINT = `${SEEDANCE_25_HINT}${SEEDANCE_REFERENCE_SUFFIX}`

const SEEDANCE_BEST_FOR = [
  'multi-shot',
  'cinematic',
  'native-audio',
  'chinese-prompt',
]

const seedance = (enhanceHint: string): ModelStrength => ({
  bestFor: SEEDANCE_BEST_FOR,
  promptStyle: 'natural-language',
  enhanceHint,
  negativePrompt: 'supported',
})

/* ── Kling ─────────────────────────────────────────────────────────────────
 * https://www.kling.ai/blog/kling-ai-prompt-guide
 */
const KLING_HINT =
  'Kling (fal). Natural-language English in a fixed order: Subject + Action + Scene + Camera + Lighting. Multi-shot lives in one prompt, numbered and comma-joined as "Shot 1, ... Shot 2, ...", each shot carrying its own camera and lighting. A spoken line is written 角色名（语气）: 内容 — speaker, tone in brackets, then the words; five languages and regional accents are supported. negative_prompt is a separate field capped at 2500 characters and takes plain nouns, not sentences. When a voice is already bound to an element, do not describe the timbre again in the prompt: the binding wins and a second description fights it.'

const kling = (): ModelStrength => ({
  bestFor: ['multi-shot', 'dialogue', 'camera-control', 'video-extension'],
  promptStyle: 'natural-language',
  enhanceHint: KLING_HINT,
  negativePrompt: 'supported',
})

/* ── Video: everything else ────────────────────────────────────────────── */

/**
 * https://cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide
 */
const VEO_31_HINT =
  'Veo 3.1 (fal). Structured English from seven blocks: subject, action, scene, camera (shot size, angle, movement), lighting and mood, style or film stock, and audio. Audio is written as SEPARATE sentences — one for ambience, one per sound effect, one per spoken line — because the model splits on sentence boundaries; dialogue goes inside quotation marks: She says, "we should go." The negative prompt takes nouns only: write "cartoon, blur, watermark", never "no cartoon" or "don\'t blur". A negation word is read as its own subject and can summon exactly what it was meant to forbid.'

/**
 * https://help.aliyun.com/zh/model-studio/text-to-video-prompt
 */
const WAN_30_HINT =
  'Wan 3.0 (Alibaba, fal). Structured Chinese lands best. Number the shots as 第1个镜头[0-3秒] / 第2个镜头[3-8秒] — the bracketed range is part of the label, not a note. Inside a shot the order is 主体 + 动作 + 环境 + 运镜 + 光线. A spoken line goes in quotation marks straight after its speaker. Keep the negative prompt under 500 characters. prompt_extend defaults to true and will silently rewrite a short prompt: turn it off when the wording is already exact, or expect embellishment.'

const WAN_30_REFERENCE_HINT = `${WAN_30_HINT} Image- and reference-driven runs: describe ONLY what moves and how the camera moves. Never restate what the reference already shows (face, wardrobe, set) — a restated static element gets redrawn, and the redraw drifts.`

/**
 * https://platform.minimax.io/docs/api-reference/video-generation-t2v
 * ⚠ 括号命令（`[Push in]` 等 15 条）是 Hailuo 2.3 那一代的文档写法，MiniMax
 * **没有**为 H3 记载过它 —— 所以这里的规则是「别依赖它」，不是「它无效」。
 */
const MINIMAX_H3_HINT =
  'MiniMax H3 (video). Plain natural-language sentences in shot order: what is in frame, what moves, how the camera moves, then the light. No tag syntax and no weight brackets. Do not rely on [Push in] style bracket commands — those are documented for the Hailuo 2.3 generation, not for H3, so a bracket here may simply be read as literal text; write the move as a phrase instead ("the camera pushes in slowly"). prompt_optimizer defaults to true and rewrites a thin prompt; switch it off when the wording is deliberate. One subject and one action per sentence.'

const MINIMAX_H3_CN_HINT = `${MINIMAX_H3_HINT} CN station, same model: Chinese works as well as English.`

const MINIMAX_H3_REFERENCE_SUFFIX =
  ' Reference run: the mounted image becomes the first frame, so write motion and camera only.'

/**
 * https://ltx.io/blog/prompting-guide-for-ltx-2
 */
const LTX_23_HINT =
  'LTX-2.3 (fal). English prose in six blocks, under 200 words: shot type, subject and appearance, action, setting, lighting, camera. Longer beats shorter here — a thin prompt gets filled in arbitrarily. It reads sentences: no bracket commands, no weight syntax, no tag lists. Spoken lines go in quotation marks. Three things break it: inner-state labels ("she feels betrayed" — write the physical trace instead), letters you expect rendered as readable text, and over-constraining numbers such as exact degrees, millimetres or frame counts.'

/**
 * 【无官方来源】 — no vendor prompt guide exists for these. The hint states the
 * catalog default and says so, rather than inventing vendor rules.
 */
const GENERIC_VIDEO_HINT =
  'No published prompt guide for this model — the shape below is the catalog default, not vendor guidance, so treat it as a starting point. One plain-language paragraph in a fixed order: subject + action + setting + camera move + lighting. Name the shot size and the angle in standard film terms. One camera move per shot, bound to something that happens rather than to a clock. Write emotion as a physical trace, never as a bare label. Keep on-screen text out of it.'

const GEMINI_OMNI_FLASH_HINT = `${GENERIC_VIDEO_HINT} Google publishes no video-specific guide for this model; its image guidance is the closest source — narrative sentences over attribute lists, and say what should be in frame rather than what should not.`

/* ── Audio ─────────────────────────────────────────────────────────────── */

/**
 * https://docs.fish.audio/developer-guide/core-features/emotions
 */
const FISH_AUDIO_HINT =
  'Fish Audio S2.1 Pro (speech). The prompt IS the spoken script: the exact words, with real punctuation, and nothing else — no stage directions, no visual language. S2 takes free-language cues in [square brackets] (S1\'s fixed 64-tag parenthesis table does not apply here). Put a cue at the START of the sentence it colours and stack at most three across a script: [excited], [whispering], [sad]. A sound-effect cue still needs the matching words after it — [laughing] then "Ha, ha, ha" — or nothing is heard. Multi-speaker is S2-only, marked <|speaker:0|> / <|speaker:1|> at the start of each turn. Fish publishes no per-request character ceiling.'

/**
 * https://elevenlabs.io/docs/best-practices/prompting/eleven-v3
 */
const ELEVENLABS_V3_HINT =
  'ElevenLabs v3 (speech). The prompt IS the spoken script. Delivery comes from inline audio tags in square brackets — [whispers], [laughs], [sighs], [sarcastic] — and the set is open, but every tag must name something AUDIBLE: [standing], [grinning] and [music] do nothing. SSML is not supported: shape pacing with punctuation instead — an ellipsis buys a pause, CAPITALS add emphasis, and real sentence punctuation does more than any tag. Tags only respond while stability sits on Creative or Natural. Dialogue mode caps at 10 voices and 2000 characters; a single v3 request caps at 5000 characters.'

/**
 * https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
 */
const ELEVENLABS_SFX_HINT =
  'ElevenLabs Text to Sound Effects v2. Describe the SOUND, never a picture of it: source, material, space, and mic perspective — "a heavy oak door creaking open in a stone hall, close mic". Sequences are written with plain order words (then, followed by, before) and the whole sequence has to fit duration_seconds, which the API bounds to 0.5-30; leave it unset to let the model choose the length. prompt_influence (0-1, default 0.3) trades literal obedience for musicality. Loops and stingers work here too — name the BPM and the key when you need them. No audio tags, no SSML, no bracket syntax.'

/**
 * https://elevenlabs.io/docs/api-reference/music/compose
 */
const ELEVENLABS_MUSIC_HINT =
  'ElevenLabs Music v2. Answer five questions in the prompt, in this order: genre, mood, instrumentation, tempo (name the BPM), and era or production style. Then say what the track is FOR and how it should move across its length — intro, build, drop, outro — because music_length_ms (3000-600000) is the only structural knob on the plain-prompt path. prompt and composition_plan are mutually exclusive: send a prompt for one-shot generation or a composition_plan for section-by-section control, never both. Say "instrumental" explicitly when you want no vocals; lyrics go in the prompt as the actual lines.'

/**
 * Per-model strengths for every video and audio model in the catalog.
 *
 * ⚠ Keyed by `AI_MODELS`, same shape as `MODEL_STRENGTHS`. The two maps are
 * disjoint by construction — image models there, media models here.
 */
export const MEDIA_MODEL_STRENGTHS: Partial<Record<AI_MODELS, ModelStrength>> =
  {
    // ── Seedance 2.0 — fal ──────────────────────────────────────────────
    [AI_MODELS.SEEDANCE_20]: seedance(SEEDANCE_20_HINT),
    [AI_MODELS.SEEDANCE_20_FAST]: seedance(SEEDANCE_20_HINT),
    [AI_MODELS.SEEDANCE_20_REFERENCE]: seedance(SEEDANCE_20_REFERENCE_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: seedance(
      SEEDANCE_20_REFERENCE_HINT,
    ),
    // ── Seedance 2.0 — VolcEngine ───────────────────────────────────────
    [AI_MODELS.SEEDANCE_20_VOLCENGINE]: seedance(SEEDANCE_20_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: seedance(SEEDANCE_20_HINT),
    [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: seedance(
      SEEDANCE_20_REFERENCE_HINT,
    ),
    [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: seedance(
      SEEDANCE_20_REFERENCE_HINT,
    ),
    // ── Seedance 2.0 — BytePlus ─────────────────────────────────────────
    [AI_MODELS.SEEDANCE_20_BYTEPLUS]: seedance(SEEDANCE_20_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS]: seedance(SEEDANCE_20_HINT),
    [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: seedance(
      SEEDANCE_20_REFERENCE_HINT,
    ),
    [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]: seedance(
      SEEDANCE_20_REFERENCE_HINT,
    ),
    // ── Seedance 2.5 ────────────────────────────────────────────────────
    [AI_MODELS.SEEDANCE_25]: seedance(SEEDANCE_25_HINT),
    [AI_MODELS.SEEDANCE_25_REFERENCE]: seedance(SEEDANCE_25_REFERENCE_HINT),
    [AI_MODELS.SEEDANCE_25_VOLCENGINE]: seedance(SEEDANCE_25_HINT),
    [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: seedance(
      SEEDANCE_25_REFERENCE_HINT,
    ),
    [AI_MODELS.SEEDANCE_25_BYTEPLUS]: seedance(SEEDANCE_25_HINT),
    [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: seedance(
      SEEDANCE_25_REFERENCE_HINT,
    ),
    // ── Kling ───────────────────────────────────────────────────────────
    [AI_MODELS.KLING_V3_PRO]: kling(),
    [AI_MODELS.KLING_O3_PRO]: kling(),
    // ── Veo ─────────────────────────────────────────────────────────────
    [AI_MODELS.VEO_31]: {
      bestFor: ['native-audio', 'dialogue', 'photorealistic', 'cinematic'],
      promptStyle: 'natural-language',
      enhanceHint: VEO_31_HINT,
      negativePrompt: 'nouns-only',
    },
    // ── Wan ─────────────────────────────────────────────────────────────
    [AI_MODELS.WAN_30]: {
      bestFor: ['long-clip', 'chinese-prompt', 'multi-shot', 'budget'],
      promptStyle: 'natural-language',
      enhanceHint: WAN_30_HINT,
      negativePrompt: 'supported',
    },
    [AI_MODELS.WAN_30_REFERENCE]: {
      bestFor: ['reference-driven', 'chinese-prompt', 'character-consistency'],
      promptStyle: 'natural-language',
      enhanceHint: WAN_30_REFERENCE_HINT,
      negativePrompt: 'supported',
    },
    // ── MiniMax H3 ──────────────────────────────────────────────────────
    [AI_MODELS.MINIMAX_H3]: {
      bestFor: ['general', 'motion-quality', 'native-audio'],
      promptStyle: 'natural-language',
      enhanceHint: MINIMAX_H3_HINT,
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.MINIMAX_H3_REFERENCE]: {
      bestFor: ['reference-driven', 'motion-quality', 'native-audio'],
      promptStyle: 'natural-language',
      enhanceHint: `${MINIMAX_H3_HINT}${MINIMAX_H3_REFERENCE_SUFFIX}`,
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.MINIMAX_H3_CN]: {
      bestFor: ['general', 'motion-quality', 'chinese-prompt'],
      promptStyle: 'natural-language',
      enhanceHint: MINIMAX_H3_CN_HINT,
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.MINIMAX_H3_REFERENCE_CN]: {
      bestFor: ['reference-driven', 'motion-quality', 'chinese-prompt'],
      promptStyle: 'natural-language',
      enhanceHint: `${MINIMAX_H3_CN_HINT}${MINIMAX_H3_REFERENCE_SUFFIX}`,
      negativePrompt: 'unsupported',
    },
    // ── LTX ─────────────────────────────────────────────────────────────
    [AI_MODELS.LTX_23]: {
      bestFor: ['budget', 'draft', 'quick-iteration'],
      promptStyle: 'natural-language',
      enhanceHint: LTX_23_HINT,
      // 【未核实】fal 的 ltx-2.3 端点收 negative_prompt；官方写作指南对它只字未提。
      negativePrompt: 'supported',
    },
    // ── 【无官方来源】 ──────────────────────────────────────────────────
    [AI_MODELS.HAPPYHORSE_10]: {
      bestFor: ['general', 'native-audio', 'lip-sync'],
      promptStyle: 'natural-language',
      enhanceHint: GENERIC_VIDEO_HINT,
      // 【未核实】厂商既没有写作指南，也没有公开的 negative 字段。
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.GEMINI_OMNI_FLASH]: {
      bestFor: ['general', 'native-audio', 'instruction-following'],
      promptStyle: 'natural-language',
      enhanceHint: GEMINI_OMNI_FLASH_HINT,
      negativePrompt: 'unsupported',
    },
    // ── Audio ───────────────────────────────────────────────────────────
    [AI_MODELS.FISH_AUDIO_S2_PRO]: {
      bestFor: ['speech', 'voice-clone', 'multi-speaker', 'chinese-speech'],
      promptStyle: 'natural-language',
      enhanceHint: FISH_AUDIO_HINT,
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.ELEVENLABS_V3]: {
      bestFor: ['speech', 'expressive-delivery', 'dialogue'],
      promptStyle: 'natural-language',
      enhanceHint: ELEVENLABS_V3_HINT,
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.ELEVENLABS_SFX_V2]: {
      bestFor: ['sound-effect', 'foley', 'ambience'],
      promptStyle: 'natural-language',
      enhanceHint: ELEVENLABS_SFX_HINT,
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.ELEVENLABS_MUSIC_V2]: {
      bestFor: ['music', 'score', 'loop'],
      promptStyle: 'natural-language',
      enhanceHint: ELEVENLABS_MUSIC_HINT,
      negativePrompt: 'unsupported',
    },
  }

/**
 * Seedance rosters — the two generations read segmentation differently, and
 * everything downstream that has to pick a rule block keys off these.
 */
export const SEEDANCE_20_MODEL_IDS: ReadonlySet<string> = new Set<string>([
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_BYTEPLUS,
  AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
  AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS,
])

export const SEEDANCE_25_MODEL_IDS: ReadonlySet<string> = new Set<string>([
  AI_MODELS.SEEDANCE_25,
  AI_MODELS.SEEDANCE_25_REFERENCE,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_BYTEPLUS,
  AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
])

/** The control-rule block for a Seedance model, or null for anything else. */
export function getSeedanceControlRules(modelId: string): string | null {
  if (SEEDANCE_25_MODEL_IDS.has(modelId)) return SEEDANCE_25_CONTROL_RULES
  if (SEEDANCE_20_MODEL_IDS.has(modelId)) return SEEDANCE_20_CONTROL_RULES
  return null
}
