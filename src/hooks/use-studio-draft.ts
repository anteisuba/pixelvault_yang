'use client'

import { useEffect, useRef } from 'react'

import {
  NovelAiCharacterDraftSchema,
  type NovelAiCharacterLayout,
} from '@/types/novelai'

import { TagPromptBlockSchema, type TagPromptBlock } from '@/types/tag-composer'
import { logger } from '@/lib/logger'

export interface StudioDraft {
  promptBlocks?: TagPromptBlock[]
  prompt: string
  negativePrompt: string
  novelAiLayout?: NovelAiCharacterLayout
  referenceImages: string[]
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
      onRestore({
        ...value,
        promptBlocks: TagPromptBlockSchema.array().safeParse(
          'promptBlocks' in value ? value.promptBlocks : undefined,
        ).data,
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
