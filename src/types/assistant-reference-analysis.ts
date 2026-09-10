import { z } from 'zod'

import { ASSISTANT_OPERATOR_LIMITS as LIMITS } from '@/constants/assistant-operator'

const NoteSchema = z.string().trim().max(LIMITS.maxPromptChars)
const NotesSchema = z.array(NoteSchema).max(16)
const SourceSchema = z
  .string()
  .url()
  .refine((url) => /^https?:\/\//.test(url))

export const ReferenceVisualFactsSchema = z.object({
  identity: NoteSchema,
  pose: NoteSchema,
  style: z.object({
    rendering: NoteSchema.optional(),
    proportions: NoteSchema,
    contours: NoteSchema,
    shading: NoteSchema,
    materials: NoteSchema,
    palette: NoteSchema,
    lighting: NoteSchema,
  }),
  scene: NoteSchema,
  uncertainties: NotesSchema,
})

export const ReferenceVisualProfileSchema = ReferenceVisualFactsSchema.extend({
  url: SourceSchema,
})
export const ReferenceProfilesSchema = z
  .array(ReferenceVisualProfileSchema)
  .max(LIMITS.maxSnapshotReferences)
export const ReferenceBriefSchema = z.object({
  summary: NoteSchema,
  assignments: z
    .array(
      z.object({
        url: SourceSchema,
        roles: z
          .array(z.enum(['identity', 'pose', 'style', 'content']))
          .min(1)
          .max(4),
        preserve: NotesSchema,
        exclude: NotesSchema,
      }),
    )
    .max(LIMITS.maxSnapshotReferences),
  requirements: NotesSchema,
  avoid: NotesSchema,
  uncertainties: NotesSchema,
})
export const ReferenceAnalysisSchema = z.object({
  profiles: ReferenceProfilesSchema,
  brief: ReferenceBriefSchema.nullable(),
})
export const ReferenceBriefOutputSchema = ReferenceBriefSchema.extend({
  assignments: z
    .array(
      ReferenceBriefSchema.shape.assignments.element
        .omit({ url: true })
        .extend({
          imageIndex: z.number().int().nonnegative(),
        }),
    )
    .max(LIMITS.maxSnapshotReferences),
})
export const ReferenceVisionOutputSchema = z.object({
  images: z
    .array(
      ReferenceVisualFactsSchema.extend({
        style: ReferenceVisualFactsSchema.shape.style.extend({
          rendering: NoteSchema.min(1),
        }),
        imageIndex: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(LIMITS.maxSnapshotReferences),
})
export const ReferencePromptReviewSchema = z.object({
  issues: z.array(z.string().trim().min(1).max(LIMITS.maxPromptChars)).max(8),
})

export type ReferenceVisualProfile = z.infer<
  typeof ReferenceVisualProfileSchema
>
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>
