'use client'

import { useState, useCallback } from 'react'
import { Palette } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { useRouter } from '@/i18n/navigation'
import { ROUTES } from '@/constants/routes'
import { getReplayPayloadAPI } from '@/lib/api-client/generation-replay'
import type { OutputType } from '@/types'

interface UseLoraButtonProps {
  generationId: string
  outputType: OutputType
}

function studioRouteForOutputType(outputType: OutputType): string {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

/**
 * "Use this LoRA" — the Civitai-style one-click action on gallery
 * cards. Lazy: we don't know whether the source generation actually
 * used a LoRA until we click, because the heavy `snapshot` JSON is
 * excluded from gallery list queries. On click we fetch the replay
 * payload, then either redirect to Studio with `?style=` codes or
 * surface a toast explaining there's nothing to replay.
 *
 * Renders nothing-special by design: a small chip that sits next to
 * the existing "use prompt" / "copy prompt" actions on hover.
 */
export function UseLoraButton({
  generationId,
  outputType,
}: UseLoraButtonProps) {
  const t = useTranslations('UseLoraButton')
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isPending) return
      setIsPending(true)
      try {
        const result = await getReplayPayloadAPI(generationId)
        if (!result.success || !result.data) {
          toast.error(result.error ?? t('failed'))
          return
        }
        const { styleCodes, hasHiddenLoras } = result.data
        if (styleCodes.length === 0) {
          toast.message(hasHiddenLoras ? t('allHidden') : t('noneAvailable'))
          return
        }
        const qs = styleCodes
          .map((c) => `style=${encodeURIComponent(c)}`)
          .join('&')
        router.push(`${studioRouteForOutputType(outputType)}?${qs}`)
        if (hasHiddenLoras) {
          toast.message(t('someHidden'))
        }
      } finally {
        setIsPending(false)
      }
    },
    [generationId, outputType, isPending, router, t],
  )

  return (
    <button
      type="button"
      onClick={(e) => void handleClick(e)}
      disabled={isPending}
      className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none disabled:opacity-60"
      aria-label={t('action')}
    >
      <Palette className="size-3" aria-hidden />
      {t('action')}
    </button>
  )
}
