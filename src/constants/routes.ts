/**
 * Application route definitions
 *
 * All page paths should reference these constants instead of hardcoded strings.
 */

export const ROUTES = {
  /** Public pages */
  HOME: "/",
  GALLERY: "/gallery",

  /** Auth pages */
  SIGN_IN: "/sign-in",
  SIGN_UP: "/sign-up",

  /** Protected pages */
  STUDIO: "/studio",
  PROFILE: "/profile",
  CREDITS: "/credits",
} as const;

/** Type for all route values */
export type Route = (typeof ROUTES)[keyof typeof ROUTES];
