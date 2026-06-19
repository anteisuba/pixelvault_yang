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

export const HOMEPAGE_MODEL_COUNT_VALUES: Record<string, number> = {
  count: HOMEPAGE_MODEL_COUNTS.total,
  imageCount: HOMEPAGE_MODEL_COUNTS.image,
  videoCount: HOMEPAGE_MODEL_COUNTS.video,
  audioCount: HOMEPAGE_MODEL_COUNTS.audio,
  model3dCount: HOMEPAGE_MODEL_COUNTS.model3d,
}

export const HOMEPAGE_MODEL_GROUP_PREVIEW_COUNT = 4

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
  [AI_MODELS.RECRAFT_V4_PRO]: { amount: 0.06, unit: 'image' },
  [AI_MODELS.SEEDREAM_45]: { amount: 0.04, unit: 'image' },
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

export const HOMEPAGE_FEATURE_TRANSLATION_VALUES: Record<
  string,
  Record<string, number>
> = {
  image: {
    count: HOMEPAGE_MODEL_COUNTS.image,
  },
  video: {
    count: HOMEPAGE_MODEL_COUNTS.video,
  },
  tts: {
    count: HOMEPAGE_MODEL_COUNTS.audio,
  },
  model3d: {
    count: HOMEPAGE_MODEL_COUNTS.model3d,
  },
}

export const HOMEPAGE_METADATA = {
  title: 'PixelVault | Personal AI Gallery',
  description:
    'Generate with multiple AI image models, then archive every result in one personal gallery.',
} as const

export const HOMEPAGE_ROUTES = {
  home: ROUTES.HOME,
  gallery: ROUTES.GALLERY,
  signIn: ROUTES.SIGN_IN,
  signUp: ROUTES.SIGN_UP,
  studio: ROUTES.STUDIO,
  models: '#models',
  pricing: '#models',
  docs: '/docs',
} as const

/**
 * Optional media shown inside each feature section's media tile.
 *
 * - `image` files live in `public/homepage/<id>.webp` (16:10, ≥1600px wide).
 *   Run Gemini 3 Pro Image or GPT-Image-2 with the prompt next to each
 *   section below, export to webp, drop in `public/homepage/`.
 * - `video` files live in `public/homepage/<id>.mp4` (h264, ≤2 MB, ≤8 s
 *   loop, muted, optionally with a `<id>-poster.webp` first-frame poster).
 *
 * When `media` is omitted, the section keeps the existing gradient tile,
 * so sections can ship images incrementally.
 */
export type HomepageFeatureMedia =
  | { type: 'image'; src: string; alt: string }
  | { type: 'video'; src: string; poster?: string; alt: string }

export type HomepageFeatureRhythm = 'feature' | 'compact'

/**
 * Feature sections — left-image / right-text, alternating. Covers the six
 * real product pillars; 图片生成 + 画布 carry the `feature` rhythm (large),
 * the rest are `compact`. The two big rows sit at positions 1 and 4 so the
 * page breathes instead of front-loading both.
 *
 * `id: 'workflow'` is the **画布 / canvas** feature — it reuses the existing
 * node-graph fallback renderer and `featureSections.workflow` / `mediaLabels.
 * workflow` i18n keys, and links to the live canvas route.
 */
export const HOMEPAGE_FEATURE_SECTIONS = [
  {
    id: 'image',
    ctaHref: ROUTES.STUDIO,
    tone: 'dawn',
    reverse: false,
    rhythm: 'feature',
    showEyebrow: true,
    showCta: true,
    // Multi-model contact sheet: one prompt across Flux / Gemini / GPT Image
    // / NovelAI, each tile chipped with its model name, full colour.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'video',
    ctaHref: ROUTES.STUDIO,
    tone: 'forest',
    reverse: true,
    rhythm: 'compact',
    showEyebrow: true,
    showCta: true,
    // Film-strip storyboard, 4 cinematic frames with frame numbers.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'tts',
    ctaHref: ROUTES.STUDIO,
    tone: 'sky',
    reverse: false,
    rhythm: 'compact',
    showEyebrow: true,
    showCta: true,
    // SVG TTS player (HomepageTtsPlayer) — pure renderer, no asset.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'workflow',
    ctaHref: ROUTES.STUDIO_NODE,
    tone: 'ink',
    reverse: true,
    rhythm: 'feature',
    showEyebrow: true,
    showCta: true,
    // Canvas node-graph: 剧本 → (图像, 音频) → 视频 — the autospawn shape.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'lora',
    ctaHref: ROUTES.STUDIO,
    tone: 'amber',
    reverse: false,
    rhythm: 'compact',
    showEyebrow: true,
    showCta: true,
    // Contact sheet of reference images + the consistent result.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'model3d',
    ctaHref: ROUTES.STUDIO,
    tone: 'earth',
    reverse: true,
    rhythm: 'compact',
    showEyebrow: true,
    showCta: true,
    // Turntable: a saved image lifted onto a 360° 3D stage.
    media: undefined as HomepageFeatureMedia | undefined,
  },
] as const satisfies ReadonlyArray<{
  id: string
  ctaHref: string
  tone: string
  reverse: boolean
  rhythm: HomepageFeatureRhythm
  showEyebrow: boolean
  showCta: boolean
  comingSoon?: boolean
  media: HomepageFeatureMedia | undefined
}>

export type HomepageFeatureSectionTone =
  (typeof HOMEPAGE_FEATURE_SECTIONS)[number]['tone']

// tts / model3d / workflow were promoted to full feature sections above, so
// the capability strip now carries only the platform layer (compare / archive
// / share) — no duplicate rendering of the same i18n keys.
export const HOMEPAGE_CAPABILITY_ITEMS = [
  { id: 'arena', comingSoon: false },
  { id: 'archive', comingSoon: false },
  { id: 'social', comingSoon: false },
] as const satisfies ReadonlyArray<{
  id: string
  comingSoon: boolean
}>

/** Showcase images for hero + gallery preview */
export const HOMEPAGE_SHOWCASE = [
  {
    id: 'sdxlRealism',
    src: '/showcase/showcase-01.webp',
    model: 'GPT Image',
    tone: 'dawn',
  },
  {
    id: 'animagineAnime',
    src: '/showcase/showcase-02.webp',
    model: 'NovelAI',
    tone: 'forest',
  },
  {
    id: 'geminiConcept',
    src: '/showcase/showcase-03.webp',
    model: 'Gemini',
    tone: 'ink',
  },
  {
    id: 'dalleCreative',
    src: '/showcase/showcase-04.webp',
    model: 'GPT Image',
    tone: 'sky',
  },
  {
    id: 'fluxPro',
    src: '/showcase/showcase-05.webp',
    model: 'Flux',
    tone: 'amber',
  },
  {
    id: 'novelaiIllust',
    src: '/showcase/showcase-06.webp',
    model: 'NovelAI',
    tone: 'earth',
  },
  {
    id: 'showcase07',
    src: '/showcase/showcase-07.webp',
    model: 'Flux',
    tone: 'sky',
  },
  {
    id: 'showcase08',
    src: '/showcase/showcase-08.webp',
    model: 'Gemini',
    tone: 'ink',
  },
] as const

/**
 * Image set for the hero "darkroom window" wall. Deliberately disjoint from
 * the Made-with-ANTEI gallery below (which uses `/showcase/*`) so the hero
 * reads as an ambient backdrop instead of duplicating the gallery's pieces.
 * Pulls from the diverse `archive` set plus two stylized edits — none of which
 * appear in the adjacent gallery.
 */
export const HOMEPAGE_HERO_WALL = [
  { id: 'heroPortrait', src: '/homepage/archive/portrait.webp' },
  { id: 'heroLandscape', src: '/homepage/archive/landscape.webp' },
  { id: 'heroAnimal', src: '/homepage/archive/animal.webp' },
  { id: 'heroConcept', src: '/homepage/archive/concept.webp' },
  { id: 'heroStillLife', src: '/homepage/archive/stilllife.webp' },
  { id: 'heroAbstract', src: '/homepage/archive/abstract.webp' },
  { id: 'heroGhibli', src: '/homepage/imageEditing/02-ghibli.webp' },
  { id: 'heroWatercolor', src: '/homepage/imageEditing/04-watercolor.webp' },
] as const
