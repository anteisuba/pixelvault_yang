'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useRouter } from '@/i18n/navigation'
import { toggleGenerationVisibility } from '@/lib/api-client'

type ToggleField = 'isPublic' | 'isPromptPublic' | 'isFeatured'

interface UseGenerationVisibilityOptions {
  generationId: string
  initialIsPublic: boolean
  initialIsPromptPublic: boolean
  initialIsFeatured?: boolean
}

interface UseGenerationVisibilityReturn {
  isPublic: boolean
  isPromptPublic: boolean
  isFeatured: boolean
  togglingField: string | null
  handleToggle: (field: ToggleField) => Promise<void>
}

/**
 * Shared hook for managing generation visibility toggles with optimistic updates.
 * Used by ImageCard and ImageDetailModal.
 */
export function useGenerationVisibility({
  generationId,
  initialIsPublic,
  initialIsPromptPublic,
  initialIsFeatured = false,
}: UseGenerationVisibilityOptions): UseGenerationVisibilityReturn {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [isPromptPublic, setIsPromptPublic] = useState(initialIsPromptPublic)
  const [isFeatured, setIsFeatured] = useState(initialIsFeatured)
  const [togglingField, setTogglingField] = useState<string | null>(null)
  const router = useRouter()
  const t = useTranslations('Toasts')

  const handleToggle = useCallback(
    async (field: ToggleField) => {
      if (togglingField) return
      setTogglingField(field)

      const setterMap = {
        isPublic: setIsPublic,
        isPromptPublic: setIsPromptPublic,
        isFeatured: setIsFeatured,
      }
      const prevMap = { isPublic, isPromptPublic, isFeatured }
      const setter = setterMap[field]
      const prev = prevMap[field]

      // Optimistic update
      setter(!prev)

      const result = await toggleGenerationVisibility(generationId, field)
      if (!result.success) {
        // Rollback on failure
        setter(prev)
        const errorMsg =
          result.error === 'MAX_FEATURED_EXCEEDED'
            ? t('featuredLimitReached')
            : field === 'isFeatured'
              ? t('featuredFailed')
              : t('visibilityFailed')
        toast.error(errorMsg)
      } else {
        if (result.data) {
          setIsPublic(result.data.isPublic)
          setIsPromptPublic(result.data.isPromptPublic)
          if (result.data.isFeatured !== undefined) {
            setIsFeatured(result.data.isFeatured)
          }
        }
        toast.success(
          field === 'isFeatured'
            ? t(!prev ? 'featuredAdded' : 'featuredRemoved')
            : t('visibilityUpdated'),
        )
        router.refresh()
      }
      setTogglingField(null)
    },
    [
      togglingField,
      isPublic,
      isPromptPublic,
      isFeatured,
      generationId,
      router,
      t,
    ],
  )

  return { isPublic, isPromptPublic, isFeatured, togglingField, handleToggle }
}
