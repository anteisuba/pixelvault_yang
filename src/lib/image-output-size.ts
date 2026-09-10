/** Map the wire aspect ratio to a gpt-image supported size. */
export function aspectRatioToOpenAISize(aspectRatio: string): {
  size: string
  width: number
  height: number
} {
  switch (aspectRatio) {
    case '16:9':
    case '4:3':
      return { size: '1536x1024', width: 1536, height: 1024 }
    case '9:16':
    case '3:4':
      return { size: '1024x1536', width: 1024, height: 1536 }
    default:
      return { size: '1024x1024', width: 1024, height: 1024 }
  }
}

/** width:height ratio parts for the five wire aspect ratios. */
export const IMAGE_ASPECT_RATIO_PARTS: Record<string, [number, number]> = {
  '1:1': [1, 1],
  '16:9': [16, 9],
  '9:16': [9, 16],
  '4:3': [4, 3],
  '3:4': [3, 4],
}

export type ImageResolutionTier = '1K' | '2K' | '4K'

export function isImageResolutionTier(
  value: string,
): value is ImageResolutionTier {
  return value === '1K' || value === '2K' || value === '4K'
}

interface TieredDimensionConstraints {
  /** Target total pixel count for this tier (before rounding/clamping). */
  targetPixels: number
  /** Round both edges to a multiple of this (default: 1, i.e. no rounding). */
  edgeStep?: number
  minEdge?: number
  maxEdge?: number
  minTotalPixels?: number
  maxTotalPixels?: number
}

/**
 * Derives width/height for a (aspectRatio, resolution tier) pair from a
 * target pixel budget rather than a hand-typed size table — the providers
 * below each impose different edge/total-pixel constraints (see call
 * sites), so the numbers are computed to satisfy them instead of guessed.
 */
export function computeTieredDimensions(
  aspectRatio: string,
  {
    targetPixels,
    edgeStep = 1,
    minEdge = 0,
    maxEdge = Infinity,
    minTotalPixels = 0,
    maxTotalPixels = Infinity,
  }: TieredDimensionConstraints,
): { width: number; height: number } {
  const [rw, rh] = IMAGE_ASPECT_RATIO_PARTS[aspectRatio] ?? [1, 1]
  const roundToStep = (value: number) =>
    Math.max(edgeStep, Math.round(value / edgeStep) * edgeStep)

  let rawWidth = Math.sqrt((targetPixels * rw) / rh)
  let rawHeight = targetPixels / rawWidth

  // Scale both edges together when either is outside [minEdge, maxEdge] so
  // the requested aspect ratio survives the clamp. Clamping width and
  // height independently could cap only the overflowing edge and leave the
  // other alone — e.g. a 16:9 request whose ideal width exceeded maxEdge
  // came out looking like ~4:3 once width alone got capped.
  const longEdge = Math.max(rawWidth, rawHeight)
  const shortEdge = Math.min(rawWidth, rawHeight)
  if (longEdge > maxEdge) {
    const scale = maxEdge / longEdge
    rawWidth *= scale
    rawHeight *= scale
  } else if (shortEdge < minEdge) {
    const scale = minEdge / shortEdge
    rawWidth *= scale
    rawHeight *= scale
  }

  let width = roundToStep(rawWidth)
  let height = roundToStep(rawHeight)

  // Safety net in case edge-step rounding pushed a value just past its
  // bound (only reachable if maxEdge/minEdge isn't an exact multiple of
  // edgeStep).
  width = Math.min(Math.max(width, minEdge), maxEdge)
  height = Math.min(Math.max(height, minEdge), maxEdge)

  while (width * height > maxTotalPixels && height > edgeStep) {
    height -= edgeStep
  }
  while (width * height < minTotalPixels) {
    height += edgeStep
  }

  return { width, height }
}

const OPENAI_SIZE_EDGE_STEP = 16
const OPENAI_SIZE_MAX_EDGE = 3840
const OPENAI_SIZE_MIN_TOTAL_PIXELS = 655_360
const OPENAI_SIZE_MAX_TOTAL_PIXELS = 8_294_400
// gpt-image-2 accepts any size satisfying: edges are multiples of 16, long
// edge <= 3840, and total pixels within [655_360, 8_294_400] — there is no
// fixed enum, so tiers are pixel budgets rather than literal size strings.
const OPENAI_RESOLUTION_TARGET_PIXELS: Record<ImageResolutionTier, number> = {
  '1K': 1024 * 1024,
  '2K': 2048 * 2048,
  // True 4K (3840x3840-class) exceeds the API's total-pixel ceiling for
  // near-square ratios, so the tier targets the ceiling itself — this still
  // yields the exact standard 3840x2160 for 16:9.
  '4K': OPENAI_SIZE_MAX_TOTAL_PIXELS,
}

/** Resolution-tier-aware gpt-image size, only used once the user picks a tier. */
export function tieredOpenAISize(
  aspectRatio: string,
  tier: ImageResolutionTier,
): { size: string; width: number; height: number } {
  const { width, height } = computeTieredDimensions(aspectRatio, {
    targetPixels: OPENAI_RESOLUTION_TARGET_PIXELS[tier],
    edgeStep: OPENAI_SIZE_EDGE_STEP,
    maxEdge: OPENAI_SIZE_MAX_EDGE,
    minTotalPixels: OPENAI_SIZE_MIN_TOTAL_PIXELS,
    maxTotalPixels: OPENAI_SIZE_MAX_TOTAL_PIXELS,
  })
  return { size: `${width}x${height}`, width, height }
}
