'use client'

import { useState, useCallback } from 'react'
import { Palette } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { useRouter } from '@/i18n/navigation'
import { ROUTES } from '@/constants/routes'
import { IMAGE_MODEL_OPTIONS } from '@/constants/models/image'
import { getReplayPayloadAPI } from '@/lib/api-client/generation-replay'
import type { OutputType } from '@/types'

interface UseLoraButtonProps {
  generationId: string
  outputType: OutputType
  /** The model id this generation was produced with — used to decide
   *  whether a LoRA could possibly have been attached. */
  modelId: string
}

function studioRouteForOutputType(outputType: OutputType): string {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  // LoRA generation now lives entirely at /studio/lora (Image Studio no
  // longer reads the active LoRA stack — see LoraStackProvider's move in
  // studio/lora/layout.tsx). LoraWorkbench's GenerateBranch reads the same
  // ?prompt=&seed=&negativePrompt=&aspectRatio= replay params this button
  // already builds below.
  return ROUTES.STUDIO_LORA
}

/**
 * Cheap render-time check: was this image produced by a model that even
 * accepts a `loras` array? If not, there's nothing to replay and the
 * "Use LoRA" chip is pure noise on the gallery card. Snapshot inspection
 * still happens server-side on click, so the rare case of "LoRA-capable
 * model but no LoRA on this run" degrades to a clear toast.
 */
function modelSupportsLora(modelId: string): boolean {
  return IMAGE_MODEL_OPTIONS.some(
    (m) => m.id === modelId && m.supportsLora === true,
  )
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
  modelId,
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
        const {
          styleCodes,
          hasHiddenLoras,
          prompt,
          seed,
          negativePrompt,
          aspectRatio,
        } = result.data

        // Phase 1C: a snapshot is "nothing to replay" only when it has
        // neither LoRAs nor a prompt — older generations might be missing
        // both; everything since the prompt-area refactor carries at
        // least freePrompt.
        if (styleCodes.length === 0 && !prompt) {
          toast.message(hasHiddenLoras ? t('allHidden') : t('noneAvailable'))
          return
        }

        const params = new URLSearchParams()
        for (const code of styleCodes) {
          params.append('style', code)
        }
        if (prompt) params.set('prompt', prompt)
        if (seed !== null) params.set('seed', String(seed))
        if (negativePrompt) params.set('negativePrompt', negativePrompt)
        if (aspectRatio) params.set('aspectRatio', aspectRatio)

        router.push(
          `${studioRouteForOutputType(outputType)}?${params.toString()}`,
        )
        if (hasHiddenLoras) {
          toast.message(t('someHidden'))
        }
      } finally {
        setIsPending(false)
      }
    },
    [generationId, outputType, isPending, router, t],
  )

  if (!modelSupportsLora(modelId)) return null

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
