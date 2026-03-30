'use client'

import { memo, useCallback, useRef, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

const ASPECT_RATIOS = ['1:1', '16:9', '9:16'] as const

export const StudioGenerateBar = memo(function StudioGenerateBar() {
  const { state, dispatch } = useStudioForm()
  const { characters, backgrounds, styles, imageUpload, projects } =
    useStudioData()
  const { isGenerating, generate } = useStudioGen()
  const t = useTranslations('StudioV2')

  const selectedStyleCard = styles.activeCard
  const canGenerate = !!styles.activeCardId && !!selectedStyleCard?.modelId
  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null

  // ── Reset advancedParams when adapter type changes ──────────
  const prevAdapterRef = useRef(selectedStyleCard?.adapterType)
  useEffect(() => {
    const currentAdapter = selectedStyleCard?.adapterType
    if (
      prevAdapterRef.current !== undefined &&
      currentAdapter !== undefined &&
      prevAdapterRef.current !== currentAdapter
    ) {
      dispatch({ type: 'RESET_ADVANCED_PARAMS' })
    }
    prevAdapterRef.current = currentAdapter
  }, [selectedStyleCard?.adapterType, dispatch])

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !styles.activeCardId) return
    await generate({
      mode: 'image',
      image: {
        characterCardId: selectedCharId ?? undefined,
        backgroundCardId: backgrounds.activeCardId ?? undefined,
        styleCardId: styles.activeCardId,
        freePrompt: state.prompt || undefined,
        aspectRatio: state.aspectRatio,
        projectId: projects.activeProjectId ?? undefined,
        referenceImages:
          imageUpload.referenceImages.length > 0
            ? imageUpload.referenceImages
            : undefined,
        advancedParams:
          Object.keys(state.advancedParams).length > 0
            ? state.advancedParams
            : undefined,
      },
    })
  }, [
    canGenerate,
    generate,
    selectedCharId,
    backgrounds.activeCardId,
    styles.activeCardId,
    state.prompt,
    state.aspectRatio,
    state.advancedParams,
    projects.activeProjectId,
    imageUpload.referenceImages,
  ])

  return (
    <>
      {/* Sticky on mobile, static on desktop */}
      <div className="flex items-center justify-between gap-3 sm:static sticky bottom-0 z-10 bg-background/95 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none py-2 sm:py-0 -mx-1 px-1 sm:mx-0 sm:px-0">
        <div
          role="radiogroup"
          aria-label={t('aspectRatioLabel')}
          className="flex gap-1.5"
        >
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={state.aspectRatio === r}
              onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', payload: r })}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                state.aspectRatio === r
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate}
          className={cn(
            'flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium transition-colors',
            canGenerate && !isGenerating
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('generating')}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {t('generate')}
            </>
          )}
        </button>
      </div>

      {/* No-model warning */}
      {styles.activeCardId && !selectedStyleCard?.modelId && (
        <p className="text-xs text-destructive/70 font-serif">{t('noModel')}</p>
      )}
    </>
  )
})
