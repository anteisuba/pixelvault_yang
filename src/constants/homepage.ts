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
  imageEditing: {
    imageCount: HOMEPAGE_MODEL_COUNTS.image,
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

export const HOMEPAGE_MADE_WITH_ANTEI_SECTION_ID = 'imageEditing'

/** Krea-style feature sections — left-image / right-text alternating */
export const HOMEPAGE_FEATURE_SECTIONS = [
  {
    id: HOMEPAGE_MADE_WITH_ANTEI_SECTION_ID,
    ctaHref: ROUTES.STUDIO,
    tone: 'sky',
    reverse: false,
    rhythm: 'feature',
    showEyebrow: true,
    showCta: true,
    // Prompt: a portrait of a young woman on the left + 3 stylised
    // re-renders (Ghibli / oil / watercolor) tiled on the right, soft
    // editorial layout, plenty of negative space, 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'video',
    ctaHref: ROUTES.STUDIO,
    tone: 'forest',
    reverse: true,
    rhythm: 'feature',
    showEyebrow: true,
    showCta: true,
    // Prompt: a film-strip storyboard with 4 cinematic frames of a
    // dragon swooping over mountains, golden-hour lighting, frame
    // numbers along the top, 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'lora',
    ctaHref: ROUTES.STUDIO,
    tone: 'amber',
    reverse: false,
    rhythm: 'feature',
    showEyebrow: false,
    showCta: false,
    // Prompt: a contact sheet of training images on the left + the
    // resulting consistent character on the right, "before / after"
    // label, soft warm light, 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'upscale',
    ctaHref: ROUTES.STUDIO,
    tone: 'dawn',
    reverse: true,
    rhythm: 'feature',
    showEyebrow: false,
    showCta: false,
    // Prompt: a single image split vertically — left half blurry low-res,
    // right half tack-sharp 4× upscale, magnifier loupe over the seam,
    // 16:10.
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

export const HOMEPAGE_CAPABILITY_ITEMS = [
  { id: 'tts', comingSoon: false },
  { id: 'model3d', comingSoon: false },
  { id: 'workflow', comingSoon: true },
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

export type HomepageMadeWithAnteiColumn = 'left' | 'middle' | 'right'
export type HomepageMadeWithAnteiVariant = 'featured' | 'standard' | 'video'

export const HOMEPAGE_MADE_WITH_ANTEI_ITEMS = [
  {
    id: 'storybookForest',
    src: '/showcase/showcase-06.webp',
    model: 'Flux',
    column: 'left',
    variant: 'featured',
  },
  {
    id: 'goldenGlass',
    src: '/showcase/showcase-05.webp',
    model: 'Gemini',
    column: 'left',
    variant: 'standard',
  },
  {
    id: 'quietArchitecture',
    src: '/showcase/showcase-03.webp',
    model: 'Flux',
    column: 'middle',
    variant: 'standard',
  },
  {
    id: 'summerAnime',
    src: '/showcase/showcase-02.webp',
    model: 'Illustrious XL',
    column: 'middle',
    variant: 'standard',
  },
  {
    id: 'atelierRoom',
    src: '/showcase/showcase-08.webp',
    model: 'Flux',
    column: 'middle',
    variant: 'standard',
  },
  {
    id: 'softPortrait',
    src: '/showcase/showcase-01.webp',
    model: 'GPT Image',
    column: 'right',
    variant: 'standard',
  },
  {
    id: 'mangaPanel',
    src: '/showcase/showcase-07.webp',
    model: 'Flux',
    column: 'right',
    variant: 'standard',
  },
  {
    id: 'spaceExplorer',
    src: '/showcase/showcase-04.webp',
    model: 'Gemini',
    column: 'right',
    variant: 'video',
    duration: '0:06',
  },
] as const satisfies ReadonlyArray<{
  id: string
  src: string
  model: string
  column: HomepageMadeWithAnteiColumn
  variant: HomepageMadeWithAnteiVariant
  duration?: string
}>
