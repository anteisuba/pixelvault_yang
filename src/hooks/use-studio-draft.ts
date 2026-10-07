'use client'

import { useEffect, useRef } from 'react'
import { z } from 'zod'

import {
  isAspectRatio,
  VIDEO_GENERATION,
  type AspectRatio,
} from '@/constants/config'
import {
  DEFAULT_IMAGE_BATCH_COUNT,
  isImageBatchCount,
  type ImageBatchCount,
} from '@/constants/studio'
import {
  NovelAiCharacterDraftSchema,
  NovelAiSceneTextDraftsSchema,
} from '@/types/novelai'
import { TagChipListSchema } from '@/types/tag-composer'
import { AdvancedParamsSchema, RecipeUsageSchema } from '@/types'
import type { AssistantWorkspace } from '@/types/assistant-workspace'
import { logger } from '@/lib/logger'

export type StudioDraftWorkspace = Extract<
  AssistantWorkspace,
  'image-natural' | 'image-tags' | 'video'
>

const ReferenceUrlSchema = z.string().regex(/^https?:\/\//)
const StudioDraftSchema = z.object({
  prompt: z.string().default(''),
  advancedParams: AdvancedParamsSchema.extend({
    novelAiLayout: NovelAiCharacterDraftSchema.optional(),
    novelAiSceneTexts: NovelAiSceneTextDraftsSchema.optional(),
    resolution: AdvancedParamsSchema.shape.resolution.catch(undefined),
  }).default({}),
  /** 「先搜再画」按会话记：同一个标签页刷新后仍是开。 */
  searchGrounding: z.boolean().catch(false).default(false),
  aspectRatio: z
    .custom<AspectRatio>(
      (value) => typeof value === 'string' && isAspectRatio(value),
    )
    .catch('1:1'),
  selectedOptionId: z.string().nullable().default(null),
  modelSelectionTouched: z.boolean().default(false),
  imageBatchCount: z
    .custom<ImageBatchCount>(
      (value) => typeof value === 'number' && isImageBatchCount(value),
    )
    .default(DEFAULT_IMAGE_BATCH_COUNT),
  extraModelOptionIds: z.array(z.string()).default([]),
  recipeUsage: RecipeUsageSchema.nullable().default(null),
  workflowMode: z.enum(['quick', 'card']).default('quick'),
  tagChips: TagChipListSchema.default([]),
  tagNegativeChips: TagChipListSchema.default([]),
  referenceImages: z.array(ReferenceUrlSchema).default([]),
  videoDuration: z
    .number()
    .positive()
    .default(VIDEO_GENERATION.DEFAULT_DURATION),
  videoResolution: z.string().nullable().default(null),
  videoAudioRefs: z
    .array(
      z.object({
        id: z.string(),
        url: ReferenceUrlSchema,
        fileName: z.string(),
        ownerName: z.string().optional(),
      }),
    )
    .default([]),
  videoFrameSlots: z
    .object({
      first: ReferenceUrlSchema.nullable(),
      last: ReferenceUrlSchema.nullable(),
    })
    .default({ first: null, last: null }),
  videoReferenceVideos: z.array(ReferenceUrlSchema).default([]),
  videoGenerateAudio: z.boolean().nullable().default(null),
  longVideoMode: z.boolean().default(false),
  longVideoTargetDuration: z
    .number()
    .positive()
    .default(VIDEO_GENERATION.LONG_VIDEO_DURATION_OPTIONS[1]),
})

export type StudioDraft = z.infer<typeof StudioDraftSchema>
export const EMPTY_STUDIO_DRAFT: StudioDraft = StudioDraftSchema.parse({})

export function useStudioDraft({
  userId,
  workspace,
  enabled,
  draft,
  onRestore,
}: {
  userId: string | null
  workspace: StudioDraftWorkspace
  enabled: boolean
  draft: StudioDraft
  onRestore: (draft: StudioDraft, applyTransfer: boolean) => void
}) {
  const loaded = useRef<{
    key: string
    userId: string | null
    workspace: StudioDraftWorkspace
  } | null>(null)
  const drafts = useRef(new Map<string, StudioDraft>())
  const skipSnapshot = useRef<StudioDraft | null>(null)

  useEffect(() => {
    if (!enabled || (!userId && !loaded.current)) return
    const key = `pv:studio-draft:${workspace}:${userId ?? 'anonymous'}`
    const previous = loaded.current
    if (previous?.key !== key) {
      loaded.current = { key, userId, workspace }
      skipSnapshot.current = draft
      const initial =
        !previous ||
        (previous.userId === null && previous.workspace === workspace)
      if (
        initial &&
        (draft.prompt ||
          draft.advancedParams.negativePrompt ||
          draft.referenceImages.length)
      ) {
        drafts.current.set(key, draft)
        skipSnapshot.current = null
      } else {
        let restored = drafts.current.get(key)
        if (!restored && userId) {
          try {
            const raw = sessionStorage.getItem(key)
            const parsed = raw
              ? StudioDraftSchema.safeParse(JSON.parse(raw))
              : null
            if (parsed?.success) restored = parsed.data
          } catch (error) {
            logger.warn('Studio draft restore failed', {
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
        restored ??= EMPTY_STUDIO_DRAFT
        drafts.current.set(key, restored)
        onRestore(
          restored,
          Boolean(
            previous &&
            previous.userId === userId &&
            previous.workspace !== workspace,
          ),
        )
        return
      }
    }
    if (skipSnapshot.current === draft) return
    drafts.current.set(key, draft)
    if (!userId) return
    try {
      sessionStorage.setItem(key, JSON.stringify(draft))
    } catch (error) {
      logger.warn('Studio draft save failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [userId, workspace, enabled, draft, onRestore])
}
