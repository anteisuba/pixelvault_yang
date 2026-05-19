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
  'new character, different identity, different outfit, changed pose, changed action, different hand position, different finger placement, changed hairstyle, changed proportions, different art style, forced full body, extra body parts, dramatic lighting change, perspective distortion, new accessories, multiple subjects, watermark, text, label, caption'

/**
 * View-conversion prompts for reference-edit multi-view generation.
 * Each entry tells a reference-aware image model "render the same subject
 * from a different angle." These prompts preserve the source pose, styling,
 * outfit, and crop instead of forcing a 3D-ready full-body turnaround sheet.
 *
 * `hand pose, finger placement, body proportions` are explicitly listed in
 * every prompt — these are the most common drift vectors that hurt Hunyuan3D
 * reconstruction fidelity (interlocking fingers in particular destroy mesh
 * quality, and proportion drift produces wrong silhouettes for the back/side
 * views the 3D model relies on).
 */
export const MULTI_VIEW_PROMPTS = {
  front:
    'Same subject, exact identity, front view. Preserve the original action, pose, art style, character identity, face, hair, clothing, accessories, hand pose, finger placement, body proportions, expression, lighting, background tone, crop, and composition as closely as possible. Only align the camera to the front view. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  back: 'Same subject, exact identity, back view (180 degrees rotated). Preserve the original action, pose, art style, character identity, hair, clothing, accessories, hand pose, finger placement, body proportions, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to show the back. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  left: 'Same subject, exact identity, left side view (90 degrees rotated counter-clockwise). Preserve the original action, pose, art style, character identity, face profile, hair, clothing, accessories, hand pose, finger placement, body proportions, expression, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to show the left side. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  right:
    'Same subject, exact identity, right side view (90 degrees rotated clockwise). Preserve the original action, pose, art style, character identity, face profile, hair, clothing, accessories, hand pose, finger placement, body proportions, expression, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to show the right side. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  leftFront:
    'Same subject, exact identity, left-front 45-degree view (camera rotated 45 degrees counter-clockwise from the front). Preserve the original action, pose, art style, character identity, face, hair, clothing, accessories, hand pose, finger placement, body proportions, expression, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to a 45-degree diagonal. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
  rightFront:
    'Same subject, exact identity, right-front 45-degree view (camera rotated 45 degrees clockwise from the front). Preserve the original action, pose, art style, character identity, face, hair, clothing, accessories, hand pose, finger placement, body proportions, expression, lighting, background tone, crop, and composition as closely as possible. Only change the camera angle to a 45-degree diagonal. Keep the same framing as the reference; do not force a full-body view if the reference is half-body.',
} as const

export type MultiViewAngle = keyof typeof MULTI_VIEW_PROMPTS

/**
 * Non-front angles auto-rendered to feed Hunyuan3D v3.1 Pro multi-view.
 *
 * Kept at the three orthogonal angles (back/left/right). The 45° diagonal
 * variants are still in `MULTI_VIEW_PROMPTS` and wired through the fal
 * adapter for manual uploads, but we don't generate them automatically:
 * the open-weights image-edit models we run multi-view through (OpenAI
 * GPT Image 2, Gemini Flash Image) don't reliably interpret "rotate 45
 * degrees" prompts, and the resulting drift on diagonals damages Hunyuan's
 * geometry reconstruction more than the extra view helps.
 */
export const GENERATED_VIEW_ANGLES: ReadonlyArray<
  Exclude<MultiViewAngle, 'front'>
> = ['back', 'left', 'right']
