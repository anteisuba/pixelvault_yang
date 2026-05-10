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
  STUDIO_EDIT: '/studio/edit',
  STUDIO_ENHANCE: '/studio/enhance',
  STUDIO_ANALYZE: '/studio/analyze',
  STUDIO_LORA: '/studio/lora',
  STUDIO_NODE: '/studio/node',
  /** Krea-style Asset browser — superset of the legacy /profile feed */
  ASSETS: '/assets',
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

/** Type for all route values */
export type Route = (typeof ROUTES)[keyof typeof ROUTES]
