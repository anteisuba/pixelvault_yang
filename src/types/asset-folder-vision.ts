import { z } from 'zod'

import {
  ASSISTANT_FOLDER_VISION_RELEVANCES,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
} from '@/constants/assistant-operator'

const FolderIdSchema = z.string().trim().min(1).max(LIMITS.maxIdChars)
const FolderLabelSchema = z.string().trim().min(1).max(LIMITS.maxLabelChars)

export const AssistantAssetFolderCandidateSchema = z.object({
  folderId: FolderIdSchema,
  name: FolderLabelSchema,
  path: z.string().trim().min(1).max(LIMITS.maxPromptChars),
  imageCount: z.number().int().nonnegative(),
})

export type AssistantAssetFolderCandidate = z.infer<
  typeof AssistantAssetFolderCandidateSchema
>

/** 视觉模型对一张输入图的结构化观察；imageIndex 是当前批次的 0-based 下标。 */
export const AssistantAssetFolderVisionItemOutputSchema = z.object({
  imageIndex: z
    .number()
    .int()
    .nonnegative()
    .max(LIMITS.maxFolderVisionBatchImages - 1),
  observation: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.maxFolderVisionObservationChars),
  relevance: z.enum(ASSISTANT_FOLDER_VISION_RELEVANCES),
  reason: z.string().trim().min(1).max(LIMITS.maxFolderVisionReasonChars),
  tags: z
    .array(z.string().trim().min(1).max(LIMITS.maxFolderVisionTagChars))
    .max(LIMITS.maxFolderVisionTags),
})

/** 单次（最多 8 张）视觉补全的模型输出。批次覆盖完整性由 service 按实到数量校验。 */
export const AssistantAssetFolderVisionBatchOutputSchema = z.object({
  items: z
    .array(AssistantAssetFolderVisionItemOutputSchema)
    .min(1)
    .max(LIMITS.maxFolderVisionBatchImages),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.maxFolderVisionBatchSummaryChars),
  uncertainties: z
    .array(z.string().trim().min(1).max(LIMITS.maxFolderVisionReasonChars))
    .max(LIMITS.maxFolderVisionUncertainties),
})

export type AssistantAssetFolderVisionBatchOutput = z.infer<
  typeof AssistantAssetFolderVisionBatchOutputSchema
>

export const AssistantAssetFolderVisionFindingSchema = z.object({
  assetId: FolderIdSchema,
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  observation: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.maxFolderVisionObservationChars),
  relevance: z.enum(ASSISTANT_FOLDER_VISION_RELEVANCES),
  reason: z.string().trim().min(1).max(LIMITS.maxFolderVisionReasonChars),
  tags: z
    .array(z.string().trim().min(1).max(LIMITS.maxFolderVisionTagChars))
    .max(LIMITS.maxFolderVisionTags),
})

export type AssistantAssetFolderVisionFinding = z.infer<
  typeof AssistantAssetFolderVisionFindingSchema
>

export const AssistantAssetFolderVisionResultSchema = z.object({
  folder: AssistantAssetFolderCandidateSchema,
  totalImages: z.number().int().nonnegative(),
  inspectedImages: z
    .number()
    .int()
    .nonnegative()
    .max(LIMITS.maxFolderVisionImages),
  truncated: z.boolean(),
  batchCount: z
    .number()
    .int()
    .nonnegative()
    .max(
      Math.ceil(
        LIMITS.maxFolderVisionImages / LIMITS.maxFolderVisionBatchImages,
      ),
    ),
  findings: z
    .array(AssistantAssetFolderVisionFindingSchema)
    .max(LIMITS.maxFolderVisionImages),
  batchSummaries: z
    .array(
      z.string().trim().min(1).max(LIMITS.maxFolderVisionBatchSummaryChars),
    )
    .max(
      Math.ceil(
        LIMITS.maxFolderVisionImages / LIMITS.maxFolderVisionBatchImages,
      ),
    ),
  uncertainties: z
    .array(z.string().trim().min(1).max(LIMITS.maxFolderVisionReasonChars))
    .max(
      Math.ceil(
        LIMITS.maxFolderVisionImages / LIMITS.maxFolderVisionBatchImages,
      ) * LIMITS.maxFolderVisionUncertainties,
    ),
  visionAdapter: FolderLabelSchema.nullable(),
  borrowedVisionRoute: z.boolean(),
})

export type AssistantAssetFolderVisionResult = z.infer<
  typeof AssistantAssetFolderVisionResultSchema
>
