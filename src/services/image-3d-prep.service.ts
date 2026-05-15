import 'server-only'

import { randomUUID } from 'crypto'

import sharp from 'sharp'

import { logger } from '@/lib/logger'
import { upscaleImage } from '@/services/image-edit.service'
import { fetchAsBuffer, uploadToR2 } from '@/services/storage/r2'

/**
 * Image-to-3D recommends ≥1024px on the long edge. Below that, geometry
 * detail degrades visibly. We upscale (4x via Aura SR) when smaller.
 */
const MIN_LONG_EDGE_PX = 1024

interface Prepare3DSourceParams {
  imageUrl: string
  userId: string
  /** fal.ai API key — required for the upscale step. */
  falApiKey: string
}

/**
 * "3D-friendly" preprocessing applied just before handing an image to
 * Hunyuan3D / TripoSR. Two steps, each independently skippable on failure:
 *
 *   1. Upscale (Aura SR 4x) if the long edge is < 1024px.
 *   2. White-pad to square (1:1) if aspect ratio is non-square — the 3D
 *      models bake the input frame into the canonical view, so a 16:9
 *      input squashes the subject's reconstruction. Padding with white
 *      preserves the silhouette without cropping.
 *
 * The result is uploaded under `prep/{userId}/{uuid}.png` and a public R2
 * URL is returned. If both steps are no-ops (image already large enough
 * and square), returns the original URL unchanged. If anything throws,
 * we log a warning and fall back to the original URL — prep is an
 * optimization, not a gate.
 *
 * No Generation row is created; these are transient assets, not user
 * artifacts. R2 lifecycle policy can sweep the `prep/` prefix later.
 */
export async function prepare3DSourceImage(
  params: Prepare3DSourceParams,
): Promise<string> {
  const { imageUrl, userId, falApiKey } = params

  try {
    const fetched = await fetchAsBuffer(imageUrl)
    let workingBuffer: Buffer = fetched.buffer
    let workingMime: string = fetched.mimeType
    let workingUrl: string = imageUrl
    let mutated = false

    const meta = await sharp(workingBuffer).metadata()
    const w0 = meta.width ?? 0
    const h0 = meta.height ?? 0

    // ── Step 1: upscale small inputs ───────────────────────────────
    if (w0 > 0 && h0 > 0 && Math.max(w0, h0) < MIN_LONG_EDGE_PX) {
      try {
        const upscaled = await upscaleImage(workingUrl, falApiKey)
        workingUrl = upscaled.imageUrl
        const refetched = await fetchAsBuffer(upscaled.imageUrl)
        workingBuffer = refetched.buffer
        workingMime = refetched.mimeType
        mutated = true
        logger.info('3D prep: upscaled source', {
          from: `${w0}x${h0}`,
          to: `${upscaled.width}x${upscaled.height}`,
        })
      } catch (err) {
        logger.warn('3D prep: upscale failed, keeping original size', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // ── Step 2: white-pad to square ────────────────────────────────
    const meta2 = await sharp(workingBuffer).metadata()
    const w = meta2.width ?? 0
    const h = meta2.height ?? 0
    if (w > 0 && h > 0 && w !== h) {
      const side = Math.max(w, h)
      const padX = Math.floor((side - w) / 2)
      const padY = Math.floor((side - h) / 2)
      workingBuffer = await sharp(workingBuffer)
        .extend({
          top: padY,
          bottom: side - h - padY,
          left: padX,
          right: side - w - padX,
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .png()
        .toBuffer()
      workingMime = 'image/png'
      mutated = true
      logger.info('3D prep: padded to square', { from: `${w}x${h}`, to: side })
    }

    if (!mutated) return imageUrl

    const key = `prep/${userId}/${randomUUID()}.png`
    const publicUrl = await uploadToR2({
      data: workingBuffer,
      key,
      mimeType: workingMime,
    })
    return publicUrl
  } catch (err) {
    logger.warn('3D prep: failed, falling back to original image', {
      imageUrl,
      error: err instanceof Error ? err.message : String(err),
    })
    return imageUrl
  }
}
