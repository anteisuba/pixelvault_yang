import 'server-only'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import type {
  HealthCheckInput,
  ProviderAdapter,
  ProviderGenerationInput,
} from '@/services/providers/types'

/** NovelAI image size presets mapped from our aspect ratios */
const NOVELAI_SIZES: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1216, height: 832 },
  '9:16': { width: 832, height: 1216 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
}

/**
 * Extract the first file from a ZIP buffer.
 * NovelAI returns a ZIP with a single image file.
 * Uses minimal ZIP parsing — no external dependencies.
 */
function extractFirstFileFromZip(buffer: Buffer): Buffer {
  // ZIP local file header signature: PK\x03\x04
  if (
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    throw new Error('Invalid ZIP file received from NovelAI')
  }

  // Local file header structure:
  // offset 8:  compression method (2 bytes) — 0 = stored (no compression)
  // offset 26: filename length (2 bytes)
  // offset 28: extra field length (2 bytes)
  // offset 18: compressed size (4 bytes)
  const compressionMethod = buffer.readUInt16LE(8)
  const compressedSize = buffer.readUInt32LE(18)
  const filenameLength = buffer.readUInt16LE(26)
  const extraFieldLength = buffer.readUInt16LE(28)

  const dataOffset = 30 + filenameLength + extraFieldLength

  if (compressionMethod !== 0) {
    throw new Error(
      `NovelAI ZIP uses unsupported compression method: ${compressionMethod}`,
    )
  }

  return buffer.subarray(dataOffset, dataOffset + compressedSize)
}

export const novelAiAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.NOVELAI,

  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
  }: ProviderGenerationInput) {
    const dimensions = NOVELAI_SIZES[aspectRatio] ?? NOVELAI_SIZES['1:1']
    const { width, height } = dimensions
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.NOVELAI
    const endpoint = `${baseUrl}/ai/generate-image`

    const body = {
      input: prompt,
      model: modelId,
      action: 'generate',
      parameters: {
        width,
        height,
        scale: 5.0,
        sampler: 'k_euler_ancestral',
        steps: 28,
        n_samples: 1,
        ucPreset: 0,
        negative_prompt: 'lowres, bad anatomy, bad hands, missing fingers',
        noise_schedule: 'karras',
        qualityToggle: true,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        image_format: 'png',
      },
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw new Error(`NovelAI API error (${response.status}): ${errorBody}`)
    }

    // NovelAI returns a ZIP file containing the generated image
    const zipBuffer = Buffer.from(await response.arrayBuffer())
    const imageBuffer = extractFirstFileFromZip(zipBuffer)
    const base64 = imageBuffer.toString('base64')

    return {
      imageUrl: `data:image/png;base64,${base64}`,
      width,
      height,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },

  async healthCheck({ apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const endpoint = `${baseUrl}/user/information`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok) {
        return { status: 'available' as const, latencyMs }
      }
      return {
        status: 'unavailable' as const,
        latencyMs,
        error: `HTTP ${response.status}`,
      }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}
