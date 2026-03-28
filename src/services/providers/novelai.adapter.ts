import 'server-only'

import { inflateRawSync } from 'node:zlib'
import sharp from 'sharp'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { invertReferenceStrength } from '@/lib/utils'

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
  type ProviderGenerationInput,
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
 * Parse a prompt that uses [Character N: name] markers into
 * per-character descriptions + the remaining scene prompt.
 */
function parseCharacterPrompt(prompt: string): {
  characters: { name: string; description: string }[]
  scenePrompt: string
} {
  const charRegex = /\[Character\s+\d+:\s*([^\]]+)\]\n/g
  const characters: { name: string; description: string }[] = []
  const matches = [...prompt.matchAll(charRegex)]

  if (matches.length === 0) {
    return { characters: [], scenePrompt: prompt }
  }

  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1].trim()
    const startIdx = matches[i].index! + matches[i][0].length
    const endIdx =
      i + 1 < matches.length ? matches[i + 1].index! : prompt.length
    characters.push({
      name,
      description: prompt.slice(startIdx, endIdx).trim(),
    })
  }

  // Scene prompt is everything after the last character block that doesn't
  // start with a character marker. We detect it by looking for the last
  // character's description end — the scene part is whatever is left after
  // the last character block's description.
  const lastCharEnd =
    matches[matches.length - 1].index! + matches[matches.length - 1][0].length
  const remainingText = prompt.slice(lastCharEnd)

  // The last "character"'s description may contain the scene prompt appended.
  // Split: everything up to 2+ newlines before non-character-tag content = char desc,
  // rest = scene. If last char desc contains double-newline, split there.
  const lastChar = characters[characters.length - 1]
  const doubleNewline = lastChar.description.search(/\n\n(?!\[Character)/)
  if (doubleNewline !== -1) {
    const scenePrompt = lastChar.description.slice(doubleNewline).trim()
    lastChar.description = lastChar.description.slice(0, doubleNewline).trim()
    return { characters, scenePrompt }
  }

  return { characters, scenePrompt: '' }
}

/**
 * Director Reference requires images to be exactly one of these sizes,
 * with black padding (letterbox) to fill the target canvas.
 */
const DIRECTOR_REF_SIZES = [
  { width: 1024, height: 1536 }, // portrait 2:3
  { width: 1536, height: 1024 }, // landscape 3:2
  { width: 1472, height: 1472 }, // square
] as const

async function padForDirectorReference(base64Image: string): Promise<string> {
  const imgBuffer = Buffer.from(base64Image, 'base64')
  const metadata = await sharp(imgBuffer).metadata()
  const srcW = metadata.width ?? 1024
  const srcH = metadata.height ?? 1024

  // Pick the target size that best matches the image's aspect ratio
  const srcRatio = srcW / srcH
  let best: (typeof DIRECTOR_REF_SIZES)[number] = DIRECTOR_REF_SIZES[0]
  let bestDiff = Infinity
  for (const size of DIRECTOR_REF_SIZES) {
    const diff = Math.abs(size.width / size.height - srcRatio)
    if (diff < bestDiff) {
      bestDiff = diff
      best = size
    }
  }

  // Resize to fit within target, then pad with black to exact target size
  const padded = await sharp(imgBuffer)
    .resize(best.width, best.height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toBuffer()

  return padded.toString('base64')
}

/** Convert a data URL, HTTPS URL, or raw base64 string into raw base64 */
async function toRawBase64(input: string): Promise<string> {
  const dataUrlMatch = input.match(/^data:[^;]+;base64,(.+)$/)
  if (dataUrlMatch) return dataUrlMatch[1]

  if (input.startsWith('http://') || input.startsWith('https://')) {
    const res = await fetch(input)
    if (!res.ok) {
      throw new ProviderError(
        'NovelAI',
        res.status,
        `Failed to fetch reference image: ${res.statusText}`,
      )
    }
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  }

  return input
}

/**
 * Encode a base64 image into a vibe token via NovelAI's /ai/encode-vibe endpoint.
 * V4/V4.5 models require vibe-encoded tokens instead of raw base64 in reference_image_multiple.
 */
async function encodeVibe(
  base64Image: string,
  informationExtracted: number,
  modelId: string,
  apiKey: string,
  baseUrl: string,
): Promise<string> {
  const endpoint = `${baseUrl}/ai/encode-vibe`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64Image,
      information_extracted: informationExtracted,
      model: modelId,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError(
      'NovelAI',
      response.status,
      `encode-vibe failed: ${errorBody}`,
    )
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.toString('base64')
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
    referenceImages,
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

    // Multi-reference: multiple character/style images → reference_image_multiple
    // img2img: single base image with denoising
    const hasMultiRef = referenceImages && referenceImages.length > 0
    const isImg2Img = !hasMultiRef && Boolean(referenceImage)
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
      ucPreset: useV4 ? 4 : 3,
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
      skip_cfg_above_sigma: null,
      use_coords: false,
      characterPrompts: [],
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
      let rawBase64: string
      const base64Match = referenceImage.match(/^data:[^;]+;base64,(.+)$/)
      if (base64Match) {
        rawBase64 = base64Match[1]
      } else if (
        referenceImage.startsWith('http://') ||
        referenceImage.startsWith('https://')
      ) {
        // NovelAI requires raw base64, not URLs — download and convert
        const imgResponse = await fetch(referenceImage)
        if (!imgResponse.ok) {
          throw new ProviderError(
            'NovelAI',
            imgResponse.status,
            `Failed to fetch reference image: ${imgResponse.statusText}`,
          )
        }
        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())
        rawBase64 = imgBuffer.toString('base64')
      } else {
        rawBase64 = referenceImage
      }
      parameters.image = rawBase64
      const userStrength = advancedParams?.referenceStrength ?? 0.7
      parameters.strength = invertReferenceStrength(userStrength)
      parameters.noise = 0.0
      parameters.extra_noise_seed = seed
    }

    // Character reference images — use Director Reference for V4.5 (precise character
    // consistency) and vibe transfer for V3 (style/mood reference).
    if (hasMultiRef) {
      const refStrength = advancedParams?.referenceStrength ?? 0.6
      // Cap to 1 image for non-Opus tiers
      let maxRefImages = referenceImages.length
      if (referenceImages.length > 1) {
        try {
          const subRes = await fetch(
            'https://api.novelai.net/user/subscription',
            { headers: { Authorization: `Bearer ${apiKey}` } },
          )
          if (subRes.ok) {
            const sub = (await subRes.json()) as { tier: number }
            if (sub.tier < 3) maxRefImages = 1
          }
        } catch {
          /* network error — proceed and let NovelAI reject if needed */
        }
      }

      const imagesToUse = referenceImages.slice(0, maxRefImages)
      const base64Images = await Promise.all(
        imagesToUse.map((img) => toRawBase64(img)),
      )

      if (useV4) {
        // V4.5 Director Reference (Precise Reference / Character Reference)
        // Sends raw base64 images — no encode-vibe needed.
        // Each image gets a description caption of "character" to indicate
        // the model should extract character identity from the reference.
        // Pad images to required Director Reference dimensions
        const paddedImages = await Promise.all(
          base64Images.map((img) => padForDirectorReference(img)),
        )
        parameters.director_reference_images = paddedImages
        parameters.director_reference_descriptions = base64Images.map(() => ({
          caption: { base_caption: 'character', char_captions: [] },
          use_coords: false,
          use_order: false,
        }))
        parameters.director_reference_information_extracted = base64Images.map(
          () => 1.0,
        )
        // strength: character similarity (high for consistency)
        // secondary_strength (fidelity): fine detail matching (medium to allow pose changes)
        parameters.director_reference_strength_values = base64Images.map(() =>
          Math.max(refStrength, 0.8),
        )
        parameters.director_reference_secondary_strength_values =
          base64Images.map(() => 0.5)
      } else {
        // V3: vibe transfer with raw base64
        parameters.reference_image_multiple = base64Images
        parameters.reference_information_extracted_multiple = base64Images.map(
          () => 1.0,
        )
        parameters.reference_strength_multiple = base64Images.map(
          () => refStrength,
        )
      }
    }

    // When using vibe transfer, the reference image already captures the character's
    // appearance. Strip the character description tags and keep only the scene/action
    // prompt so the model focuses on what the user actually wants to generate.
    // The form separates character description from user prompt with "\n\n".
    let effectivePrompt = prompt
    if (hasMultiRef) {
      const parsed = parseCharacterPrompt(prompt)
      if (parsed.characters.length > 0) {
        // Multi-character markers: use parsed scene prompt
        effectivePrompt = parsed.scenePrompt || prompt
      } else {
        // Single character card: character tags + "\n\n" + user scene
        const lastSep = prompt.lastIndexOf('\n\n')
        if (lastSep !== -1) {
          const scene = prompt.slice(lastSep + 2).trim()
          if (scene) effectivePrompt = scene
        }
      }
    }

    // Update parameters.prompt to use the effective (scene-only) prompt
    parameters.prompt = effectivePrompt

    // V4/V4.5 models require structured prompt objects
    if (useV4) {
      const parsed = hasMultiRef
        ? parseCharacterPrompt(prompt)
        : { characters: [], scenePrompt: prompt }

      const charCaptions = parsed.characters.map((c) => ({
        char_caption: c.description,
        centers: [{ x: 0.5, y: 0.5 }],
      }))

      // Build per-character prompt entries for the parameters
      if (hasMultiRef && parsed.characters.length > 0) {
        parameters.characterPrompts = parsed.characters.map((c) => ({
          prompt: c.description,
          uc: negative,
        }))
        parameters.use_coords = false
      }

      parameters.v4_prompt = {
        caption: {
          base_caption: effectivePrompt,
          char_captions: charCaptions,
        },
        use_coords: false,
        use_order: true,
      }
      parameters.v4_negative_prompt = {
        caption: {
          base_caption: negative,
          char_captions: [],
        },
        legacy_uc: false,
      }
    }

    // Use the effective prompt (scene-only for vibe transfer) as the input
    const inputPrompt = effectivePrompt

    const body = {
      input: inputPrompt,
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
      throw new ProviderError('NovelAI', response.status, errorBody)
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
