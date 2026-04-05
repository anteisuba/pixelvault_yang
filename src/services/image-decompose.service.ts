import 'server-only'

import { Client, handle_file } from '@gradio/client'

import { withRetry } from '@/lib/with-retry'
import { logger } from '@/lib/logger'
import { ProviderError } from '@/services/providers/types'
import {
  fetchAsBuffer,
  uploadToR2,
  generateStorageKey,
} from '@/services/storage/r2'
import { createGeneration } from '@/services/generation.service'
import type {
  DecomposedLayer,
  ImageDecomposeResult,
  GenerationRecord,
} from '@/types'

// ─── HuggingFace Spaces config ──────────────────────────────────

const SEE_THROUGH_SPACE = 'xiuruisu/see-through'

// ─── Types for Gradio response ──────────────────────────────────

interface GradioFileData {
  path: string
  url: string
  orig_name?: string
}

interface GradioGalleryItem {
  image: GradioFileData
  caption: string | null
}

/**
 * Decompose an anime illustration into semantic layers using See-Through (HF Spaces).
 *
 * Calls the Gradio `/predict` endpoint with the image, resolution, and seed.
 * Persists all layer PNGs + PSD to R2 so URLs remain accessible.
 */
export async function decomposeImage(
  imageUrl: string,
  userId: string,
  resolution: number = 1280,
  seed: number = 42,
  hfToken?: string,
): Promise<ImageDecomposeResult> {
  logger.info('[image-decompose] Starting decomposition', {
    imageUrl: imageUrl.slice(0, 80),
    resolution,
    seed,
  })

  let result
  try {
    result = await withRetry(
      async () => {
        const client = await Client.connect(SEE_THROUGH_SPACE, {
          token: (hfToken as `hf_${string}`) ?? undefined,
        })

        // Convert data URLs to Blob (Gradio can't handle data: URIs directly)
        let imageInput: ReturnType<typeof handle_file>
        if (imageUrl.startsWith('data:')) {
          const res = await fetch(imageUrl)
          const blob = await res.blob()
          imageInput = handle_file(blob)
        } else {
          imageInput = handle_file(imageUrl)
        }

        // Gradio inference: (image, resolution, seed) → (psd_file, gallery)
        const prediction = await client.predict('/inference', {
          image: imageInput,
          resolution,
          seed,
        })

        return prediction
      },
      {
        maxAttempts: 2,
        baseDelayMs: 5000,
        label: 'see-through.decompose',
      },
    )
  } catch (err) {
    const raw =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err)

    // Try to extract human-readable message from Gradio status JSON
    let userMessage = raw
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.message) userMessage = parsed.message
      if (parsed?.title)
        userMessage = `${parsed.title}: ${parsed.message ?? ''}`
    } catch {
      // Not JSON — use raw message as-is
    }

    logger.error('[image-decompose] Gradio inference failed', {
      error: raw,
    })
    throw new ProviderError('see-through', 500, userMessage)
  }

  const data = result.data as [GradioFileData, GradioGalleryItem[]]

  if (!data || !Array.isArray(data) || data.length < 2) {
    throw new ProviderError(
      'see-through',
      500,
      'Unexpected response format from See-Through Space',
    )
  }

  const [psdFile, gallery] = data

  if (!psdFile?.url) {
    throw new ProviderError(
      'see-through',
      500,
      'No PSD file returned from See-Through Space',
    )
  }

  const rawLayers: DecomposedLayer[] = (gallery ?? []).map((item) => ({
    name: item.caption ?? item.image.orig_name ?? 'layer',
    imageUrl: item.image.url,
  }))

  logger.info('[image-decompose] Decomposition complete, persisting to R2', {
    layerCount: rawLayers.length,
    hasPsd: !!psdFile.url,
  })

  // ─── Persist all layers + PSD to R2 ─────────────────────────────
  // Gradio temporary URLs on private Spaces require auth
  const fetchHeaders = hfToken
    ? { Authorization: `Bearer ${hfToken}` }
    : undefined

  const [persistedLayers, persistedPsdUrl] = await Promise.all([
    // Upload each layer PNG to R2 in parallel
    Promise.all(
      rawLayers.map(async (layer) => {
        const key = generateStorageKey('IMAGE', userId)
        const { buffer, mimeType } = await fetchAsBuffer(
          layer.imageUrl,
          fetchHeaders,
        )
        const url = await uploadToR2({
          data: buffer,
          key,
          mimeType: mimeType || 'image/png',
        })
        return { name: layer.name, imageUrl: url }
      }),
    ),
    // Upload PSD to R2
    (async () => {
      const key = generateStorageKey('IMAGE', userId)
      const { buffer, mimeType } = await fetchAsBuffer(
        psdFile.url,
        fetchHeaders,
      )
      return uploadToR2({
        data: buffer,
        key,
        mimeType: mimeType || 'application/octet-stream',
      })
    })(),
  ])

  logger.info('[image-decompose] R2 persistence complete', {
    layerCount: persistedLayers.length,
  })

  return {
    layers: persistedLayers,
    psdUrl: persistedPsdUrl,
    layerCount: persistedLayers.length,
  }
}

/**
 * Persist decomposition results (PSD + layer PNGs) to R2 and create a Generation record.
 */
export async function persistDecomposition(params: {
  userId: string
  psdUrl: string
  layers: DecomposedLayer[]
  sourceGenerationId: string
}): Promise<{
  generation: GenerationRecord
  persistedPsdUrl: string
  persistedLayers: DecomposedLayer[]
}> {
  // Upload PSD to R2
  const psdStorageKey = generateStorageKey('IMAGE', params.userId)
  const { buffer: psdBuffer, mimeType: psdMimeType } = await fetchAsBuffer(
    params.psdUrl,
  )
  const persistedPsdUrl = await uploadToR2({
    data: psdBuffer,
    key: psdStorageKey,
    mimeType: psdMimeType || 'application/octet-stream',
  })

  // Upload each layer PNG to R2
  const persistedLayers: DecomposedLayer[] = await Promise.all(
    params.layers.map(async (layer) => {
      const layerKey = generateStorageKey('IMAGE', params.userId)
      const { buffer, mimeType } = await fetchAsBuffer(layer.imageUrl)
      const layerUrl = await uploadToR2({
        data: buffer,
        key: layerKey,
        mimeType: mimeType || 'image/png',
      })
      return { name: layer.name, imageUrl: layerUrl }
    }),
  )

  // Create generation record for the PSD
  const generation = await createGeneration({
    url: persistedPsdUrl,
    storageKey: psdStorageKey,
    mimeType: psdMimeType || 'application/octet-stream',
    width: 0,
    height: 0,
    prompt: `[decompose] from generation ${params.sourceGenerationId}`,
    model: 'see-through-decompose',
    provider: 'huggingface',
    requestCount: 0,
    userId: params.userId,
  })

  return { generation, persistedPsdUrl, persistedLayers }
}
