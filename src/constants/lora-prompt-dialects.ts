import type { LoraBaseFamily } from '@/constants/lora-base-models'

/**
 * Per-family prompt dialect. One prompt style does not carry across families:
 * Pony collapses without its score prefix, Illustrious/SDXL read that same
 * prefix as noise, and FLUX wants a natural-language sentence instead of a
 * Danbooru tag wall.
 *
 * Skeleton placeholders: `{trigger}` = the LoRA trigger word, `{subject}` /
 * `{style}` = the user's own content for that branch.
 */
export interface LoraPromptDialect {
  skeleton: { subject: string; style: string }
  weightedParens: boolean
  negative: readonly string[]
  forbidden: readonly { pattern: RegExp | string; why: string }[]
}

const SCORE_PREFIX_PATTERN = /\bscore_\d(?:_up)?\b/i

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
  skeleton: {
    subject:
      '{trigger}, {subject}, portrait, dynamic pose, soft cinematic lighting, masterpiece, best quality',
    style:
      '{trigger}, {style}, beautiful scenery, soft cinematic lighting, highly detailed, masterpiece, best quality',
  },
  weightedParens: true,
  negative: SDXL_QUALITY_NEGATIVE,
  forbidden: SDXL_FORBIDDEN,
}

export const LORA_PROMPT_DIALECTS: Record<LoraBaseFamily, LoraPromptDialect> = {
  flux: {
    skeleton: {
      subject:
        '{trigger}, a photograph of {subject}, natural pose, soft cinematic lighting, richly detailed',
      style:
        '{trigger}, a wide scenic view rendered in {style}, soft cinematic lighting, richly detailed',
    },
    weightedParens: false,
    negative: ['blurry', 'lowres', 'watermark'],
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
  sdxl: SDXL_DIALECT,
  illustrious: SDXL_DIALECT,
  pony: {
    skeleton: {
      subject:
        'score_9, score_8_up, score_7_up, {trigger}, {subject}, portrait, dynamic pose, soft cinematic lighting',
      style:
        'score_9, score_8_up, score_7_up, {trigger}, {style}, beautiful scenery, soft cinematic lighting, highly detailed',
    },
    weightedParens: true,
    negative: SDXL_QUALITY_NEGATIVE,
    forbidden: [],
  },
  sd15: { ...SDXL_DIALECT, forbidden: [] },
  anima: SDXL_DIALECT,
  'anima-dit': {
    skeleton: {
      subject:
        '{trigger}, {subject}, portrait, dynamic pose, soft cinematic lighting',
      style:
        '{trigger}, {style}, beautiful scenery, soft cinematic lighting, highly detailed',
    },
    weightedParens: false,
    negative: ['blurry', 'lowres', 'worst quality', 'watermark'],
    forbidden: [
      {
        pattern: SCORE_PREFIX_PATTERN,
        why: 'Anima DiT is not Anima Pencil XL and not Pony; the score prefix belongs to neither workflow.',
      },
      {
        pattern: /\([^)]*:\s*\d/,
        why: 'The Anima / Qwen-Image workflow does not honour (tag:1.2) parenthesis weighting.',
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
