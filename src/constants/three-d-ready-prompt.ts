/**
 * Prompt constants for 3D-adjacent image work.
 *
 * For image-to-3D the source needs: centered subject, clean background,
 * neutral pose, even soft lighting, sharp silhouette. The negative below
 * encodes the inverse (motion blur / bokeh / harsh shadow / complex bg)
 * and is reused across every reference-edit call we make when prepping
 * an image for 3D.
 */

export const THREE_D_READY_NEGATIVE =
  'motion blur, bokeh, harsh shadow, complex background, cropped, low angle, high angle, dutch tilt, occlusion, multiple subjects, watermark, text'

/**
 * View-conversion prompts for reference-edit multi-view generation.
 * Each entry tells a reference-aware image model "render the same subject
 * from a different angle." Identity preservation is enforced by the
 * reference image itself — the prompt only describes the camera change.
 */
export const MULTI_VIEW_PROMPTS = {
  front:
    'Same subject, exact identity, front view, eye-level orthographic camera, centered, plain white background, even soft lighting, sharp silhouette, no shadow, full body visible',
  back: 'Same subject, exact identity, back view (180 degrees rotated), eye-level orthographic camera, centered, plain white background, even soft lighting, sharp silhouette, no shadow, full body visible',
  left: 'Same subject, exact identity, left side view (90 degrees rotated counter-clockwise), eye-level orthographic camera, centered, plain white background, even soft lighting, sharp silhouette, no shadow, full body visible',
  right:
    'Same subject, exact identity, right side view (90 degrees rotated clockwise), eye-level orthographic camera, centered, plain white background, even soft lighting, sharp silhouette, no shadow, full body visible',
} as const

export type MultiViewAngle = keyof typeof MULTI_VIEW_PROMPTS

/** The three angles we generate from a front-facing source image. */
export const GENERATED_VIEW_ANGLES: ReadonlyArray<
  Exclude<MultiViewAngle, 'front'>
> = ['back', 'left', 'right']
