import { z } from 'zod'

export const READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS = [
  'upscale',
  'remove-background',
  'inpaint',
  'outpaint',
  'decompose',
  'extract-element',
] as const

export const HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITY_IDS = [
  'object-replace',
  'style-transfer',
  'text-render',
] as const

export const CANVAS_IMAGE_EDIT_CAPABILITY_IDS = [
  ...READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
  ...HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
] as const

export const CANVAS_IMAGE_EDIT_AVAILABILITIES = ['ready', 'hidden'] as const

export const CANVAS_IMAGE_EDIT_INTERACTIONS = [
  'instant',
  'prompt',
  'mask',
  'outpaint',
  'layers',
] as const

export const CANVAS_IMAGE_EDIT_OUTPUT_KINDS = [
  'single-image',
  'image-layers',
] as const

export const EditTaskKindSchema = z.enum(CANVAS_IMAGE_EDIT_CAPABILITY_IDS)
export const ReadyCanvasImageEditCapabilityIdSchema = z.enum(
  READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS,
)

export const CanvasImageEditCapabilitySchema = z.object({
  id: EditTaskKindSchema,
  availability: z.enum(CANVAS_IMAGE_EDIT_AVAILABILITIES),
  interaction: z.enum(CANVAS_IMAGE_EDIT_INTERACTIONS),
  input: z.object({
    minImages: z.literal(1),
    maxImages: z.literal(1),
  }),
  output: z.enum(CANVAS_IMAGE_EDIT_OUTPUT_KINDS),
  models: z.array(z.string().trim().min(1)),
  defaultModelId: z.string().trim().min(1).nullable(),
})

/**
 * A completed edit result ready to become a new loose image node. The source
 * image is intentionally not part of this contract: `placeDerivedImages`
 * resolves it from `sourceNodeId`, which keeps lineage and placement atomic.
 */
export const CanvasDerivedImageOutputSchema = z.object({
  imageUrl: z.string().trim().min(1).max(4000),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  generationId: z.string().trim().min(1).max(160).optional(),
  label: z.string().trim().min(1).max(160).optional(),
  editCapability: ReadyCanvasImageEditCapabilityIdSchema,
  /** One operation id for a multi-layer result. Used for atomic placement and undo. */
  batchId: z.string().trim().min(1).max(160).optional(),
  /** The source generation that produced this derived result, when known. */
  sourceGenerationId: z.string().trim().min(1).max(160).optional(),
})

export const CanvasDerivedImageOutputsSchema = z
  .array(CanvasDerivedImageOutputSchema)
  .min(1)

export type EditTaskKind = z.infer<typeof EditTaskKindSchema>
export type ReadyCanvasImageEditCapabilityId = z.infer<
  typeof ReadyCanvasImageEditCapabilityIdSchema
>
export type CanvasImageEditCapability = z.infer<
  typeof CanvasImageEditCapabilitySchema
>
export type CanvasDerivedImageOutput = z.infer<
  typeof CanvasDerivedImageOutputSchema
>
