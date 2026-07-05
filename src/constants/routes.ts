/**
 * Application route definitions
 *
 * All page paths should reference these constants instead of hardcoded strings.
 */

export const ROUTES = {
  /** Public pages */
  HOME: '/',
  GALLERY: '/gallery',

  /** Legal / display-surface pages */
  PRIVACY: '/privacy',
  TERMS: '/terms',

  /** Auth pages */
  SIGN_IN: '/sign-in',
  SIGN_UP: '/sign-up',

  /** Protected pages */
  STUDIO: '/studio',
  STUDIO_IMAGE: '/studio/image',
  STUDIO_VIDEO: '/studio/video',
  STUDIO_AUDIO: '/studio/audio',
  STUDIO_3D: '/studio/3d',
  STUDIO_EDIT: '/studio/edit',
  STUDIO_ENHANCE: '/studio/enhance',
  STUDIO_ANALYZE: '/studio/analyze',
  STUDIO_LORA: '/studio/lora',
  STUDIO_NODE: '/studio/node',
  /** Krea-style private asset browser */
  ASSETS: '/assets',
  CARDS: '/cards',
  PROMPTS: '/prompts',
  ARENA: '/arena',
  ARENA_LEADERBOARD: '/arena/leaderboard',
  ARENA_HISTORY: '/arena/history',
  STORYBOARD: '/storyboard',

  /** Creator profile (public) */
  CREATOR_PROFILE: '/u',

  /** Collections */
  COLLECTIONS: '/collections',
} as const

/** Build a creator profile URL from username */
export function creatorProfilePath(username: string): string {
  return `${ROUTES.CREATOR_PROFILE}/${encodeURIComponent(username)}`
}

/** Build a gallery detail URL from a generation ID */
export function galleryGenerationPath(id: string): string {
  return `${ROUTES.GALLERY}/${encodeURIComponent(id)}`
}

/** Build an asset browser deep link that opens a generation detail panel */
export function assetGenerationPath(id: string): string {
  return `${ROUTES.ASSETS}?generationId=${encodeURIComponent(id)}`
}

export interface PromptCreatePathOptions {
  name?: string
  prompt?: string
  negativePrompt?: string | null
  modelId?: string
  provider?: string
  outputType?: string
  generationId?: string
}

export const CARD_MANAGEMENT_TABS = [
  'characters',
  'styles',
  'backgrounds',
] as const

export type CardManagementTab = (typeof CARD_MANAGEMENT_TABS)[number]

export interface CardManagementPathOptions {
  tab?: CardManagementTab
}

/** Build a Cards management URL with an optional active tab. */
export function cardManagementPath(
  options: CardManagementPathOptions = {},
): string {
  if (!options.tab) return ROUTES.CARDS
  const params = new URLSearchParams({ tab: options.tab })
  return `${ROUTES.CARDS}?${params.toString()}`
}

/** Build a prompt library URL with the create panel prefilled */
export function promptCreatePath(
  options: PromptCreatePathOptions = {},
): string {
  const params = new URLSearchParams({ create: '1' })
  if (options.name) params.set('name', options.name)
  if (options.prompt) params.set('prompt', options.prompt)
  if (options.negativePrompt)
    params.set('negativePrompt', options.negativePrompt)
  if (options.modelId) params.set('model', options.modelId)
  if (options.provider) params.set('provider', options.provider)
  if (options.outputType) params.set('outputType', options.outputType)
  if (options.generationId) params.set('generationId', options.generationId)
  return `${ROUTES.PROMPTS}?${params.toString()}`
}

export interface StudioImageEditPathOptions {
  generationId?: string
  sourceUrl?: string
  width?: number | null
  height?: number | null
}

/** Build a Studio image editor URL with an optional source image preloaded. */
export function studioImageEditPath(
  options: StudioImageEditPathOptions = {},
): string {
  const params = new URLSearchParams()
  if (options.generationId) params.set('generationId', options.generationId)
  if (options.sourceUrl) params.set('sourceUrl', options.sourceUrl)
  if (options.width) params.set('width', String(options.width))
  if (options.height) params.set('height', String(options.height))
  const query = params.toString()
  return query ? `${ROUTES.STUDIO_EDIT}?${query}` : ROUTES.STUDIO_EDIT
}

/** Type for all route values */
export type Route = (typeof ROUTES)[keyof typeof ROUTES]
