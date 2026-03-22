'use client'

import { useState, useCallback, useEffect } from 'react'
import type { StoryListItem, StoryRecord, NarrativeTone } from '@/types'
import {
  listStoriesAPI,
  createStoryAPI,
  getStoryAPI,
  updateStoryAPI,
  deleteStoryAPI,
  reorderPanelsAPI,
  generateNarrativeAPI,
} from '@/lib/api-client'

export function useStoryList() {
  const [stories, setStories] = useState<StoryListItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await listStoriesAPI()
    if (result.success && result.data) {
      setStories(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createStory = useCallback(
    async (title: string, generationIds: string[]) => {
      const result = await createStoryAPI({ title, generationIds })
      if (result.success) {
        await refresh()
      }
      return result
    },
    [refresh],
  )

  const removeStory = useCallback(async (id: string) => {
    const result = await deleteStoryAPI(id)
    if (result.success) {
      setStories((prev) => prev.filter((s) => s.id !== id))
    }
    return result
  }, [])

  return { stories, loading, refresh, createStory, removeStory }
}

export function useStoryEditor(storyId: string) {
  const [story, setStory] = useState<StoryRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getStoryAPI(storyId).then((result) => {
      if (result.success && result.data) {
        setStory(result.data)
      }
      setLoading(false)
    })
  }, [storyId])

  const updateStory = useCallback(
    async (data: {
      title?: string
      displayMode?: 'scroll' | 'comic'
      isPublic?: boolean
    }) => {
      const result = await updateStoryAPI(storyId, data)
      if (result.success && result.data) {
        setStory(result.data)
      }
      return result
    },
    [storyId],
  )

  const generateNarrative = useCallback(
    async (tone: NarrativeTone) => {
      setIsGeneratingNarrative(true)
      setError(null)
      const result = await generateNarrativeAPI(storyId, { tone })

      if (result.success && result.data) {
        // Refresh story to get updated panels
        const refreshed = await getStoryAPI(storyId)
        if (refreshed.success && refreshed.data) {
          setStory(refreshed.data)
        }
      } else {
        setError(result.error ?? 'Failed to generate narrative')
      }

      setIsGeneratingNarrative(false)
      return result
    },
    [storyId],
  )

  const reorderPanels = useCallback(
    async (panelIds: string[]) => {
      const result = await reorderPanelsAPI(storyId, panelIds)
      if (result.success && result.data) {
        setStory(result.data)
      }
      return result
    },
    [storyId],
  )

  return {
    story,
    loading,
    isGeneratingNarrative,
    error,
    updateStory,
    generateNarrative,
    reorderPanels,
  }
}
