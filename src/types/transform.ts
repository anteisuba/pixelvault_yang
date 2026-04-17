/**
 * Image Transform types — Zod schemas + TypeScript types.
 *
 * Defines the full 5-dimension transformation system (style / pose / background /
 * garment / detail). Phase 1 only implements `style`; the schema accepts all
 * dimensions for type safety but runtime validation rejects non-style types.
 *
 * @see 02-功能/功能-路線決策結論書.md §4 for full spec
 * @see 02-功能/功能-實作落地清單.md §1.1 for implementation plan
 */

import { z } from 'zod'

// ─── Enums ──────────────────────────────────────────────────────

export const TransformationTypeSchema = z.enum([
  'style',
  'pose',
  'background',
  'garment',
  'detail',
])
export type TransformationType = z.infer<typeof TransformationTypeSchema>

export const SubjectTypeSchema = z.enum([
  'upload',
  'subject_card',
  'character_card',
])
export type SubjectType = z.infer<typeof SubjectTypeSchema>

export const InputTypeSchema = z.enum(['image', 'video_frame'])
export type InputType = z.infer<typeof InputTypeSchema>

// ─── Sub-schemas ────────────────────────────────────────────────

export const TransformInputSourceSchema = z.object({
  type: InputTypeSchema.default('image'),
  data: z.string().min(1, 'Input data is required'),
})
export type TransformInputSource = z.infer<typeof TransformInputSourceSchema>

export const TransformSubjectSchema = z.object({
  type: SubjectTypeSchema.default('upload'),
  imageData: z.string().optional(),
  cardId: z.string().optional(),
})
export type TransformSubject = z.infer<typeof TransformSubjectSchema>

export const TransformStyleSchema = z.object({
  type: z.enum(['style_card', 'preset']),
  cardId: z.string().optional(),
  presetId: z.string().optional(),
})
export type TransformStyle = z.infer<typeof TransformStyleSchema>

export const TransformationSchema = z.object({
  type: TransformationTypeSchema,
  params: z.record(z.string(), z.unknown()).optional(),
})
export type Transformation = z.infer<typeof TransformationSchema>

export const PreservationSchema = z.object({
  structure: z.number().min(0).max(1).default(0.7),
  text: z.number().min(0).max(1).default(0.9),
  composition: z.number().min(0).max(1).default(0.6),
  people: z.number().min(0).max(1).default(0.7),
})
export type Preservation = z.infer<typeof PreservationSchema>

// ─── Input (request body) ───────────────────────────────────────

export const TransformInputSchema = z
  .object({
    input: TransformInputSourceSchema,
    subject: TransformSubjectSchema,
    style: TransformStyleSchema,
    transformation: TransformationSchema,
    preservation: PreservationSchema.default({
      structure: 0.7,
      text: 0.9,
      composition: 0.6,
      people: 0.7,
    }),
    variants: z.union([z.literal(1), z.literal(4)]).default(4),
  })
  .refine(
    (data) => {
      // Phase 1: only 'style' is implemented
      if (data.transformation.type !== 'style') {
        return false
      }
      return true
    },
    {
      message:
        'Only "style" transformation is currently supported. Other types (pose, background, garment, detail) will be available in future phases.',
      path: ['transformation', 'type'],
    },
  )
  .refine(
    (data) => {
      // Phase 1: only 'upload' subject type is implemented
      if (data.subject.type !== 'upload') {
        return false
      }
      return true
    },
    {
      message:
        'Only "upload" subject type is currently supported. Card-based subjects will be available in future phases.',
      path: ['subject', 'type'],
    },
  )
  .refine(
    (data) => {
      // Phase 1: only 'image' input type is implemented
      if (data.input.type !== 'image') {
        return false
      }
      return true
    },
    {
      message:
        'Only "image" input type is currently supported. Video frame support will be available in future phases.',
      path: ['input', 'type'],
    },
  )
  .refine(
    (data) => {
      // Validate subject has imageData when type is 'upload'
      if (data.subject.type === 'upload' && !data.subject.imageData) {
        return false
      }
      return true
    },
    {
      message: 'imageData is required when subject type is "upload"',
      path: ['subject', 'imageData'],
    },
  )
  .refine(
    (data) => {
      // Validate style has cardId or presetId
      if (data.style.type === 'style_card' && !data.style.cardId) {
        return false
      }
      if (data.style.type === 'preset' && !data.style.presetId) {
        return false
      }
      return true
    },
    {
      message: 'cardId is required for style_card, presetId for preset',
      path: ['style'],
    },
  )

export type TransformInput = z.infer<typeof TransformInputSchema>

// ─── Output (response body) ─────────────────────────────────────

export const TransformVariantResultSchema = z.object({
  status: z.enum(['success', 'failed']),
  result: z
    .object({
      url: z.string().url(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      cost: z.number().int().nonnegative(),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      i18nKey: z.string(),
      retryable: z.boolean(),
      displayMessage: z.string(),
    })
    .optional(),
})
export type TransformVariantResult = z.infer<
  typeof TransformVariantResultSchema
>

export const TransformOutputSchema = z.object({
  original: z.object({
    url: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  variants: z.array(TransformVariantResultSchema),
  totalCost: z.number().int().nonnegative(),
})
export type TransformOutput = z.infer<typeof TransformOutputSchema>

// ─── Preservation Presets (Light / Medium / Heavy) ──────────────

export const PRESERVATION_PRESETS = {
  light: { structure: 0.8, text: 0.95, composition: 0.8, people: 0.9 },
  medium: { structure: 0.6, text: 0.8, composition: 0.6, people: 0.7 },
  heavy: { structure: 0.3, text: 0.5, composition: 0.3, people: 0.4 },
} as const satisfies Record<string, Preservation>

export type PreservationPresetId = keyof typeof PRESERVATION_PRESETS
