import {
  createExtractedElementAPI,
  editImageAPI,
  extractElementAPI,
  inpaintImageAPI,
  objectReplaceAPI,
} from '@/lib/api-client'
import type { CanvasDerivedImageOutput } from '@/types/canvas-image-edit'
import type { GenerationRecord, ObjectReplaceAnnotation } from '@/types'

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
      capability: 'object-replace'
      target: CanvasCapabilityTarget
      /** ⚠ 注释清单，不是 mask —— 图上那些编号不落像素。 */
      annotations: readonly ObjectReplaceAnnotation[]
      modelId: string
    }

export interface CanvasCapabilityResult {
  success: boolean
  outputs: CanvasDerivedImageOutput[]
  error?: string
  saveWarning?: boolean
}

export type CanvasCapabilityResultStrategy =
  | 'update-output-slot'
  | 'derive-right'
  | 'append-sequence'
  | 'bind-only'

export interface CanvasCapabilityDescriptor {
  id: CanvasCapabilityRequest['capability']
  interaction: 'instant' | 'prompt' | 'mask' | 'annotate'
  output: 'single-image'
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
      id: 'extract-element',
      interaction: 'prompt',
      output: 'single-image',
      resultStrategy: 'derive-right',
      defaultModelId: 'gpt-image-2',
    },
    {
      id: 'object-replace',
      interaction: 'annotate',
      output: 'single-image',
      resultStrategy: 'derive-right',
      defaultModelId: 'gemini-3-pro-image',
    },
  ] as const

const CAPABILITY_DESCRIPTOR_BY_ID = new Map(
  CANVAS_CAPABILITY_DESCRIPTORS.map((descriptor) => [
    descriptor.id,
    descriptor,
  ]),
)

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
  /** Raw provider URL. Only a fallback — see `oneOutput`. */
  imageUrl: string
  width?: number
  height?: number
  /** The R2-persisted row the edit routes always create. */
  generation?: GenerationRecord
}

function oneOutput(
  capability: CanvasCapabilityRequest['capability'],
  result: SingleImageData,
): CanvasDerivedImageOutput[] {
  return [
    {
      // ⚠ 派生节点存的必须是 R2 持久副本，不是 provider 那条 —— fal 的
      // `v3b.fal.media` 链接会过期（编辑路由自己的注释就是这么写的，持久化
      // 也正是为此），存进节点等于给画布埋裂图。
      // 更狠的一种见于已删除的 outpaint：它给 fal 传 `sync_mode: true`，拿回
      // 来的是 2MB 级的 `data:` URI，直接撞穿 `CanvasDerivedImageOutputSchema`
      // 的 `imageUrl.max(4000)`，于是 `placeDerivedImages()` 静默返回 `[]` ——
      // 图生成了、也落库了，画布上却什么都不长（2026-08-18 E0 实测）。
      imageUrl: result.generation?.url ?? result.imageUrl,
      width: result.width,
      height: result.height,
      generationId: result.generation?.id,
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
          generation: response.data.generation,
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
          generation: response.data.generation,
        }),
      }
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
          generation: response.data.generation,
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
          generation: response.data.generation,
        }),
      }
    }
    case 'object-replace': {
      const response = await objectReplaceAPI({
        imageUrl: target.sourceUrl,
        annotations: [...request.annotations],
        sourceGenerationId: target.sourceGenerationId,
        modelId: request.modelId,
      })
      if (!response.success || !response.data) {
        return { success: false, outputs: [], error: response.error }
      }
      return {
        success: true,
        outputs: oneOutput('object-replace', {
          imageUrl: response.data.imageUrl,
          width: response.data.width,
          height: response.data.height,
          generation: response.data.generation,
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
