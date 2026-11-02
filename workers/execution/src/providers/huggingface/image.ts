import type {
  ExecutionEnv,
  WorkerImageGenerationResult,
  WorkerImageRunContext,
} from '../../index'
import {
  readNumberField,
  readPositiveNumberField,
  readStringField,
} from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  getImageReferenceInputs,
  getStandardImageDimensions,
  getWorkerImageOutputKey,
  invertReferenceStrength,
  readAdvancedRecord,
  readReferenceImageAsBase64,
  uploadImageBytesToKey,
} from '../../lib/image-io'

export const HUGGINGFACE_IMAGE_BASE_URL =
  'https://router.huggingface.co/hf-inference/models'

export async function generateHuggingFaceImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const dimensions = getStandardImageDimensions(
    context.providerInput.aspectRatio,
  )
  const advancedParams = readAdvancedRecord(context)
  const parameters: Record<string, unknown> = {
    width: dimensions.width,
    height: dimensions.height,
  }

  const negativePrompt = readStringField(advancedParams, 'negativePrompt')
  if (negativePrompt) parameters.negative_prompt = negativePrompt
  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) parameters.guidance_scale = guidanceScale
  const steps = readPositiveNumberField(advancedParams, 'steps')
  if (steps != null) parameters.num_inference_steps = steps
  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) parameters.seed = Math.round(seed)

  const referenceImage = getImageReferenceInputs(context)[0]
  const body: Record<string, unknown> = referenceImage
    ? {
        inputs: await readReferenceImageAsBase64(referenceImage),
        parameters: {
          ...parameters,
          prompt: context.providerInput.prompt,
        },
      }
    : {
        inputs: context.providerInput.prompt,
        parameters,
      }

  if (referenceImage) {
    const referenceStrength = readNumberField(
      advancedParams,
      'referenceStrength',
    )
    if (referenceStrength != null) {
      const bodyParameters = body.parameters as Record<string, unknown>
      bodyParameters.strength = invertReferenceStrength(referenceStrength)
    }
  }

  const response = await fetch(
    `${HUGGINGFACE_IMAGE_BASE_URL}/${context.providerInput.externalModelId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': JSON_CONTENT_TYPE,
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    throw new Error(
      `Hugging Face image generation failed (${response.status}): ${errBody.slice(0, 200)}`,
    )
  }

  const mimeType =
    response.headers.get('content-type')?.split(';')[0] ?? 'image/png'
  const uploaded = await uploadImageBytesToKey(
    env,
    await response.arrayBuffer(),
    mimeType,
    getWorkerImageOutputKey(context),
  )

  return { ...uploaded, ...dimensions }
}
