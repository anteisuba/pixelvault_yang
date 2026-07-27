import { AI_MODELS, getAvailableModels } from '@/constants/models'
import { ROUTES } from '@/constants/routes'
import type { OutputType } from '@/types'

const AVAILABLE_HOMEPAGE_MODELS = getAvailableModels()

function countAvailableModels(outputType: OutputType): number {
  return AVAILABLE_HOMEPAGE_MODELS.filter(
    (model) => model.outputType === outputType,
  ).length
}

export const HOMEPAGE_MODEL_COUNTS = {
  total: AVAILABLE_HOMEPAGE_MODELS.length,
  image: countAvailableModels('IMAGE'),
  video: countAvailableModels('VIDEO'),
  audio: countAvailableModels('AUDIO'),
  model3d: countAvailableModels('MODEL_3D'),
} as const

export type HomepageModelPricingUnit = 'image' | 'second' | 'kchars'

export interface HomepageModelReferencePrice {
  amount: number
  unit: HomepageModelPricingUnit
}

/**
 * Best-effort USD reference prices shown on the public homepage. These are
 * display-only and intentionally separate from server-owned credit policy.
 */
export const HOMEPAGE_MODEL_REFERENCE_PRICES: Partial<
  Record<AI_MODELS, HomepageModelReferencePrice>
> = {
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.GEMINI_PRO_IMAGE]: { amount: 0.039, unit: 'image' },
  [AI_MODELS.GEMINI_FLASH_IMAGE]: { amount: 0.039, unit: 'image' },
  [AI_MODELS.FLUX_2_PRO]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.FLUX_2_FLASH]: { amount: 0.005, unit: 'image' },
  [AI_MODELS.FLUX_KONTEXT_MAX]: { amount: 0.08, unit: 'image' },
  [AI_MODELS.IDEOGRAM_3]: { amount: 0.06, unit: 'image' },
  [AI_MODELS.RECRAFT_V4_PRO]: { amount: 0.21, unit: 'image' },
  [AI_MODELS.SEEDREAM_45]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.SEEDREAM_50_PRO]: { amount: 0.0675, unit: 'image' },
  [AI_MODELS.SEEDREAM_50_LITE]: { amount: 0.035, unit: 'image' },
  [AI_MODELS.NOVELAI_V45_FULL]: { amount: 0.012, unit: 'image' },
  [AI_MODELS.NOVELAI_V45_CURATED]: { amount: 0.012, unit: 'image' },
  [AI_MODELS.ILLUSTRIOUS_XL]: { amount: 0.003, unit: 'image' },
  [AI_MODELS.KLING_V3_PRO]: { amount: 0.3, unit: 'second' },
  [AI_MODELS.VEO_31]: { amount: 0.2, unit: 'second' },
  [AI_MODELS.SEEDANCE_20]: { amount: 0.1, unit: 'second' },
  [AI_MODELS.SEEDANCE_20_FAST]: { amount: 0.06, unit: 'second' },
  [AI_MODELS.SEEDANCE_20_REFERENCE]: { amount: 0.1, unit: 'second' },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: { amount: 0.06, unit: 'second' },
  [AI_MODELS.HAPPYHORSE_10]: { amount: 0.14, unit: 'second' },
  [AI_MODELS.LTX_23]: { amount: 0.06, unit: 'second' },
  [AI_MODELS.FISH_AUDIO_S2_PRO]: { amount: 0.2, unit: 'kchars' },
}

export function formatHomepageReferencePriceAmount(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`
  if (amount >= 0.01) return `$${amount.toFixed(2)}`
  return `$${amount.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
}

export const HOMEPAGE_METADATA = {
  title: 'PixelVault | Personal AI Gallery',
  description:
    'Generate with multiple AI image models, then archive every result in one personal gallery.',
} as const

/** `models` / `pricing` are gone with the v2 nav — v3 has no in-page anchors. */
export const HOMEPAGE_ROUTES = {
  home: ROUTES.HOME,
  gallery: ROUTES.GALLERY,
  signIn: ROUTES.SIGN_IN,
  signUp: ROUTES.SIGN_UP,
  studio: ROUTES.STUDIO,
} as const

/* ── v3 marketing home (see docs/references/pages/home.md §A) ────────────── */

/**
 * The strip directly under the v3 headline. Real archive results, not art
 * direction: the page carries no brand colour of its own, so every colour on
 * the first screen comes from these. Ten is the desktop count; narrower
 * viewports hide the tail (see `home-v3.css`).
 */
export const HOME_V3_STRIP = [
  {
    id: 'stripLunaMoth',
    src: '/homepage/production/hero/hero-01-luna-moth.webp',
  },
  {
    id: 'stripDesertObservatory',
    src: '/homepage/production/hero/hero-02-desert-observatory.webp',
  },
  {
    id: 'stripBlackClay',
    src: '/homepage/production/hero/hero-03-black-clay.webp',
  },
  {
    id: 'stripRisographLaundry',
    src: '/homepage/production/hero/hero-04-risograph-laundry.webp',
  },
  {
    id: 'stripFrostFlower',
    src: '/homepage/production/hero/hero-05-frost-flower.webp',
  },
  {
    id: 'stripWatchRobot',
    src: '/homepage/production/hero/hero-06-watch-robot.webp',
  },
  {
    id: 'stripSnowTrain',
    src: '/homepage/production/hero/hero-07-snow-train.webp',
  },
  {
    id: 'stripGlacialRiver',
    src: '/homepage/production/hero/hero-08-glacial-river.webp',
  },
  {
    id: 'stripRubyChair',
    src: '/homepage/production/hero/hero-09-ruby-chair.webp',
  },
  {
    id: 'stripCenoteDiver',
    src: '/homepage/production/hero/hero-10-cenote-diver.webp',
  },
] as const

/**
 * Provider wordmarks for the marquee that closes the first screen. Plain text
 * on purpose — logo files would be the second visual system on a page whose
 * whole premise is that typography is the only one.
 */
export const HOME_V3_PROVIDERS = [
  'OpenAI',
  'Google Gemini',
  'fal.ai',
  'NovelAI',
  'ByteDance Seedream',
  'ElevenLabs',
  'Fish Audio',
  'Replicate',
  'Hyper3D Rodin',
  'Runway',
  'Black Forest Labs',
  'Hugging Face',
] as const

/** Footer link columns. `items` keys resolve under `Homepage.foot.cols.*`. */
export const HOME_V3_FOOTER_COLS = [
  {
    id: 'product',
    hrefs: [
      ROUTES.STUDIO_NODE,
      ROUTES.STUDIO,
      ROUTES.STUDIO,
      ROUTES.ASSETS,
      ROUTES.GALLERY,
    ],
  },
  { id: 'resources', hrefs: ['#', '#', '#', '#'] },
  { id: 'company', hrefs: ['#', '#', '#'] },
] as const
