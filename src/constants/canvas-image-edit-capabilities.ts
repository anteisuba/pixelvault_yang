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
    models: [
      'fal-ai/flux-pro/v1/fill',
      'gemini-3-pro-image-preview',
      'gpt-image-2',
    ],
    defaultModelId: 'fal-ai/flux-pro/v1/fill',
  },
  {
    id: 'outpaint',
    availability: 'ready',
    interaction: 'outpaint',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: ['fal-ai/image-apps-v2/outpaint', 'gemini-3-pro-image-preview'],
    defaultModelId: 'fal-ai/image-apps-v2/outpaint',
  },
  {
    id: 'decompose',
    availability: 'ready',
    interaction: 'layers',
    input: SINGLE_IMAGE_INPUT,
    output: 'image-layers',
    models: ['xiuruisu/see-through'],
    defaultModelId: 'xiuruisu/see-through',
  },
  {
    id: 'extract-element',
    availability: 'ready',
    interaction: 'prompt',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: [
      'gpt-image-2',
      'gemini-3-pro-image-preview',
      'fal-ai/sam-3/image',
      'fal-ai/evf-sam',
      'fal-ai/lang-segment-anything',
      'fal-ai/birefnet/v2',
    ],
    defaultModelId: 'gpt-image-2',
  },
  {
    id: 'object-replace',
    availability: 'hidden',
    interaction: 'prompt',
    input: SINGLE_IMAGE_INPUT,
    output: 'single-image',
    models: [],
    defaultModelId: null,
  },
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
