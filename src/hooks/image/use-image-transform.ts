'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { transformImageAPI } from '@/lib/api-client'
import { toastError, toastSuccess } from '@/lib/toast'
import type {
  TransformInput,
  TransformOutput,
  TransformVariantResult,
} from '@/types/transform'

// ─── Types ──────────────────────────────────────────────────────

export type TransformStatus = 'idle' | 'transforming' | 'done' | 'error'

export interface UseImageTransformReturn {
  status: TransformStatus
  output: TransformOutput | null
  error: string | null
  submit: (input: TransformInput) => Promise<void>
  retryVariant: (index: number) => Promise<void>
  reset: () => void
}

// ─── Hook ───────────────────────────────────────────────────────

export function useImageTransform(): UseImageTransformReturn {
  const t = useTranslations('Transform')

  const [status, setStatus] = useState<TransformStatus>('idle')
  const [output, setOutput] = useState<TransformOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastInput, setLastInput] = useState<TransformInput | null>(null)

  const submit = useCallback(
    async (input: TransformInput) => {
      setStatus('transforming')
      setError(null)
      setLastInput(input)

      const response = await transformImageAPI(input)

      if (!response.success || !response.data) {
        setStatus('error')
        setError(response.error ?? t('errors.allFailed'))
        toastError(
          response.i18nKey
            ? t(response.i18nKey)
            : (response.error ?? t('errors.allFailed')),
        )
        return
      }

      setOutput(response.data)

      const successCount = response.data.variants.filter(
        (v) => v.status === 'success',
      ).length
      const total = response.data.variants.length

      if (successCount === 0) {
        setStatus('error')
        setError(t('errors.allFailed'))
        toastError(t('errors.allFailed'))
      } else if (successCount < total) {
        setStatus('done')
        toastSuccess(t('errors.partialSuccess', { count: successCount, total }))
      } else {
        setStatus('done')
      }
    },
    [t],
  )

  const retryVariant = useCallback(
    async (index: number) => {
      if (!lastInput || !output) return

      // Re-submit with single variant for the failed slot
      const singleInput: TransformInput = { ...lastInput, variants: 1 }

      const response = await transformImageAPI(singleInput)

      if (response.success && response.data && response.data.variants[0]) {
        // Replace the failed variant in output
        const newVariants: TransformVariantResult[] = [...output.variants]
        newVariants[index] = response.data.variants[0]

        setOutput({
          ...output,
          variants: newVariants,
          totalCost:
            output.totalCost +
            (response.data.variants[0].status === 'success' ? 1 : 0),
        })
      } else {
        toastError(response.error ?? t('errors.allFailed'))
      }
    },
    [lastInput, output, t],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setOutput(null)
    setError(null)
    setLastInput(null)
  }, [])

  return { status, output, error, submit, retryVariant, reset }
}
