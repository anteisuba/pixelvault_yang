'use client'

import { useCallback, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { z } from 'zod'

import { IMAGE_GENERATION } from '@/constants/config'
import { MODEL_3D_MULTIVIEW_CACHE } from '@/constants/model-3d-generation'
import type { MultiViewImageRecord, MultiViewGenerateRequest } from '@/types'
import { checkMultiViewStatusAPI, generateMultiViewAPI } from '@/lib/api-client'

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

// Cache key includes the Clerk userId so two accounts on the same
// browser never collide on `imageUrl`-keyed entries. Pre-isolation
// behaviour: A uploads an image, generates multi-view; B uploads the
// same image, hits A's cache and ends up rendering A's R2 URLs.
function getCacheKey(
  params: MultiViewGenerateRequest,
  clerkId: string,
): string {
  const sourceKey = params.sourceGenerationId ?? params.imageUrl
  const modelKey = params.modelId ?? MODEL_3D_MULTIVIEW_CACHE.DEFAULT_MODEL_KEY
  return `${MODEL_3D_MULTIVIEW_CACHE.STORAGE_KEY_PREFIX}:${clerkId}:${modelKey}:${stableHash(sourceKey)}`
}

function readCachedViews(
  params: MultiViewGenerateRequest,
  clerkId: string,
): MultiViewImageRecord[] | null {
  if (typeof window === 'undefined') return null

  const cacheKey = getCacheKey(params, clerkId)
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
  clerkId: string,
) {
  if (typeof window === 'undefined' || views.length === 0) return

  try {
    window.localStorage.setItem(
      getCacheKey(params, clerkId),
      JSON.stringify({
        createdAt: Date.now(),
        views,
      }),
    )
  } catch {
    // Cache is an optimization only; generation still works without it.
  }
}

function removeCachedViews(params: MultiViewGenerateRequest, clerkId: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(getCacheKey(params, clerkId))
  } catch {
    // Cache is an optimization only; generation still works without it.
  }
}

function waitForPollInterval(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Generate 3 alternate camera angles (back / left / right) of a source image
 * via the worker-backed reference-edit chain. Partial results are not failures
 * because Hunyuan can still use whichever side views completed.
 */
export function useGenerateMultiView(): UseGenerateMultiViewReturn {
  const [isGenerating, setIsGenerating] = useState(false)
  const [views, setViews] = useState<MultiViewImageRecord[]>([])
  const t = useTranslations('MultiViewGenerate')
  // Clerk scopes every cache slot. While Clerk is still loading or the
  // user is signed out, restore() returns false and generate() skips
  // cache reads/writes — better to round-trip the API than to leak
  // another account's R2 URLs through a shared imageUrl key.
  const { isLoaded, userId } = useAuth()
  const activeClerkId: string | null = isLoaded ? userId : null

  const restore = useCallback(
    (params: MultiViewGenerateRequest) => {
      if (activeClerkId === null) return false
      const cachedViews = readCachedViews(params, activeClerkId)
      if (!cachedViews) return false
      setViews(cachedViews)
      return true
    },
    [activeClerkId],
  )

  const generate = useCallback(
    async (
      params: MultiViewGenerateRequest,
      options?: GenerateMultiViewOptions,
    ): Promise<MultiViewImageRecord[]> => {
      if (options?.force) {
        if (activeClerkId !== null) removeCachedViews(params, activeClerkId)
        setViews([])
      } else if (activeClerkId !== null) {
        const cachedViews = readCachedViews(params, activeClerkId)
        if (cachedViews) {
          setViews(cachedViews)
          return cachedViews
        }
      }

      setIsGenerating(true)
      try {
        const response = await generateMultiViewAPI(params)
        if (response.success && response.data) {
          const jobIds = response.data.jobs.map((job) => job.jobId)
          for (
            let attempt = 1;
            attempt <= IMAGE_GENERATION.MAX_POLL_ATTEMPTS;
            attempt += 1
          ) {
            await waitForPollInterval(IMAGE_GENERATION.POLL_INTERVAL_MS)

            const statusResponse = await checkMultiViewStatusAPI(
              response.data.batchId,
              jobIds,
            )
            if (!statusResponse.success || !statusResponse.data) {
              toast.error(statusResponse.error ?? t('failed'))
              return []
            }

            if (statusResponse.data.status === 'IN_PROGRESS') {
              continue
            }

            if (statusResponse.data.status === 'FAILED') {
              toast.error(statusResponse.error ?? t('failed'))
              return []
            }

            const completedViews = statusResponse.data.views
            setViews(completedViews)
            if (activeClerkId !== null) {
              writeCachedViews(params, completedViews, activeClerkId)
            }
            if (completedViews.length < 3) {
              toast.warning(
                t('partialSuccess', { count: completedViews.length }),
              )
            } else {
              toast.success(t('success'))
            }
            return completedViews
          }

          toast.error(t('failed'))
          return []
        }
        toast.error(response.error ?? t('failed'))
        return []
      } finally {
        setIsGenerating(false)
      }
    },
    [activeClerkId, t],
  )

  const reset = useCallback(() => {
    setViews([])
  }, [])

  return { isGenerating, views, generate, restore, reset }
}
