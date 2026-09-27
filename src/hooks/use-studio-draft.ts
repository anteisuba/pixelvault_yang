'use client'

import { useEffect, useRef } from 'react'

import {
  NovelAiCharacterDraftSchema,
  type NovelAiCharacterLayout,
} from '@/types/novelai'

import { isAspectRatio, type AspectRatio } from '@/constants/config'
import { AdvancedParamsSchema, type AdvancedParams } from '@/types'
import { TagPromptBlockSchema } from '@/types/tag-composer'
import { logger } from '@/lib/logger'

export interface StudioDraft {
  prompt: string
  negativePrompt: string
  novelAiLayout?: NovelAiCharacterLayout
  referenceImages: string[]
  /**
   * 比例与清晰度（owner 2026-09-24：刷新后别回到 1:1）。⚠ 两个一起存一起回：
   * 比例只有配上清晰度才是真比例（`studio-operator-apply.ts` 头注②）。
   * 可选 —— 旧草稿没有这两格，照旧只回提示词。
   */
  aspectRatio?: AspectRatio
  resolution?: AdvancedParams['resolution']
}

const EMPTY_DRAFT: StudioDraft = {
  prompt: '',
  negativePrompt: '',
  referenceImages: [],
}

export function useStudioDraft({
  userId,
  enabled,
  draft,
  onRestore,
}: {
  userId: string | null
  enabled: boolean
  draft: StudioDraft
  onRestore: (draft: StudioDraft) => void
}) {
  const loadedUser = useRef<string | null>(null)
  const skipSnapshot = useRef<StudioDraft | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (loadedUser.current === userId) return
    const changingAccount = loadedUser.current !== null
    loadedUser.current = userId
    skipSnapshot.current = draft
    if (changingAccount) onRestore(EMPTY_DRAFT)
    if (!userId) return
    if (
      !changingAccount &&
      (draft.prompt || draft.negativePrompt || draft.referenceImages.length)
    ) {
      skipSnapshot.current = null
      return
    }
    try {
      const raw = sessionStorage.getItem(`pv:studio-image-draft:${userId}`)
      if (!raw) return
      const value: unknown = JSON.parse(raw)
      if (
        typeof value !== 'object' ||
        value === null ||
        !('prompt' in value) ||
        typeof value.prompt !== 'string' ||
        !('negativePrompt' in value) ||
        typeof value.negativePrompt !== 'string' ||
        !('referenceImages' in value) ||
        !Array.isArray(value.referenceImages) ||
        !value.referenceImages.every(
          (url: unknown) => typeof url === 'string' && /^https?:\/\//.test(url),
        )
      )
        return
      const layout = NovelAiCharacterDraftSchema.safeParse(
        'novelAiLayout' in value ? value.novelAiLayout : undefined,
      )
      const aspectRatio =
        'aspectRatio' in value &&
        typeof value.aspectRatio === 'string' &&
        isAspectRatio(value.aspectRatio)
          ? value.aspectRatio
          : undefined
      const resolution = AdvancedParamsSchema.shape.resolution.safeParse(
        'resolution' in value ? value.resolution : undefined,
      )
      /**
       * 画风串 2026-09-27 取消（画师词、风格词就是普通标签）：旧草稿里还带着的那几块，
       * 开着的接在正向标签后面，关着的丢掉。
       */
      const legacyBlocks =
        TagPromptBlockSchema.array().safeParse(
          'promptBlocks' in value ? value.promptBlocks : undefined,
        ).data ?? []
      const prompt = [
        value.prompt,
        ...legacyBlocks
          .filter((block) => block.enabled && block.text.trim())
          .map((block) => block.text.trim()),
      ]
        .filter(Boolean)
        .join(', ')
      onRestore({
        prompt,
        negativePrompt: value.negativePrompt,
        referenceImages: value.referenceImages,
        aspectRatio,
        resolution: resolution.success ? resolution.data : undefined,
        novelAiLayout: layout.success ? layout.data : undefined,
      } as StudioDraft)
    } catch (error) {
      logger.warn('Studio draft restore failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [userId, enabled, draft, onRestore])

  useEffect(() => {
    if (
      !enabled ||
      !userId ||
      loadedUser.current !== userId ||
      skipSnapshot.current === draft
    )
      return
    try {
      sessionStorage.setItem(
        `pv:studio-image-draft:${userId}`,
        JSON.stringify(draft),
      )
    } catch (error) {
      logger.warn('Studio draft save failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [userId, enabled, draft])
}
