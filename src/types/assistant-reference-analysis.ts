import { z } from 'zod'

import { ASSISTANT_OPERATOR_LIMITS as LIMITS } from '@/constants/assistant-operator'

const NoteSchema = z.string().trim().max(LIMITS.maxPromptChars)
const NotesSchema = z.array(NoteSchema).max(16)
const SourceSchema = z
  .string()
  .url()
  .refine((url) => /^https?:\/\//.test(url))

/**
 * ⭐ **成像介质是一个判别题不是一句形容**（2026-09-12 真机 bug）：一张平涂赛璐珞
 * 少女图被写成「次世代 3D 卡通渲染」，因为 `rendering` 是自由文本 —— 模型可以
 * 把「动漫脸 + 硬边阴影」顺手说成 3D，而下游的简报与提示词复核读的就是这句话。
 * 收成枚举后，2D / 3D 是一次显式选择，复核也能直接比对。
 * ⚠ 旧 profile 没有这一项（缓存里躺着上一版的分析），所以在 profile 上是可选的；
 * ⛔ 但 vision 那一跳的输出**必须**给 —— 缺省只允许来自历史，不允许来自偷懒。
 */
export const REFERENCE_RENDERING_MEDIUMS = [
  '2d_flat',
  '2d_painterly',
  '3d_stylized',
  '3d_realistic',
  'photo',
  'mixed',
] as const

export const ReferenceRenderingMediumSchema = z.enum(
  REFERENCE_RENDERING_MEDIUMS,
)

export const ReferenceVisualFactsSchema = z.object({
  identity: NoteSchema,
  pose: NoteSchema,
  style: z.object({
    renderingMedium: ReferenceRenderingMediumSchema.optional(),
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
          renderingMedium: ReferenceRenderingMediumSchema,
          rendering: NoteSchema.min(1),
        }),
        imageIndex: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(LIMITS.maxSnapshotReferences),
})
/**
 * 写入后复核的结论（D12 Q3）—— 分两类：
 *  · `issues`：写的人漏掉 / 写错的东西（退回模型重写，⛔ 不问创作者）；
 *  · `conflicts`：创作者的要求与参考图**不能同时成立**（例：要纯 2D，参考是 3D 渲染），
 *    只有这一类才值得问一句。
 */
export const ReferencePromptReviewSchema = z.object({
  issues: z.array(z.string().trim().min(1).max(LIMITS.maxPromptChars)).max(8),
  conflicts: z
    .array(z.string().trim().min(1).max(LIMITS.maxPromptChars))
    .max(4)
    .default([]),
})
export type ReferencePromptReview = z.infer<typeof ReferencePromptReviewSchema>

export type ReferenceVisualProfile = z.infer<
  typeof ReferenceVisualProfileSchema
>
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>
