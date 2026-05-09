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

/** Krea-style feature sections — left-image / right-text alternating */
export const HOMEPAGE_FEATURE_SECTIONS = [
  {
    id: 'imageEditing',
    ctaHref: ROUTES.STUDIO,
    tone: 'sky',
    reverse: false,
  },
  {
    id: 'video',
    ctaHref: ROUTES.STUDIO,
    tone: 'forest',
    reverse: true,
  },
  {
    id: 'lora',
    ctaHref: ROUTES.STUDIO,
    tone: 'amber',
    reverse: false,
  },
  {
    id: 'upscale',
    ctaHref: ROUTES.STUDIO,
    tone: 'dawn',
    reverse: true,
  },
  {
    id: 'tts',
    ctaHref: ROUTES.STUDIO,
    tone: 'ink',
    reverse: false,
  },
  {
    id: 'workflow',
    ctaHref: ROUTES.STUDIO,
    tone: 'forest',
    reverse: true,
    comingSoon: true,
  },
  {
    id: 'arena',
    ctaHref: ROUTES.ARENA,
    tone: 'amber',
    reverse: false,
  },
  {
    id: 'archive',
    ctaHref: ROUTES.GALLERY,
    tone: 'earth',
    reverse: true,
  },
  {
    id: 'social',
    ctaHref: ROUTES.GALLERY,
    tone: 'sky',
    reverse: false,
  },
] as const

export type HomepageFeatureSectionTone =
  (typeof HOMEPAGE_FEATURE_SECTIONS)[number]['tone']

/** Showcase images for hero + gallery preview */
export const HOMEPAGE_SHOWCASE = [
  {
    id: 'sdxlRealism',
    src: '/showcase/showcase-01.svg',
    model: 'SDXL',
    tone: 'dawn',
  },
  {
    id: 'animagineAnime',
    src: '/showcase/showcase-02.svg',
    model: 'Animagine',
    tone: 'forest',
  },
  {
    id: 'geminiConcept',
    src: '/showcase/showcase-03.svg',
    model: 'Gemini',
    tone: 'ink',
  },
  {
    id: 'dalleCreative',
    src: '/showcase/showcase-04.svg',
    model: 'DALL-E',
    tone: 'sky',
  },
  {
    id: 'fluxPro',
    src: '/showcase/showcase-05.svg',
    model: 'Flux',
    tone: 'amber',
  },
  {
    id: 'novelaiIllust',
    src: '/showcase/showcase-06.svg',
    model: 'NovelAI',
    tone: 'earth',
  },
] as const
