import { AI_MODELS } from '@/constants/models'
import { ROUTES } from '@/constants/routes'

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
  workflow: '#workflow',
  models: '#models',
} as const

export const HOMEPAGE_NAVIGATION = [
  { id: 'image', href: '#imageEditing' },
  { id: 'video', href: '#video' },
  { id: 'lora', href: '#lora' },
  { id: 'audio', href: '#tts' },
  { id: 'model3d', href: '#model3d' },
  { id: 'arena', href: ROUTES.ARENA },
  { id: 'gallery', href: HOMEPAGE_ROUTES.gallery },
] as const

export const HOMEPAGE_FEATURES = [
  {
    id: 'chooseEngine',
    icon: 'sparkles',
  },
  {
    id: 'keepEveryKeeper',
    icon: 'archive',
  },
  {
    id: 'requestUsage',
    icon: 'shield',
  },
] as const

export type HomepageFeatureIcon = (typeof HOMEPAGE_FEATURES)[number]['icon']

export const HOMEPAGE_WORKFLOW = [
  {
    id: 'frameIdea',
    step: '01',
  },
  {
    id: 'generateWithIntent',
    step: '02',
  },
  {
    id: 'archiveWinners',
    step: '03',
  },
] as const

export const HOMEPAGE_SCENES = [
  {
    id: 'sdxlRealism',
    tone: 'dawn',
    modelId: AI_MODELS.SDXL,
  },
  {
    id: 'animagineAnime',
    tone: 'forest',
    modelId: AI_MODELS.ANIMAGINE_XL_4,
  },
  {
    id: 'geminiConcept',
    tone: 'ink',
    modelId: AI_MODELS.GEMINI_FLASH_IMAGE,
  },
] as const

export type HomepageSceneTone = (typeof HOMEPAGE_SCENES)[number]['tone']

export const HOMEPAGE_COMPARISON = [
  { id: 'byok', icon: 'key' },
  { id: 'archive', icon: 'archive' },
  { id: 'arena', icon: 'swords' },
] as const

export type HomepageComparisonIcon =
  (typeof HOMEPAGE_COMPARISON)[number]['icon']

/** Merged Features + Comparison for the unified "Why PixelVault" section */
export const HOMEPAGE_VALUE_PROPS = [
  { id: 'chooseEngine', icon: 'sparkles' },
  { id: 'keepEveryKeeper', icon: 'archive' },
  { id: 'requestUsage', icon: 'shield' },
  { id: 'byok', icon: 'key' },
  { id: 'permanentArchive', icon: 'database' },
  { id: 'arena', icon: 'swords' },
] as const

export type HomepageValuePropIcon =
  (typeof HOMEPAGE_VALUE_PROPS)[number]['icon']

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

/** Krea-style feature sections — left-image / right-text alternating */
export const HOMEPAGE_FEATURE_SECTIONS = [
  {
    id: 'imageEditing',
    ctaHref: ROUTES.STUDIO,
    tone: 'sky',
    reverse: false,
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
    // Prompt: a single image split vertically — left half blurry low-res,
    // right half tack-sharp 4× upscale, magnifier loupe over the seam,
    // 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'tts',
    ctaHref: ROUTES.STUDIO,
    tone: 'ink',
    reverse: false,
    // Prompt: a sound-wave ribbon flowing across the frame with a
    // floating speech bubble of multilingual text, dark ink palette,
    // 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'model3d',
    ctaHref: ROUTES.STUDIO_3D,
    tone: 'forest',
    reverse: true,
    // Prompt: a single anime character on the left morphing into a
    // rotating 3D mesh on the right, white studio background, soft
    // turntable lighting, 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'workflow',
    ctaHref: ROUTES.STUDIO,
    tone: 'forest',
    reverse: false,
    comingSoon: true,
    // VIDEO. Prompt for Veo 3.1 / Seedance 2.0: a node-based visual
    // workflow editor; mouse drags a connection between an "image gen"
    // node and an "upscale" node, then a "deploy" button pulses and
    // turns green. 6–8s loop, no audio.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'arena',
    ctaHref: ROUTES.ARENA,
    tone: 'amber',
    reverse: true,
    // Prompt: four AI portraits in a 2x2 grid, one tagged with a glowing
    // "winner" ribbon and a small ELO scoreboard in the corner, 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'archive',
    ctaHref: ROUTES.GALLERY,
    tone: 'earth',
    reverse: false,
    // Prompt: a vast wall of generation thumbnails fading into the
    // distance, a timeline ribbon along the bottom, earthy palette,
    // 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
  {
    id: 'social',
    ctaHref: ROUTES.GALLERY,
    tone: 'sky',
    reverse: true,
    // Prompt: three artwork cards stacked at gentle angles with avatars,
    // like counts, and a "follow" badge, soft sky-blue background,
    // 16:10.
    media: undefined as HomepageFeatureMedia | undefined,
  },
] as const satisfies ReadonlyArray<{
  id: string
  ctaHref: string
  tone: string
  reverse: boolean
  comingSoon?: boolean
  media: HomepageFeatureMedia | undefined
}>

export type HomepageFeatureSectionTone =
  (typeof HOMEPAGE_FEATURE_SECTIONS)[number]['tone']

/** Showcase images for hero + gallery preview */
export const HOMEPAGE_SHOWCASE = [
  {
    id: 'sdxlRealism',
    src: '/showcase/showcase-01.webp',
    model: 'SDXL',
    tone: 'dawn',
  },
  {
    id: 'animagineAnime',
    src: '/showcase/showcase-02.webp',
    model: 'Animagine',
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
    model: 'DALL-E',
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
] as const
