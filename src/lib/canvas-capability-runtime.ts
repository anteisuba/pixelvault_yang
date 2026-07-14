import {
  createExtractedElementAPI,
  decomposeImageAPI,
  editImageAPI,
  extractElementAPI,
  inpaintImageAPI,
  outpaintImageAPI,
} from '@/lib/api-client'
import { isRemoteImageUrl } from '@/lib/image-input'
import type { CanvasDerivedImageOutput } from '@/types/canvas-image-edit'
import type { OutpaintPadding } from '@/types'

export interface CanvasCapabilityTarget {
  sourceUrl: string
  sourceGenerationId?: string
  sourceWidth: number
  sourceHeight: number
}

export type CanvasCapabilityRequest =
  | {
      capability: 'upscale'
      target: CanvasCapabilityTarget
      targetScale: '2x' | '4x'
      modelId: string
    }
  | {
      capability: 'remove-background'
      target: CanvasCapabilityTarget
      modelId: string
    }
  | {
      capability: 'decompose'
      target: CanvasCapabilityTarget
      modelId: string
    }
  | {
      capability: 'extract-element'
      target: CanvasCapabilityTarget
      prompt: string
      invert: boolean
      modelId: string
    }
  | {
      capability: 'inpaint'
      target: CanvasCapabilityTarget
      maskImageUrl: string
      prompt: string
      modelId: string
    }
  | {
      capability: 'outpaint'
      target: CanvasCapabilityTarget
      padding: OutpaintPadding
      prompt: string
      modelId: string
    }

export interface CanvasCapabilityResult {
  success: boolean
  outputs: CanvasDerivedImageOutput[]
  error?: string
  saveWarning?: boolean
  /** Stable id for an operation that may yield multiple placed objects. */
  batchId?: string
}

export type CanvasCapabilityResultStrategy =
  | 'update-output-slot'
  | 'derive-right'
  | 'derive-layers'
  | 'append-sequence'
  | 'bind-only'

export interface CanvasCapabilityDescriptor {
  id: CanvasCapabilityRequest['capability']
  interaction: 'instant' | 'prompt' | 'mask' | 'outpaint' | 'layers'
  output: 'single-image' | 'image-layers'
  resultStrategy: CanvasCapabilityResultStrategy
  defaultModelId?: string
}

export const CANVAS_CAPABILITY_DESCRIPTORS: readonly CanvasCapabilityDescriptor[] =
  [
    {
      id: 'upscale',
      interaction: 'instant',
      output: 'single-image',
      resultStrategy: 'derive-right',
      defaultModelId: 'fal-ai/aura-sr',
    },
    {
      id: 'remove-background',
      interaction: 'instant',
      output: 'single-image',
      resultStrategy: 'derive-right',
      defaultModelId: 'fal-ai/birefnet/v2',
    },
    {
      id: 'inpaint',
      interaction: 'mask',
      output: 'single-image',
      resultStrategy: 'derive-right',
      defaultModelId: 'fal-ai/flux-pro/v1/fill',
    },
    {
      id: 'outpaint',
      interaction: 'outpaint',
      output: 'single-image',
      resultStrategy: 'derive-right',
      defaultModelId: 'fal-ai/image-apps-v2/outpaint',
    },
    {
      id: 'decompose',
      interaction: 'layers',
      output: 'image-layers',
      resultStrategy: 'derive-layers',
      defaultModelId: 'xiuruisu/see-through',
    },
    {
      id: 'extract-element',
      interaction: 'prompt',
      output: 'single-image',
      resultStrategy: 'derive-right',
      defaultModelId: 'gpt-image-2',
    },
  ] as const

const CAPABILITY_DESCRIPTOR_BY_ID = new Map(
  CANVAS_CAPABILITY_DESCRIPTORS.map((descriptor) => [
    descriptor.id,
    descriptor,
  ]),
)

function createCapabilityBatchId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? `canvas-capability-${uuid}` : `canvas-capability-${Date.now()}`
}

/** Typed seam consumed by object tools and assistant adapters. */
export const canvasCapabilityRuntime = {
  listFor(): readonly CanvasCapabilityDescriptor[] {
    return CANVAS_CAPABILITY_DESCRIPTORS
  },
  open(
    capability: CanvasCapabilityRequest['capability'],
  ): CanvasCapabilityDescriptor {
    const descriptor = CAPABILITY_DESCRIPTOR_BY_ID.get(capability)
    if (!descriptor) throw new Error(`Unknown canvas capability: ${capability}`)
    return descriptor
  },
  async run(request: CanvasCapabilityRequest): Promise<CanvasCapabilityResult> {
    return executeCanvasCapability(request)
  },
}

interface SingleImageData {
  imageUrl: string
  width?: number
  height?: number
  generationId?: string
}

function oneOutput(
  capability: CanvasCapabilityRequest['capability'],
  result: SingleImageData,
): CanvasDerivedImageOutput[] {
  return [
    {
      imageUrl: result.imageUrl,
      width: result.width,
      height: result.height,
      generationId: result.generationId,
      editCapability: capability,
    },
  ]
}

async function executeCanvasCapability(
  request: CanvasCapabilityRequest,
): Promise<CanvasCapabilityResult> {
  const { target } = request

  switch (request.capability) {
    case 'upscale': {
      const response = await editImageAPI('upscale', target.sourceUrl, {
        generationId: target.sourceGenerationId,
        targetScale: request.targetScale,
        ...(request.targetScale === '4x' && { modelId: request.modelId }),
      })
      if (!response.success || !response.data) {
        return { success: false, outputs: [], error: response.error }
      }
      return {
        success: true,
        outputs: oneOutput('upscale', {
          imageUrl: response.data.imageUrl,
          width: response.data.width,
          height: response.data.height,
          generationId: response.data.generation?.id,
        }),
      }
    }
    case 'remove-background': {
      const response = await editImageAPI(
        'remove-background',
        target.sourceUrl,
        {
          generationId: target.sourceGenerationId,
          modelId: request.modelId,
        },
      )
      if (!response.success || !response.data) {
        return { success: false, outputs: [], error: response.error }
      }
      return {
        success: true,
        outputs: oneOutput('remove-background', {
          imageUrl: response.data.imageUrl,
          width: response.data.width,
          height: response.data.height,
          generationId: response.data.generation?.id,
        }),
      }
    }
    case 'decompose': {
      const response = await decomposeImageAPI(target.sourceUrl, {
        modelId: request.modelId,
        ...(target.sourceGenerationId && {
          persist: true,
          generationId: target.sourceGenerationId,
        }),
      })
      if (!response.success || !response.data) {
        return { success: false, outputs: [], error: response.error }
      }
      const decomposeData = response.data
      const batchId = createCapabilityBatchId()
      const outputs = decomposeData.layers
        .filter((layer) => isRemoteImageUrl(layer.imageUrl))
        .map(
          (layer): CanvasDerivedImageOutput => ({
            imageUrl: layer.imageUrl,
            width: target.sourceWidth,
            height: target.sourceHeight,
            generationId: decomposeData.generationId,
            label: layer.name,
            editCapability: 'decompose',
            batchId,
            ...(target.sourceGenerationId
              ? { sourceGenerationId: target.sourceGenerationId }
              : {}),
          }),
        )
      return { success: outputs.length > 0, outputs, batchId }
    }
    case 'extract-element': {
      const response = await extractElementAPI({
        imageUrl: target.sourceUrl,
        prompt: request.prompt,
        invert: request.invert,
        sourceGenerationId: target.sourceGenerationId,
        modelId: request.modelId,
      })
      if (!response.success || !response.data) {
        return { success: false, outputs: [], error: response.error }
      }
      const saveResponse = await createExtractedElementAPI({
        extractedImageUrl: response.data.imageUrl,
        sourceImageUrl: target.sourceUrl,
        sourceGenerationId: target.sourceGenerationId,
        prompt: request.prompt,
        invert: request.invert,
        modelId: request.modelId,
      })
      return {
        success: true,
        outputs: oneOutput('extract-element', {
          imageUrl: response.data.imageUrl,
          width: response.data.width,
          height: response.data.height,
          generationId: response.data.generation?.id,
        }),
        saveWarning: !saveResponse.success || !saveResponse.data,
      }
    }
    case 'inpaint': {
      const response = await inpaintImageAPI({
        imageUrl: target.sourceUrl,
        maskImageUrl: request.maskImageUrl,
        prompt: request.prompt,
        sourceGenerationId: target.sourceGenerationId,
        modelId: request.modelId,
      })
      if (!response.success || !response.data) {
        return { success: false, outputs: [], error: response.error }
      }
      return {
        success: true,
        outputs: oneOutput('inpaint', {
          imageUrl: response.data.imageUrl,
          width: response.data.width,
          height: response.data.height,
          generationId: response.data.generation?.id,
        }),
      }
    }
    case 'outpaint': {
      const response = await outpaintImageAPI({
        imageUrl: target.sourceUrl,
        padding: request.padding,
        prompt: request.prompt,
        sourceGenerationId: target.sourceGenerationId,
        modelId: request.modelId,
      })
      if (!response.success || !response.data) {
        return { success: false, outputs: [], error: response.error }
      }
      return {
        success: true,
        outputs: oneOutput('outpaint', {
          imageUrl: response.data.imageUrl,
          width: response.data.width,
          height: response.data.height,
          generationId: response.data.generation?.id,
        }),
      }
    }
  }
}

/** Backward-compatible function API for existing canvas callers. */
export async function runCanvasCapability(
  request: CanvasCapabilityRequest,
): Promise<CanvasCapabilityResult> {
  return canvasCapabilityRuntime.run(request)
}
