import type {
  CanvasImageEditCapability,
  EditTaskKind,
} from '@/types/canvas-image-edit'

const SINGLE_IMAGE_INPUT = {
  minImages: 1,
  maxImages: 1,
} as const

/**
 * Shared source of truth for image editing surfaces. This file stays free of
 * icons, translations, React components, and route knowledge so the legacy
 * edit page, canvas object tools, and assistant execution can consume the
 * same capability contract.
 */
export const CANVAS_IMAGE_EDIT_CAPABILITIES = [
  {
    id: 'upscale',
    availability: 'ready',
    interaction: 'instant',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: ['fal-ai/aura-sr'],
    defaultModelId: 'fal-ai/aura-sr',
  },
  {
    id: 'remove-background',
    availability: 'ready',
    interaction: 'instant',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: ['fal-ai/birefnet/v2'],
    defaultModelId: 'fal-ai/birefnet/v2',
  },
  {
    id: 'inpaint',
    availability: 'ready',
    interaction: 'mask',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: ['fal-ai/flux-pro/v1/fill', 'gemini-3-pro-image', 'gpt-image-2'],
    defaultModelId: 'fal-ai/flux-pro/v1/fill',
  },
  {
    id: 'extract-element',
    availability: 'ready',
    interaction: 'prompt',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: [
      'gpt-image-2',
      'gemini-3-pro-image',
      'fal-ai/sam-3/image',
      'fal-ai/evf-sam',
      'fal-ai/lang-segment-anything',
      'fal-ai/birefnet/v2',
    ],
    defaultModelId: 'gpt-image-2',
  },
  // ⭐ 2026-08-19 E3 建成并提回 ready。默认模型是**实测选出来的**：同一张三
  // 视图 + 同样三条注释，Gemini 与 GPT 都一次改全且无标注痕，但 GPT 把
  // 1672×941 强制成方形并重排了三视图（任务包 §7.11）。
  {
    id: 'object-replace',
    availability: 'ready',
    interaction: 'annotate',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: ['gemini-3-pro-image', 'gpt-image-2'],
    defaultModelId: 'gemini-3-pro-image',
  },
  // ⚠ 仍然零执行路径 —— 别只改这一行就以为它能用（2026-08-18 E0 的教训）。
  {
    id: 'style-transfer',
    availability: 'hidden',
    interaction: 'prompt',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: [],
    defaultModelId: null,
  },
  {
    id: 'text-render',
    availability: 'hidden',
    interaction: 'prompt',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: [],
    defaultModelId: null,
  },
] as const satisfies readonly CanvasImageEditCapability[]

export const READY_CANVAS_IMAGE_EDIT_CAPABILITIES =
  CANVAS_IMAGE_EDIT_CAPABILITIES.filter(
    (capability) => capability.availability === 'ready',
  )

export const HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITIES =
  CANVAS_IMAGE_EDIT_CAPABILITIES.filter(
    (capability) => capability.availability === 'hidden',
  )

const CANVAS_IMAGE_EDIT_CAPABILITY_BY_ID = new Map(
  CANVAS_IMAGE_EDIT_CAPABILITIES.map((capability) => [
    capability.id,
    capability,
  ]),
)

export function getCanvasImageEditCapability(
  id: EditTaskKind,
): (typeof CANVAS_IMAGE_EDIT_CAPABILITIES)[number] {
  const capability = CANVAS_IMAGE_EDIT_CAPABILITY_BY_ID.get(id)

  // The map is constructed from the exhaustive EditTaskKind registry above.
  // This branch protects future edits that add a union member without adding
  // its runtime capability entry.
  if (!capability) {
    throw new Error(`Missing canvas image edit capability: ${id}`)
  }

  return capability
}
