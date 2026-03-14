import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { GenerateRequestSchema } from '@/types'
import type { GenerateResponse } from '@/types'
import {
  getBuiltInProviderConfig,
  getExecutionModelId,
  getModelById,
} from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getAdapterDefaultCost,
  getAdapterEnvFallback,
  getDefaultProviderConfig,
  getProviderLabel,
  type ProviderConfig,
} from '@/constants/providers'
import { IMAGE_SIZES, AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import type { AspectRatio } from '@/constants/config'
import {
  generateStorageKey,
  fetchAsBuffer,
  uploadToR2,
} from '@/services/storage/r2'
import { createGeneration } from '@/services/generation.service'
import { deductCredits, getUserByClerkId } from '@/services/user.service'
import { getApiKeyValueById } from '@/services/apiKey.service'

// ─── Helper: resolve image dimensions ─────────────────────────────

function getImageSize(aspectRatio: AspectRatio) {
  return IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
}

function getOpenAiImageSize(aspectRatio: AspectRatio): string {
  const openAiSizeMap: Record<AspectRatio, string> = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
    '4:3': '1536x1024',
    '3:4': '1024x1536',
  }

  return openAiSizeMap[aspectRatio] ?? '1024x1024'
}

function getOpenAiEndpoint(
  baseUrl: string,
  hasReferenceImage: boolean,
): string {
  const trimmedBaseUrl = baseUrl.replace(/\/$/, '')
  const targetPath = hasReferenceImage ? 'edits' : 'generations'

  if (
    trimmedBaseUrl.endsWith('/generations') ||
    trimmedBaseUrl.endsWith('/edits')
  ) {
    return trimmedBaseUrl.replace(/\/(generations|edits)$/, `/${targetPath}`)
  }

  return `${trimmedBaseUrl}/${targetPath}`
}

// ─── Provider: Hugging Face Inference API ─────────────────────────

async function generateWithHuggingFace(
  prompt: string,
  modelId: string,
  providerConfig: ProviderConfig,
  aspectRatio: AspectRatio,
  apiKey: string | null,
  referenceImage?: string,
) {
  const { width, height } = getImageSize(aspectRatio)
  const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.HUGGINGFACE
  const endpoint = `${baseUrl}/${getExecutionModelId(modelId)}`
  const token = apiKey

  if (!token) {
    throw new Error('Missing HuggingFace API key')
  }

  const body: Record<string, unknown> = {
    inputs: prompt,
    parameters: { width, height },
  }

  // img2img: include reference image if provided
  if (referenceImage) {
    body.image = referenceImage
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`HuggingFace API error (${response.status}): ${errorBody}`)
  }

  // HuggingFace returns raw image bytes — convert to base64 data URL
  const imageBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(imageBuffer).toString('base64')
  const contentType = response.headers.get('content-type') ?? 'image/png'

  return `data:${contentType};base64,${base64}`
}

// ─── Provider: Google Gemini Imagen ───────────────────────────────

async function generateWithGemini(
  prompt: string,
  modelId: string,
  providerConfig: ProviderConfig,
  aspectRatio: AspectRatio,
  apiKey: string | null,
  referenceImage?: string,
) {
  const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.GEMINI
  const endpoint = `${baseUrl}/${modelId}:generateContent`

  // Map our aspect ratios to Gemini-supported values (1:1, 3:4, 4:3, 9:16, 16:9)
  const geminiAspectMap: Record<string, string> = {
    '1:1': '1:1',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
  }
  const geminiAspect = geminiAspectMap[aspectRatio] ?? '1:1'
  const token = apiKey

  if (!token) {
    throw new Error('Missing Gemini API key')
  }

  // Build parts array, optionally including a reference image
  const parts: Array<Record<string, unknown>> = [{ text: prompt }]
  if (referenceImage) {
    // Extract mimeType and base64 data from data URL, or pass as URL reference
    const dataUrlMatch = referenceImage.match(/^data:([^;]+);base64,(.+)$/)
    if (dataUrlMatch) {
      parts.push({
        inlineData: {
          mimeType: dataUrlMatch[1],
          data: dataUrlMatch[2],
        },
      })
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: geminiAspect,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`)
  }

  const responseData = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            mimeType: string
            data: string
          }
        }>
      }
    }>
  }
  const responseParts = responseData.candidates?.[0]?.content?.parts
  if (!responseParts || !Array.isArray(responseParts)) {
    throw new Error('No content returned from Gemini')
  }

  // Find the image part in the response
  const imagePart = responseParts.find((part) => part.inlineData)
  if (!imagePart?.inlineData) {
    throw new Error('No image data returned from Gemini')
  }

  const { mimeType: geminiMimeType, data: base64Data } = imagePart.inlineData
  return `data:${geminiMimeType};base64,${base64Data}`
}

// ─── Provider: OpenAI Images API ──────────────────────────────────

async function generateWithOpenAI(
  prompt: string,
  modelId: string,
  providerConfig: ProviderConfig,
  aspectRatio: AspectRatio,
  apiKey: string | null,
  referenceImage?: string,
) {
  const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.OPENAI
  const endpoint = getOpenAiEndpoint(baseUrl, Boolean(referenceImage))
  const size = getOpenAiImageSize(aspectRatio)
  const token = apiKey

  if (!token) {
    throw new Error('Missing OpenAI API key')
  }

  let response: Response

  if (referenceImage) {
    const { buffer, mimeType } = await fetchAsBuffer(referenceImage)
    const extension = mimeType.split('/')[1] ?? 'png'
    const formData = new FormData()

    formData.append('model', getExecutionModelId(modelId))
    formData.append('prompt', prompt)
    formData.append('size', size)
    formData.append(
      'image',
      new Blob([Uint8Array.from(buffer)], { type: mimeType }),
      `reference.${extension}`,
    )

    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })
  } else {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getExecutionModelId(modelId),
        prompt,
        size,
      }),
    })
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`)
  }

  const responseData = (await response.json()) as {
    data?: Array<{
      b64_json?: string
      url?: string
    }>
  }
  const imageItem = responseData.data?.[0]

  if (!imageItem) {
    throw new Error('No image data returned from OpenAI')
  }

  if (imageItem.b64_json) {
    return `data:image/png;base64,${imageItem.b64_json}`
  }

  if (imageItem.url) {
    return imageItem.url
  }

  throw new Error('No image data returned from OpenAI')
}

// ─── POST /api/generate ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const { userId: clerkId } = await auth()
    if (!clerkId) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      )
    }

    // 2. Parse and validate request body
    const body = await request.json()
    const parseResult = GenerateRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: parseResult.error.issues
            .map((e: { message: string }) => e.message)
            .join(', '),
        },
        { status: 400 },
      )
    }

    const { prompt, modelId, aspectRatio, referenceImage, apiKeyId } =
      parseResult.data

    const builtInModel = getModelById(modelId)
    let resolvedModelId = modelId
    let resolvedAdapterType = builtInModel?.adapterType ?? null
    let resolvedProviderConfig = builtInModel?.providerConfig ?? null
    let resolvedKey: string | null = null

    // 3. Resolve model cost and deduct credits before the AI call

    const dbUser = await getUserByClerkId(clerkId)
    if (!dbUser) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: 'User not found' },
        { status: 404 },
      )
    }

    if (apiKeyId) {
      const selectedApiKey = await getApiKeyValueById(apiKeyId, dbUser.id)
      if (!selectedApiKey) {
        return NextResponse.json<GenerateResponse>(
          { success: false, error: 'Selected API key is unavailable' },
          { status: 400 },
        )
      }

      if (selectedApiKey.modelId !== modelId) {
        return NextResponse.json<GenerateResponse>(
          {
            success: false,
            error: 'Selected API key does not match the chosen model',
          },
          { status: 400 },
        )
      }

      resolvedModelId = selectedApiKey.modelId
      resolvedAdapterType = selectedApiKey.adapterType
      resolvedProviderConfig = selectedApiKey.providerConfig
      resolvedKey = selectedApiKey.keyValue
    } else if (builtInModel) {
      const envFallbackName = getAdapterEnvFallback(builtInModel.adapterType)
      resolvedAdapterType = builtInModel.adapterType
      resolvedProviderConfig =
        getBuiltInProviderConfig(builtInModel.id) ??
        getDefaultProviderConfig(builtInModel.adapterType)
      resolvedKey = process.env[envFallbackName] ?? null
    } else {
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: 'Custom models require selecting an active API key',
        },
        { status: 400 },
      )
    }

    const effectiveAdapterType = resolvedAdapterType
    const effectiveProviderConfig =
      resolvedProviderConfig ??
      (effectiveAdapterType
        ? getDefaultProviderConfig(effectiveAdapterType)
        : null)

    if (!effectiveAdapterType || !effectiveProviderConfig) {
      return NextResponse.json<GenerateResponse>(
        { success: false, error: `Unsupported model: ${resolvedModelId}` },
        { status: 400 },
      )
    }

    if (!resolvedKey) {
      return NextResponse.json<GenerateResponse>(
        {
          success: false,
          error: 'No API key is available for the selected model',
        },
        { status: 400 },
      )
    }

    const effectiveCost =
      builtInModel?.cost ?? getAdapterDefaultCost(effectiveAdapterType)

    try {
      await deductCredits(clerkId, effectiveCost)
    } catch (err) {
      if (err instanceof Error && err.message === 'INSUFFICIENT_CREDITS') {
        return NextResponse.json<GenerateResponse>(
          { success: false, error: 'Insufficient credits' },
          { status: 402 },
        )
      }
      throw err
    }

    // 4. Route to the appropriate AI provider
    let aiImageUrl: string

    switch (effectiveAdapterType) {
      case AI_ADAPTER_TYPES.HUGGINGFACE:
        aiImageUrl = await generateWithHuggingFace(
          prompt,
          resolvedModelId,
          effectiveProviderConfig,
          aspectRatio as AspectRatio,
          resolvedKey,
          referenceImage,
        )
        break

      case AI_ADAPTER_TYPES.GEMINI:
        aiImageUrl = await generateWithGemini(
          prompt,
          resolvedModelId,
          effectiveProviderConfig,
          aspectRatio as AspectRatio,
          resolvedKey,
          referenceImage,
        )
        break

      case AI_ADAPTER_TYPES.OPENAI:
        aiImageUrl = await generateWithOpenAI(
          prompt,
          resolvedModelId,
          effectiveProviderConfig,
          aspectRatio as AspectRatio,
          resolvedKey,
          referenceImage,
        )
        break

      default:
        return NextResponse.json<GenerateResponse>(
          { success: false, error: `Unsupported model: ${resolvedModelId}` },
          { status: 400 },
        )
    }

    // 5. Generate a unique R2 storage key
    const key = generateStorageKey('IMAGE')

    // 6. Normalize AI output (base64 data URL or https URL) to a Buffer
    const { buffer, mimeType } = await fetchAsBuffer(aiImageUrl)

    // 7. Upload to Cloudflare R2
    const permanentUrl = await uploadToR2({ data: buffer, key, mimeType })

    // 8. Resolve image dimensions and persist generation to the database
    const { width, height } = getImageSize(aspectRatio as AspectRatio)

    const generation = await createGeneration({
      url: permanentUrl,
      storageKey: key,
      mimeType,
      width,
      height,
      prompt,
      model: resolvedModelId,
      provider: getProviderLabel(effectiveProviderConfig),
      creditsCost: effectiveCost,
      userId: dbUser.id,
    })

    // 9. Return the persisted generation record
    return NextResponse.json<GenerateResponse>({
      success: true,
      data: { generation },
    })
  } catch (error) {
    console.error('[API /api/generate] Error:', error)

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    return NextResponse.json<GenerateResponse>(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
