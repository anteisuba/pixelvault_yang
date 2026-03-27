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
  PROFILE: '/profile',
  ARENA: '/arena',
  ARENA_LEADERBOARD: '/arena/leaderboard',
  ARENA_HISTORY: '/arena/history',
  STORYBOARD: '/storyboard',

  /** Creator profile (public) */
  CREATOR_PROFILE: '/u',
} as const

/** Build a creator profile URL from username */
export function creatorProfilePath(username: string): string {
  return `${ROUTES.CREATOR_PROFILE}/${encodeURIComponent(username)}`
}

/** Type for all route values */
export type Route = (typeof ROUTES)[keyof typeof ROUTES]
