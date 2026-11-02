import { WorkerProviderError } from '../../lib/provider-error'

export const IDEOGRAM_API_BASE = 'https://api.ideogram.ai'

interface IdeogramImageInput {
  prompt: string
  externalModelId: string
  aspectRatio: string
  imageOperation?: 'precise-edit'
  referenceImages?: readonly string[]
  advancedParams?: Record<string, unknown>
}

export function buildIdeogramImageRequest(input: IdeogramImageInput) {
  const advanced = input.advancedParams ?? {}
  const references = input.referenceImages ?? []
  const precise = input.imageOperation === 'precise-edit'
  const mask =
    typeof advanced.inpaintMask === 'string' ? advanced.inpaintMask : undefined
  const quality = advanced.quality ?? 'medium'
  const invalid = (message: string): never => {
    throw new WorkerProviderError({
      provider: 'ideogram',
      phase: 'image_validation',
      message,
      httpStatus: 400,
    })
  }
  if (input.externalModelId !== 'ideogram-4-5')
    invalid('Unsupported Ideogram model.')
  if (!input.prompt.trim() || input.prompt.length > 10_000)
    invalid('Ideogram prompts must contain 1 to 10000 characters.')
  if (
    !['very_low', 'low', 'medium', 'high'].includes(String(quality)) ||
    (quality === 'very_low' && references.length === 0)
  )
    invalid('Unsupported Ideogram quality for this input.')
  if (
    references.length > (mask ? 4 : 5) ||
    ((precise || mask) && references.length === 0)
  )
    invalid('Unsupported source/reference image count.')
  if (
    advanced.seed !== undefined &&
    (!Number.isInteger(advanced.seed) ||
      Number(advanced.seed) < 0 ||
      Number(advanced.seed) > 2147483647)
  )
    invalid('Ideogram seed must be between 0 and 2147483647.')
  if (!precise && !mask && input.aspectRatio !== '1:1')
    invalid('Ideogram text-to-image currently supports the square format.')

  const fields: Record<string, unknown> = {
    prompt: input.prompt,
    quality,
    num_images: 1,
    async: true,
    ...(advanced.seed !== undefined ? { seed: advanced.seed } : {}),
  }
  if (!precise && !mask) {
    fields.size = advanced.resolution === '2K' ? '2048x2048' : '1024x1024'
  }
  return {
    path: `/v2/image/${precise ? 'precise-edit' : 'generate'}/ideogram-4-5`,
    fields,
    files: [
      ...references.map((url, index) => ({
        url,
        field: precise
          ? index === 0
            ? 'image'
            : 'reference_images'
          : 'images',
      })),
      ...(mask ? [{ url: mask, field: 'mask' }] : []),
    ],
  }
}

export type IdeogramPollResult =
  | { status: 'pending'; retryAfterMs?: number }
  | {
      status: 'completed'
      imageUrl: string
      width: number
      height: number
      providerMetadata: Record<string, unknown>
    }

export function parseIdeogramGeneration(
  value: unknown,
  generationId: string,
): IdeogramPollResult {
  const payload =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const fail = (message: string, errorCode?: string): never => {
    throw new WorkerProviderError({
      provider: 'ideogram',
      phase: 'image_poll',
      requestId: generationId,
      message,
      errorCode,
    })
  }
  if (payload.status === 'pending') return { status: 'pending' }
  if (payload.status === 'failed') {
    const reason =
      typeof payload.failure_reason === 'string'
        ? payload.failure_reason
        : 'unknown'
    return fail(
      `Ideogram generation failed: ${reason}`,
      /content|safety|copyright/.test(reason) ? 'content_filtered' : undefined,
    )
  }
  if (payload.status !== 'completed' || !Array.isArray(payload.data))
    return fail('Ideogram returned an invalid generation status.')
  const output = payload.data.find(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      (!('object_type' in item) || item.object_type === 'image'),
  ) as Record<string, unknown> | undefined
  if (output?.is_image_safe === false)
    return fail('Ideogram filtered this image.', 'content_filtered')
  const dimensions =
    typeof output?.resolution === 'string'
      ? /^(\d+)x(\d+)$/.exec(output.resolution)
      : null
  if (
    typeof output?.url !== 'string' ||
    !dimensions ||
    Number(dimensions[1]) <= 0 ||
    Number(dimensions[2]) <= 0
  )
    return fail(
      'Ideogram completed without a valid image.',
      'provider_no_output',
    )
  let url: URL
  try {
    url = new URL(output.url)
  } catch {
    return fail('Ideogram returned an invalid image URL.', 'provider_no_output')
  }
  if (url.protocol !== 'https:')
    return fail('Ideogram returned an invalid image URL.', 'provider_no_output')
  return {
    status: 'completed',
    imageUrl: output.url,
    width: Number(dimensions[1]),
    height: Number(dimensions[2]),
    providerMetadata: {
      generationId,
      ...(typeof output.seed === 'number' ? { seed: output.seed } : {}),
      ...(typeof payload.usage_cost_usd_micros === 'number'
        ? { usageCostUsdMicros: payload.usage_cost_usd_micros }
        : {}),
    },
  }
}
