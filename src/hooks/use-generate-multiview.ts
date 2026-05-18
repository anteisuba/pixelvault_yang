'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { z } from 'zod'

import { MODEL_3D_MULTIVIEW_CACHE } from '@/constants/model-3d-generation'
import type { MultiViewImageRecord, MultiViewGenerateRequest } from '@/types'
import { generateMultiViewAPI } from '@/lib/api-client'

const MultiViewCacheEntrySchema = z.object({
  createdAt: z.number(),
  views: z.array(
    z.object({
      id: z.string(),
      view: z.enum(['back', 'left', 'right']),
      url: z.string().url(),
      width: z.number(),
      height: z.number(),
      prompt: z.string(),
      model: z.string(),
      provider: z.string(),
    }),
  ),
})

interface UseGenerateMultiViewReturn {
  isGenerating: boolean
  /** Newly generated views, in stable order [back, left, right]. */
  views: MultiViewImageRecord[]
  generate: (
    params: MultiViewGenerateRequest,
    options?: GenerateMultiViewOptions,
  ) => Promise<MultiViewImageRecord[]>
  restore: (params: MultiViewGenerateRequest) => boolean
  reset: () => void
}

interface GenerateMultiViewOptions {
  force?: boolean
}

function stableHash(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function getCacheKey(params: MultiViewGenerateRequest): string {
  const sourceKey = params.sourceGenerationId ?? params.imageUrl
  const modelKey = params.modelId ?? MODEL_3D_MULTIVIEW_CACHE.DEFAULT_MODEL_KEY
  return `${MODEL_3D_MULTIVIEW_CACHE.STORAGE_KEY_PREFIX}:${modelKey}:${stableHash(sourceKey)}`
}

function readCachedViews(
  params: MultiViewGenerateRequest,
): MultiViewImageRecord[] | null {
  if (typeof window === 'undefined') return null

  const cacheKey = getCacheKey(params)
  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return null

    const value: unknown = JSON.parse(raw)
    const parsed = MultiViewCacheEntrySchema.safeParse(value)
    if (!parsed.success) {
      window.localStorage.removeItem(cacheKey)
      return null
    }

    if (Date.now() - parsed.data.createdAt > MODEL_3D_MULTIVIEW_CACHE.TTL_MS) {
      window.localStorage.removeItem(cacheKey)
      return null
    }

    return parsed.data.views
  } catch {
    return null
  }
}

function writeCachedViews(
  params: MultiViewGenerateRequest,
  views: MultiViewImageRecord[],
) {
  if (typeof window === 'undefined' || views.length === 0) return

  try {
    window.localStorage.setItem(
      getCacheKey(params),
      JSON.stringify({
        createdAt: Date.now(),
        views,
      }),
    )
  } catch {
    // Cache is an optimization only; generation still works without it.
  }
}

function removeCachedViews(params: MultiViewGenerateRequest) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(getCacheKey(params))
  } catch {
    // Cache is an optimization only; generation still works without it.
  }
}

/**
 * Generate 3 alternate camera angles (back / left / right) of a source image
 * via the reference-edit chain. Returns temporary provider URLs; partial
 * results are not failures because Hunyuan can still use whichever side
 * views completed.
 */
export function useGenerateMultiView(): UseGenerateMultiViewReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [views, setViews] = useState<MultiViewImageRecord[]>([])
  const t = useTranslations('MultiViewGenerate')

  const restore = useCallback((params: MultiViewGenerateRequest) => {
    const cachedViews = readCachedViews(params)
    if (!cachedViews) return false
    setViews(cachedViews)
    return true
  }, [])

  const generate = useCallback(
    async (
      params: MultiViewGenerateRequest,
      options?: GenerateMultiViewOptions,
    ): Promise<MultiViewImageRecord[]> => {
      if (options?.force) {
        removeCachedViews(params)
        setViews([])
      } else {
        const cachedViews = readCachedViews(params)
        if (cachedViews) {
          setViews(cachedViews)
          return cachedViews
        }
      }

      setIsGenerating(true)
      try {
        const response = await generateMultiViewAPI(params)
        if (response.success && response.data) {
          setViews(response.data.views)
          writeCachedViews(params, response.data.views)
          if (response.data.views.length < 3) {
            toast.warning(
              t('partialSuccess', { count: response.data.views.length }),
            )
          } else {
            toast.success(t('success'))
          }
          return response.data.views
        }
        toast.error(response.error ?? t('failed'))
        return []
      } finally {
        setIsGenerating(false)
      }
    },
    [t],
  )

  const reset = useCallback(() => {
    setViews([])
  }, [])

  return { isGenerating, views, generate, restore, reset }
}
