'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import type { UnifiedGenerateInput } from '@/hooks/use-unified-generate'

type Dimension = 'subject' | 'style' | 'composition' | 'lighting' | 'color'
const DIMENSIONS: Dimension[] = [
  'subject',
  'style',
  'composition',
  'lighting',
  'color',
]

export function StudioKeepChangePanel() {
  const { state, dispatch } = useStudioForm()
  const { generate, isGenerating } = useStudioGen()
  const t = useTranslations('StudioKeepChangePanel')

  const [keepSet, setKeepSet] = useState<Set<Dimension>>(new Set())
  const [changeSet, setChangeSet] = useState<Set<Dimension>>(new Set())
  const [freeform, setFreeform] = useState('')

  const toggleKeep = useCallback((dim: Dimension) => {
    setKeepSet((prev) => {
      const next = new Set(prev)
      if (next.has(dim)) next.delete(dim)
      else next.add(dim)
      return next
    })
    // Keep and change are mutually exclusive
    setChangeSet((prev) => {
      const next = new Set(prev)
      next.delete(dim)
      return next
    })
  }, [])

  const toggleChange = useCallback((dim: Dimension) => {
    setChangeSet((prev) => {
      const next = new Set(prev)
      if (next.has(dim)) next.delete(dim)
      else next.add(dim)
      return next
    })
    setKeepSet((prev) => {
      const next = new Set(prev)
      next.delete(dim)
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    const keepParts = keepSet.size > 0 ? `Keep ${[...keepSet].join(', ')}.` : ''
    const changeParts =
      changeSet.size > 0 ? `Change ${[...changeSet].join(', ')}.` : ''
    const refinementSuffix = [keepParts, changeParts, freeform]
      .filter(Boolean)
      .join(' ')
    const refinedPrompt = refinementSuffix
      ? `${state.prompt}. ${refinementSuffix}`
      : state.prompt

    dispatch({ type: 'CLOSE_ALL_PANELS' })

    const input: UnifiedGenerateInput = {
      mode: 'image',
      image: {
        freePrompt: refinedPrompt,
        aspectRatio: state.aspectRatio,
      },
    }
    await generate(input)
  }, [
    keepSet,
    changeSet,
    freeform,
    state.prompt,
    state.aspectRatio,
    dispatch,
    generate,
  ])

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_PANELS' })
  }, [dispatch])

  return (
    <div className="space-y-4 p-4">
      <p className="text-foreground text-sm font-medium">{t('title')}</p>

      {/* Keep chips */}
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium">
          {t('keepLabel')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DIMENSIONS.map((dim) => (
            <button
              key={`keep-${dim}`}
              type="button"
              aria-pressed={keepSet.has(dim)}
              onClick={() => toggleKeep(dim)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                keepSet.has(dim)
                  ? 'bg-green-100 text-green-800 ring-1 ring-green-300'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {t(dim)}
            </button>
          ))}
        </div>
      </div>

      {/* Change chips */}
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs font-medium">
          {t('changeLabel')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DIMENSIONS.map((dim) => (
            <button
              key={`change-${dim}`}
              type="button"
              aria-pressed={changeSet.has(dim)}
              onClick={() => toggleChange(dim)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-all',
                changeSet.has(dim)
                  ? 'bg-primary/10 text-primary ring-primary/30 ring-1'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              {t(dim)}
            </button>
          ))}
        </div>
      </div>

      {/* Freeform */}
      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">
          {t('freeformLabel')}
        </label>
        <textarea
          value={freeform}
          onChange={(e) => setFreeform(e.target.value)}
          placeholder={t('freeformPlaceholder')}
          rows={2}
          className="border-border/60 bg-background/60 placeholder:text-muted-foreground/60 focus:ring-primary/30 w-full resize-none rounded-lg border px-3 py-2 font-serif text-sm focus:outline-none focus:ring-1"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="border-border/60 bg-background/60 text-muted-foreground hover:text-foreground flex-1 rounded-lg border py-2 text-sm transition-colors"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
            isGenerating
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground shadow-sm hover:shadow-md active:scale-[0.97]',
          )}
        >
          {t('generateRefined')}
        </button>
      </div>
    </div>
  )
}
