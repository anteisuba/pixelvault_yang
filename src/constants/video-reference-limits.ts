/**
 * Request-level ceilings for video-generation reference payloads.
 *
 * Per-model capabilities may be lower, but no UI or schema may allow more
 * than these values. Seedance 2.5 currently reaches both ceilings.
 */
export const VIDEO_REFERENCE_LIMITS = {
  IMAGES: 30,
  AUDIO: 10,
} as const
