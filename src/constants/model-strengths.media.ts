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
 * 2.0 cuts on the 镜头N label and ignores seconds; 2.5 reads whole-second
 * timestamps. owner 09-24: write both (镜头1（0-3秒）) — the label does the
 * cutting on 2.0, the range is for the reader.
 * Asset tokens differ by channel: fal documents @Image1 / @Video1 / @Audio1
 * (fal schema `image_urls` description); Ark (VolcEngine / BytePlus) writes
 * 图片1 / 视频1 / 音频1. The keyframe id carries the reference syntax too:
 * mounting a reference switches the send to the reference endpoint.
 * 【】 is the on-screen caption mark, so section names are written plainly.
 */
const SEEDANCE_COMMON =
  "Order: one global line (medium, palette, light, the character's look, and any exclusions as plain constraints such as 纯净画面，无字幕无文字), then asset bindings, then the shots, then one sound line. Write section names plainly (全局设定：) — never inside 【】 or <>. Reserved characters: （）music, <>sound effect, {}spoken line, 【】on-screen caption. One camera move per shot. There is no negative field. Keep it under 500 Chinese characters. Lock identity, wardrobe and space; never the pose."

const SEEDANCE_20_TIMELINE =
  'Label shots 镜头1（0-3秒）/ 镜头2（3-5秒）: 2.0 cuts on the 镜头N label and ignores the seconds, which are there for the reader.'

const SEEDANCE_25_TIMELINE =
  'Label shots 镜头1（0-3秒）/ 镜头2（3-7秒）: 2.5 reads the whole-second timestamp, so the ranges really cut; up to 30 seconds over a four-beat spine.'

const SEEDANCE_FAL_ASSETS =
  'Mounted assets are @Image1, @Image2… / @Video1 / @Audio1, each counted in mount order. Bind before use — 将@Image1中的红发女孩定义为林夏，@Audio1是林夏的声音 — then call her by the name, and give every asset one job.'

const SEEDANCE_ARK_ASSETS =
  'Mounted assets are 图片1, 图片2… / 视频1 / 音频1, each counted in mount order. Bind before use — 将图片1中的红发女孩定义为林夏，音频1是林夏的声音 — then call her by the name, and give every asset one job.'

const SEEDANCE_20_FAL_HINT = `Seedance 2.0 (ByteDance, fal). ${SEEDANCE_20_TIMELINE} ${SEEDANCE_COMMON} ${SEEDANCE_FAL_ASSETS}`
const SEEDANCE_20_ARK_HINT = `Seedance 2.0 (ByteDance, Ark). ${SEEDANCE_20_TIMELINE} ${SEEDANCE_COMMON} ${SEEDANCE_ARK_ASSETS}`
const SEEDANCE_25_FAL_HINT = `Seedance 2.5 (ByteDance, fal). ${SEEDANCE_25_TIMELINE} ${SEEDANCE_COMMON} ${SEEDANCE_FAL_ASSETS}`
const SEEDANCE_25_ARK_HINT = `Seedance 2.5 (ByteDance, Ark). ${SEEDANCE_25_TIMELINE} ${SEEDANCE_COMMON} ${SEEDANCE_ARK_ASSETS}`

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
  negativePrompt: 'unsupported',
})

/* ── Kling ─────────────────────────────────────────────────────────────────
 * https://kling.ai/quickstart/klingai-video-3-model-user-guide
 * https://blog.fal.ai/kling-3-0-prompting-guide/ · fal OpenAPI (v3 / o3 pro)
 * Kling says outright there is no fixed formula. V3 Pro has negative_prompt;
 * O3 Pro has none (no cfg_scale either).
 */
const KLING_BASE_HINT =
  'Kling (fal). Chinese or English prose with no fixed order — cover subject, action, scene, camera and light. Multi-shot lives in one prompt as "Shot 1 (3s): … Shot 2 (2s): …", shots separated by full stops, at most six, the seconds adding up to the clip length. Dialogue: [Name, voice]: "line" — the action first, then the line; keep English lines lowercase apart from names. The prompt is capped at 2500 characters.'

const KLING_HINT = `${KLING_BASE_HINT} negative_prompt is a separate field (also 2500 characters) for what to keep out.`

/** O3 Pro t2v / i2v（fal 一手 schema）：没有 negative_prompt，也没有 elements。 */
const KLING_O3_HINT = `${KLING_BASE_HINT} There is no negative_prompt field, so exclusions go into the prompt as what should be there instead.`

const kling = (): ModelStrength => ({
  bestFor: ['multi-shot', 'dialogue', 'camera-control', 'video-extension'],
  promptStyle: 'natural-language',
  enhanceHint: KLING_HINT,
  negativePrompt: 'supported',
})

const klingO3 = (): ModelStrength => ({
  ...kling(),
  enhanceHint: KLING_O3_HINT,
  negativePrompt: 'unsupported',
})

/**
 * Kling O3 video-to-video/edit。fal schema 原文：prompt 里用 `@Video1` 指代输入
 * 视频，`@Image1..` 指代可选参考图，`@Element1..` 指代元素。
 */
const KLING_VIDEO_EDIT_HINT =
  'Kling O3 video-to-video edit (fal). The input clip is addressed in the prompt as @Video1, optional style references as @Image1..@Image4, optional elements as @Element1..; a prompt that never names @Video1 has no subject to edit. Write the edit as an instruction, not as a fresh scene description: say what changes and, just as explicitly, what must stay — camera motion, framing, pose, timing and scene layout are preserved only when the prompt says so. Duration, resolution and aspect ratio follow the input clip and cannot be requested. Audio is governed by keep_audio, not by the prompt. The prompt is capped at 2500 characters.'

const klingVideoEdit = (): ModelStrength => ({
  bestFor: ['camera-control', 'multi-shot'],
  promptStyle: 'natural-language',
  enhanceHint: KLING_VIDEO_EDIT_HINT,
  // 端点没有 negative_prompt 字段（一手 OpenAPI 核过）。
  negativePrompt: 'unsupported',
})

/* ── Video: everything else ────────────────────────────────────────────── */

/**
 * https://cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide
 */
const VEO_31_HINT =
  'Veo 3.1 (fal). Structured English from seven blocks: subject, action, scene, camera (shot size, angle, movement), lighting and mood, style or film stock, and audio. Audio is written as SEPARATE sentences — one for ambience, one per sound effect, one per spoken line — because the model splits on sentence boundaries; dialogue goes inside quotation marks: She says, "we should go." The negative prompt takes nouns only: write "cartoon, blur, watermark", never "no cartoon" or "don\'t blur". A negation word is read as its own subject and can summon exactly what it was meant to forbid.'

/**
 * https://help.aliyun.com/zh/model-studio/wan3-video-generation-prompt-guide
 * fal OpenAPI (alibaba/wan-3.0/*): no negative_prompt on any endpoint;
 * `enable_prompt_expansion` defaults on and fal warns that turning it off
 * degrades quality. 500 characters was the 2.7 negative cap — not 3.0.
 */
const WAN_30_HINT =
  'Wan 3.0 (Alibaba, fal). Chinese or English. Open with one line of theme, style and mood. Shots: 第1个镜头[0-3秒] then shot size and camera, subject, setting, motion, light; ranges contiguous, 2–5 seconds each; for one continuous take write 生成单镜头. Dialogue: 角色说："…"; voiceover 画外音："…". Write 无台词 and 无bgm when there should be none — otherwise the model adds its own. Sound effects as their own sentences. There is no negative field: end with 负向清单：不要… . Avoid high-frequency motion. enable_prompt_expansion is on; leave it on. Mounted assets are 图1 / 视频1 / 音频1, counted per type in mount order — say each one\'s job (图1的女孩是主角), use 音色参考音频1 once for a voice and add 口型同步 for lip sync, and restate a referenced character\'s key traits when she reappears.'

/**
 * https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md
 * https://platform.minimax.io/docs/api-reference/video-generation-v2-create
 * The official rewriter emits three English sections; that is the format the
 * model is fed. H3 has no prompt_optimizer (that was v1 Hailuo) and no
 * negative field. First/last frames and references never mix in one request.
 */
const MINIMAX_H3_HINT =
  'MiniMax H3. Three labelled English sections. integrated_multimodal_description: "[Shot 1]" style and framing, subject, action, camera as an in-sentence phrase ("the camera pushes in slowly"); later shots open "[Shot 2] At 00:03.000, the camera cuts to …". Speakers get a fixed id: The young woman (S1) says: <d>[Chinese]原文</d>. On-screen text verbatim in double quotes. overall_soundscape: 1–4 sentences of ambience and action sounds. non_diegetic_music: instruments and tempo, or N/A. Sound is always generated — describe it or it invents murmur. No negative field: state exclusions as sentences. 4–15 s, ≤7000 characters. Mounted assets are Image 1 / Video 1 / Audio 1, counted per type in mount order; give each a job (Image 1: the woman; Audio 1: her voice). First/last frames and references never mix.'

const MINIMAX_H3_CN_HINT = `${MINIMAX_H3_HINT} CN station: same format — section text in English, spoken lines in their original language.`

/**
 * https://ltx.io/blog/ltx-2-3-prompt-guide · fal OpenAPI (no negative_prompt)
 */
const LTX_23_HINT =
  'LTX-2.3 (fal). One flowing English paragraph, action first, about 200 words, covering the establishing shot, setting, action, characters, camera and sound. Cuts are written inline ("Cut to a side view"). Dialogue in quotation marks, split into short phrases with delivery cues between them. Image-to-video: describe only the motion. Avoid emotion labels (write the physical trace), readable on-screen text, exact numbers, and conflicting light sources. There is no negative field.'

/**
 * https://fal.ai/learn/tools/prompting-happy-horse
 */
const HAPPYHORSE_HINT =
  'HappyHorse (Alibaba, fal). Short English prose — roughly 20–60 words: subject, action, setting, time, and one camera cue last; longer prompts make faces, hands and gait drift. Several beats become a short shot list with times: Shot 1 (0-2s): … Shot 2 (2-5s): … . Dialogue sits inside the narration: her voice low and steady: "…". It generates sound on its own; there is no audio switch and no negative field. The first frame is the mounted image: describe only what moves.'

/**
 * https://ai.google.dev/gemini-api/docs/omni
 */
const GEMINI_OMNI_FLASH_HINT =
  'Gemini Omni Flash (Google). English is the only evaluated language. Prose covering camera, action, movement, light and sound. It cuts scenes on its own: write "In a single continuous shot" / "No scene cuts" for one take; time beats with [0-3s] … [3-6s] … . Reference images are <IMAGE_REF_0>, <IMAGE_REF_1>… counted from 0 in mount order — the workbench\'s 图片1 is <IMAGE_REF_0>; first and last frames are <FIRST_FRAME> / <LAST_FRAME>. Sound in plain sentences (Sound design: …). No negative field: say it in the text ("No dialogue").'

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
    [AI_MODELS.SEEDANCE_20]: seedance(SEEDANCE_20_FAL_HINT),
    [AI_MODELS.SEEDANCE_20_FAST]: seedance(SEEDANCE_20_FAL_HINT),
    [AI_MODELS.SEEDANCE_20_REFERENCE]: seedance(SEEDANCE_20_FAL_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: seedance(SEEDANCE_20_FAL_HINT),
    // ── Seedance 2.0 — VolcEngine ───────────────────────────────────────
    [AI_MODELS.SEEDANCE_20_VOLCENGINE]: seedance(SEEDANCE_20_ARK_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: seedance(SEEDANCE_20_ARK_HINT),
    [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]:
      seedance(SEEDANCE_20_ARK_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]:
      seedance(SEEDANCE_20_ARK_HINT),
    // ── Seedance 2.0 — BytePlus ─────────────────────────────────────────
    [AI_MODELS.SEEDANCE_20_BYTEPLUS]: seedance(SEEDANCE_20_ARK_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS]: seedance(SEEDANCE_20_ARK_HINT),
    [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: seedance(SEEDANCE_20_ARK_HINT),
    [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]:
      seedance(SEEDANCE_20_ARK_HINT),
    // ── Seedance 2.5 ────────────────────────────────────────────────────
    [AI_MODELS.SEEDANCE_25]: seedance(SEEDANCE_25_FAL_HINT),
    [AI_MODELS.SEEDANCE_25_REFERENCE]: seedance(SEEDANCE_25_FAL_HINT),
    [AI_MODELS.SEEDANCE_25_VOLCENGINE]: seedance(SEEDANCE_25_ARK_HINT),
    [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]:
      seedance(SEEDANCE_25_ARK_HINT),
    [AI_MODELS.SEEDANCE_25_BYTEPLUS]: seedance(SEEDANCE_25_ARK_HINT),
    [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: seedance(SEEDANCE_25_ARK_HINT),
    // ── Kling ───────────────────────────────────────────────────────────
    [AI_MODELS.KLING_V3_PRO]: kling(),
    [AI_MODELS.KLING_O3_PRO]: klingO3(),
    // 视频编辑端点：改写的是**已有的那段镜头**，方言与生成端不同 —— 说清楚改
    // 什么、保留什么，而不是从头描述一个画面。
    [AI_MODELS.KLING_O3_STANDARD_V2V_EDIT]: klingVideoEdit(),
    [AI_MODELS.KLING_O3_PRO_V2V_EDIT]: klingVideoEdit(),
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
      negativePrompt: 'unsupported',
    },
    [AI_MODELS.WAN_30_REFERENCE]: {
      bestFor: ['reference-driven', 'chinese-prompt', 'character-consistency'],
      promptStyle: 'natural-language',
      enhanceHint: WAN_30_HINT,
      negativePrompt: 'unsupported',
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
      enhanceHint: MINIMAX_H3_HINT,
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
      enhanceHint: MINIMAX_H3_CN_HINT,
      negativePrompt: 'unsupported',
    },
    // ── LTX ─────────────────────────────────────────────────────────────
    [AI_MODELS.LTX_23]: {
      bestFor: ['budget', 'draft', 'quick-iteration'],
      promptStyle: 'natural-language',
      enhanceHint: LTX_23_HINT,
      negativePrompt: 'unsupported',
    },
    // ── HappyHorse / Gemini Omni ────────────────────────────────────────
    [AI_MODELS.HAPPYHORSE_10]: {
      bestFor: ['general', 'native-audio', 'lip-sync'],
      promptStyle: 'natural-language',
      enhanceHint: HAPPYHORSE_HINT,
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
    [AI_MODELS.FISH_AUDIO_S2_PRO_FREE]: {
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
