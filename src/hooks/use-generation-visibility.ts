'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useRouter } from '@/i18n/navigation'
import { toggleGenerationVisibility } from '@/lib/api-client'

interface UseGenerationVisibilityOptions {
  generationId: string
  initialIsPublic: boolean
  initialIsPromptPublic: boolean
}

interface UseGenerationVisibilityReturn {
  isPublic: boolean
  isPromptPublic: boolean
  togglingField: string | null
  handleToggle: (field: 'isPublic' | 'isPromptPublic') => Promise<void>
}

/**
 * Shared hook for managing generation visibility toggles with optimistic updates.
 * Used by ImageCard and ImageDetailModal.
 */
export function useGenerationVisibility({
  generationId,
  initialIsPublic,
  initialIsPromptPublic,
}: UseGenerationVisibilityOptions): UseGenerationVisibilityReturn {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [isPromptPublic, setIsPromptPublic] = useState(initialIsPromptPublic)
  const [togglingField, setTogglingField] = useState<string | null>(null)
  const router = useRouter()
  const t = useTranslations('Toasts')

  const handleToggle = useCallback(
    async (field: 'isPublic' | 'isPromptPublic') => {
      if (togglingField) return
      setTogglingField(field)

      const setter = field === 'isPublic' ? setIsPublic : setIsPromptPublic
      const prev = field === 'isPublic' ? isPublic : isPromptPublic

      // Optimistic update
      setter(!prev)

      const result = await toggleGenerationVisibility(generationId, field)
      if (!result.success) {
        // Rollback on failure
        setter(prev)
        toast.error(t('visibilityFailed'))
      } else {
        if (result.data) {
          setIsPublic(result.data.isPublic)
          setIsPromptPublic(result.data.isPromptPublic)
        }
        toast.success(t('visibilityUpdated'))
        router.refresh()
      }
      setTogglingField(null)
    },
    [togglingField, isPublic, isPromptPublic, generationId, router, t],
  )

  return { isPublic, isPromptPublic, togglingField, handleToggle }
}
