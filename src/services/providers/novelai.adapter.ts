import 'server-only'

import { inflateRawSync } from 'node:zlib'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { invertReferenceStrength } from '@/lib/utils'

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

const DEFAULT_NEGATIVE =
  'lowres, bad anatomy, bad hands, missing fingers, extra digit'

/** V4/V4.5 models require structured prompt objects */
const V4_MODELS = new Set([
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated-preview',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
])

function isV4Model(modelId: string): boolean {
  return V4_MODELS.has(modelId)
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

  const compressionMethod = buffer.readUInt16LE(8)
  let compressedSize = buffer.readUInt32LE(18)
  const filenameLength = buffer.readUInt16LE(26)
  const extraFieldLength = buffer.readUInt16LE(28)
  const dataOffset = 30 + filenameLength + extraFieldLength

  // When bit 3 of general purpose flag is set, sizes are 0 in the local header
  // and stored in a data descriptor after the data. Find the central directory
  // signature (PK\x01\x02) to determine where file data ends.
  if (compressedSize === 0) {
    for (let i = dataOffset; i < buffer.length - 3; i++) {
      if (
        buffer[i] === 0x50 &&
        buffer[i + 1] === 0x4b &&
        (buffer[i + 2] === 0x01 || buffer[i + 2] === 0x03)
      ) {
        // Found next PK signature (central dir 01 or data descriptor 03)
        compressedSize = i - dataOffset
        break
      }
    }
  }

  const compressedData = buffer.subarray(
    dataOffset,
    dataOffset + compressedSize,
  )

  if (compressionMethod === 0) {
    return compressedData
  }
  if (compressionMethod === 8) {
    return Buffer.from(inflateRawSync(compressedData))
  }

  throw new Error(
    `NovelAI ZIP uses unsupported compression method: ${compressionMethod}`,
  )
}

export const novelAiAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.NOVELAI,

  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
    advancedParams,
  }: ProviderGenerationInput) {
    const dimensions = NOVELAI_SIZES[aspectRatio] ?? NOVELAI_SIZES['1:1']
    const { width, height } = dimensions
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.NOVELAI
    const endpoint = `${baseUrl}/ai/generate-image`

    const externalModelId = getExecutionModelId(modelId)
    const negative = advancedParams?.negativePrompt || DEFAULT_NEGATIVE
    const seed =
      advancedParams?.seed != null && advancedParams.seed >= 0
        ? advancedParams.seed
        : Math.floor(Math.random() * 4294967295)

    const isImg2Img = Boolean(referenceImage)
    const useV4 = isV4Model(externalModelId)

    const parameters: Record<string, unknown> = {
      params_version: useV4 ? 3 : 1,
      width,
      height,
      scale: advancedParams?.guidanceScale ?? 5.0,
      sampler: 'k_euler_ancestral',
      steps: advancedParams?.steps ?? 28,
      seed,
      extra_noise_seed: seed,
      n_samples: 1,
      ucPreset: 3,
      qualityToggle: false,
      sm: false,
      sm_dyn: false,
      dynamic_thresholding: false,
      controlnet_strength: 1.0,
      legacy: false,
      add_original_image: isImg2Img && useV4,
      cfg_rescale: 0,
      noise_schedule: 'karras',
      legacy_v3_extend: false,
      negative_prompt: negative,
      prompt,
      reference_image_multiple: [],
      reference_information_extracted_multiple: [],
      reference_strength_multiple: [],
    }

    // img2img: pass reference image as bare base64
    // NovelAI's `strength` = denoising strength (higher = more change, less similarity)
    // Our `referenceStrength` = how much to reference the original (higher = more similar)
    // So we invert: denoising = 1 - referenceStrength
    if (isImg2Img && referenceImage) {
      const base64Match = referenceImage.match(/^data:[^;]+;base64,(.+)$/)
      parameters.image = base64Match ? base64Match[1] : referenceImage
      const userStrength = advancedParams?.referenceStrength ?? 0.7
      parameters.strength = invertReferenceStrength(userStrength)
      parameters.noise = 0.0
      parameters.extra_noise_seed = seed
    }

    // V4/V4.5 models require structured prompt objects
    if (useV4) {
      parameters.v4_prompt = {
        use_coords: false,
        use_order: false,
        caption: {
          base_caption: prompt,
          char_captions: [],
        },
      }
      parameters.v4_negative_prompt = {
        use_coords: false,
        use_order: false,
        caption: {
          base_caption: negative,
          char_captions: [],
        },
      }
    }

    const body = {
      input: prompt,
      model: externalModelId,
      action: isImg2Img ? 'img2img' : 'generate',
      parameters,
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
      // User API is still on api.novelai.net (image.novelai.net is for generation only)
      const endpoint = 'https://api.novelai.net/user/subscription'
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
