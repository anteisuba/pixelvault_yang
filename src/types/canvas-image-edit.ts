import { z } from 'zod'

export const READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS = [
  'upscale',
  'remove-background',
  'inpaint',
  'extract-element',
  'object-replace',
] as const

/**
 * Declared but not executable. `ready` is a promise to the user — the menu
 * shows it, the workspace opens a panel for it, so anything listed there must
 * reach a runtime case.
 *
 * ⚠ 2026-08-18 `object-replace` / `style-transfer` 都因「全仓零执行路径」退到
 * 这里（点开是空面板，E0 真机验底见 `docs/plans/image-edit-line-2026-08-18.md`
 * §3.1）。2026-08-19 E3 把 `object-replace` 连同注释层一起建出来了，已提回
 * `ready`；`style-transfer` 仍然没有执行路径，留在这里。
 */
export const HIDDEN_CANVAS_IMAGE_EDIT_CAPABILITY_IDS = [
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
  /** 多框编号 + 注释清单（E3）——点开要你在图上圈几处并逐条写一句话。 */
  'annotate',
] as const

export const CANVAS_IMAGE_EDIT_OUTPUT_KINDS = ['single-image'] as const

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
