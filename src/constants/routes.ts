/**
 * Application route definitions
 *
 * All page paths should reference these constants instead of hardcoded strings.
 */

export const ROUTES = {
  /** Public pages */
  HOME: '/',
  GALLERY: '/gallery',

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
  /** Krea-style Asset browser — superset of the legacy /profile feed */
  ASSETS: '/assets',
  CARDS: '/cards',
  PROMPTS: '/prompts',
  PROFILE: '/profile',
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

/** Type for all route values */
export type Route = (typeof ROUTES)[keyof typeof ROUTES]
