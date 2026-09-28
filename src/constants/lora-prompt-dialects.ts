import type { LoraBaseFamily } from '@/constants/lora-base-models'

/**
 * Per-family prompt dialect. One prompt style does not carry across families:
 * Pony collapses without its score prefix, Illustrious/SDXL read that same
 * prefix as noise, and FLUX wants natural-language sentences instead of a
 * Danbooru tag wall.
 *
 * The habits follow what real recipes do: 1,964 community recipes read off
 * Civitai on 2026-09-28 (one family at a time, see lora-assistant §6), plus
 * the model page where the family has one (Anima).
 *
 * Skeleton placeholders: `{trigger}` = the LoRA trigger word, `{subject}` /
 * `{style}` = the user's own content for that branch.
 */
export interface LoraPromptDialect {
  /** One short line naming this family's prompt habits, for the assistant state block. */
  fingerprint: string
  /** The order real recipes put things in — how the assistant writes and reverses a prompt here. */
  order: string
  skeleton: { subject: string; style: string }
  weightedParens: boolean
  /** Tags appended to a source-matched recipe so it keeps the family's look. */
  sourceMatchTags: readonly string[]
  /** Negative tags only a source-matched recipe adds (keeps an anime source from drifting 3D). */
  sourceMatchNegative: readonly string[]
  negative: readonly string[]
  /**
   * The Runner settings real recipes on this family usually use, in the
   * Runner's own sampler / scheduler names. `null` = no Runner base serves
   * this family, so there is nothing to set.
   */
  parameters: string | null
  forbidden: readonly { pattern: RegExp | string; why: string }[]
}

const SCORE_PREFIX_PATTERN = /\bscore_\d(?:_up)?\b/i

/** Pony writes its score tags with `_up`; Anima's own score tags have none. */
const PONY_SCORE_UP_PATTERN = /\bscore_\d_up\b/i

const TAG_ORDER =
  'quality tags → 1girl / 1boy / solo → character (series) → artist / style → appearance → clothing → expression → pose and gaze → framing → background → lighting'

const ANIME_SOURCE_MATCH_TAGS = [
  '2d style',
  'anime illustration',
  'clean lineart',
  'cel shading',
] as const

const ANIME_SOURCE_MATCH_NEGATIVE = [
  '3d',
  '3d render',
  'cgi',
  'blender',
  'realistic',
  'photorealistic',
  'doll',
  'plastic skin',
  'shiny skin',
  'smooth face',
  'game render',
] as const

const SDXL_QUALITY_NEGATIVE = [
  'lowres',
  'worst quality',
  'low quality',
  'jpeg artifacts',
  'bad anatomy',
  'bad hands',
  'watermark',
  'signature',
] as const

const SDXL_FORBIDDEN = [
  {
    pattern: SCORE_PREFIX_PATTERN,
    why: 'score_9 / score_8_up prefixes are a Pony convention; other SDXL families read them as noise.',
  },
] as const

const SDXL_DIALECT: LoraPromptDialect = {
  fingerprint:
    'Danbooru tags, quality tags first, (tag:1.2) weighting, no score prefix',
  order: TAG_ORDER,
  skeleton: {
    subject:
      'masterpiece, best quality, {trigger}, {subject}, portrait, dynamic pose, soft cinematic lighting',
    style:
      'masterpiece, best quality, {trigger}, {style}, beautiful scenery, soft cinematic lighting, highly detailed',
  },
  weightedParens: true,
  sourceMatchTags: ANIME_SOURCE_MATCH_TAGS,
  sourceMatchNegative: ANIME_SOURCE_MATCH_NEGATIVE,
  negative: SDXL_QUALITY_NEGATIVE,
  parameters:
    'euler_ancestral (or dpmpp_2m + karras), 25–30 steps, CFG 5 (4–7), 832×1216 portrait or 1024×1024 square',
  forbidden: SDXL_FORBIDDEN,
}

/**
 * Plain SDXL 1.0 is not trained on Danbooru tags: real recipes on it split
 * between tag walls (anime fine-tunes) and a descriptive sentence (photos).
 */
const SDXL_BASE_DIALECT: LoraPromptDialect = {
  ...SDXL_DIALECT,
  fingerprint:
    'Danbooru tags for anime; for a photo a short descriptive sentence, then detail tags; (tag:1.2) weighting, no score prefix',
  order: `photo: "photo of …" sentence → subject and appearance → clothing → action → scene → light → 8k, highly detailed, sharp focus; anime: ${TAG_ORDER}`,
  parameters:
    'dpmpp_2m + karras (or euler_ancestral), 30 steps, CFG 5–7, 832×1216 portrait or 1024×1024 square',
}

export const LORA_PROMPT_DIALECTS: Record<LoraBaseFamily, LoraPromptDialect> = {
  flux: {
    fingerprint:
      'natural language in a few full sentences, no tag wall, no parenthesis weighting, no negative',
    order:
      'character trigger → medium and shot → subject and clothing → action and expression → scene → light and mood; a style trigger goes last',
    skeleton: {
      subject:
        '{trigger}, a photograph of {subject}, natural pose, soft cinematic lighting, richly detailed',
      style:
        '{trigger}, a wide scenic view rendered in {style}, soft cinematic lighting, richly detailed',
    },
    weightedParens: false,
    sourceMatchTags: [],
    sourceMatchNegative: [],
    // FLUX.1-dev runs on distilled guidance, where a negative prompt does nothing.
    negative: [],
    parameters: null,
    forbidden: [
      {
        pattern: SCORE_PREFIX_PATTERN,
        why: 'score_9 / score_8_up prefixes are a Pony convention and do nothing on FLUX.',
      },
      {
        pattern: /\b(?:1girl|1boy|2girls|2boys|solo focus)\b/i,
        why: 'FLUX follows natural-language sentences; a Danbooru tag wall degrades prompt adherence.',
      },
      {
        pattern: /\([^)]*:\s*\d/,
        why: 'FLUX does not honour (tag:1.2) parenthesis weighting.',
      },
    ],
  },
  sdxl: SDXL_BASE_DIALECT,
  illustrious: SDXL_DIALECT,
  pony: {
    fingerprint: 'Danbooru tags, score prefix first and required',
    order:
      'score_9, score_8_up, score_7_up → source_anime (anime only) → 1girl / solo → character → appearance → clothing → expression → framing and pose → lighting → background',
    skeleton: {
      subject:
        'score_9, score_8_up, score_7_up, {trigger}, {subject}, portrait, dynamic pose, soft cinematic lighting',
      style:
        'score_9, score_8_up, score_7_up, {trigger}, {style}, beautiful scenery, soft cinematic lighting, highly detailed',
    },
    weightedParens: true,
    sourceMatchTags: ANIME_SOURCE_MATCH_TAGS,
    sourceMatchNegative: ANIME_SOURCE_MATCH_NEGATIVE,
    negative: ['score_6', 'score_5', 'score_4', ...SDXL_QUALITY_NEGATIVE],
    parameters:
      'euler_ancestral (or dpmpp_2m + karras), 25–30 steps, CFG 7 (4–7), 832×1216 portrait',
    forbidden: [],
  },
  sd15: {
    ...SDXL_DIALECT,
    sourceMatchTags: [],
    sourceMatchNegative: [],
    parameters: null,
    forbidden: [],
  },
  anima: SDXL_DIALECT,
  // The model page (Civitai 2458426) sets these habits: its own score_N tags,
  // `@` before an artist, weighting that needs more than SDXL's 1.2.
  'anima-dit': {
    fingerprint:
      'Danbooru tags in lowercase with spaces, quality tags first with score_N (no _up), @ before an artist name, (tag:1.3) to (tag:2) weighting — higher than on SDXL',
    order:
      'quality / year / safety tags → 1girl / 1boy → character → series → @artist → everything else; one or two plain sentences may follow the tags',
    skeleton: {
      subject:
        'masterpiece, best quality, score_7, safe, {trigger}, {subject}, portrait, dynamic pose, soft cinematic lighting',
      style:
        'masterpiece, best quality, score_7, safe, {trigger}, {style}, beautiful scenery, soft cinematic lighting, highly detailed',
    },
    weightedParens: true,
    sourceMatchTags: ANIME_SOURCE_MATCH_TAGS,
    sourceMatchNegative: ANIME_SOURCE_MATCH_NEGATIVE,
    negative: [
      'worst quality',
      'low quality',
      'score_1',
      'score_2',
      'score_3',
      'artist name',
      'blurry',
      'jpeg artifacts',
    ],
    parameters:
      'er_sde + simple (or euler_ancestral), 28–30 steps, CFG 4–5, 832×1216 portrait',
    forbidden: [
      {
        pattern: PONY_SCORE_UP_PATTERN,
        why: 'score_8_up is Pony syntax; Anima writes its score tags without _up (score_9, score_8, score_7).',
      },
    ],
  },
}

export function findForbiddenDialectHits(
  family: LoraBaseFamily,
  text: string,
): { pattern: string; why: string }[] {
  const dialect = LORA_PROMPT_DIALECTS[family]
  const hits: { pattern: string; why: string }[] = []

  for (const rule of dialect.forbidden) {
    const matched =
      typeof rule.pattern === 'string'
        ? text.toLowerCase().includes(rule.pattern.toLowerCase())
        : rule.pattern.test(text)
    if (!matched) continue
    hits.push({ pattern: String(rule.pattern), why: rule.why })
  }

  return hits
}
