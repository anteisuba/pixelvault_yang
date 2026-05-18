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

export const MULTI_VIEW_NEGATIVE =
  'new character, different identity, different outfit, changed pose, changed action, different art style, forced full body, extra body parts, multiple subjects, watermark, text, label, caption'

/**
 * View-conversion prompts for reference-edit multi-view generation.
 * Each entry tells a reference-aware image model "render the same subject
 * from a different angle." These prompts preserve the source pose, styling,
 * outfit, and crop instead of forcing a 3D-ready full-body turnaround sheet.
 */
export const MULTI_VIEW_PROMPTS = {
  front:
    'Same subject, exact identity, front view. Preserve the original action, pose, art style, character identity, face, hair, clothing, accessories, expression, lighting, background tone, crop, and composition as closely as possible. Only align the camera to the front view. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  back: 'Same subject, exact identity, back view (180 degrees rotated). Preserve the original action, pose, art style, character identity, hair, clothing, accessories, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to show the back. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  left: 'Same subject, exact identity, left side view (90 degrees rotated counter-clockwise). Preserve the original action, pose, art style, character identity, face profile, hair, clothing, accessories, expression, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to show the left side. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  right:
    'Same subject, exact identity, right side view (90 degrees rotated clockwise). Preserve the original action, pose, art style, character identity, face profile, hair, clothing, accessories, expression, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to show the right side. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
} as const

export type MultiViewAngle = keyof typeof MULTI_VIEW_PROMPTS

/** The three angles we generate from a front-facing source image. */
export const GENERATED_VIEW_ANGLES: ReadonlyArray<
  Exclude<MultiViewAngle, 'front'>
> = ['back', 'left', 'right']
