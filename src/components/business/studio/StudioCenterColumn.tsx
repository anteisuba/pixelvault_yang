'use client'

import { memo, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { getProviderLabel } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

import { StudioCardSection } from './StudioCardSection'
import { StudioPromptArea } from './StudioPromptArea'
import { StudioGenerateBar } from './StudioGenerateBar'
import { StudioToolbarPanels } from './StudioToolbarPanels'

export const StudioCenterColumn = memo(function StudioCenterColumn({
  className,
}: {
  className?: string
}) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { modelOptions } = useImageModelOptions()
  const { healthMap } = useApiKeysContext()
  const tModels = useTranslations('Models')
  const tCommon = useTranslations('Common')

  // Global drop zone: accept dragged history images as reference images
  const [isDragOver, setIsDragOver] = useState(false)

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-studio-ref')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }, [])

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    if (
      e.currentTarget === e.target ||
      !e.currentTarget.contains(e.relatedTarget as Node)
    ) {
      setIsDragOver(false)
    }
  }, [])

  const handleGlobalDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const studioRef = e.dataTransfer.getData('application/x-studio-ref')
      if (!studioRef) return
      try {
        const { url } = JSON.parse(studioRef) as { url: string }
        if (url) {
          await imageUpload.addFromUrl(url)
          dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
        }
      } catch {
        // Ignore invalid data
      }
    },
    [imageUpload, dispatch],
  )

  return (
    <div
      className={cn(
        'space-y-4 transition-colors',
        isDragOver &&
          'ring-2 ring-primary/40 ring-inset rounded-xl bg-primary/5',
        className,
      )}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {/* Card mode: card management section */}
      {state.workflowMode === 'card' && <StudioCardSection />}

      {/* Model indicator — show saved routes + active model above prompt */}
      {state.workflowMode === 'quick' &&
        (() => {
          const savedOpts = modelOptions.filter((o) => o.sourceType === 'saved')
          const selected = modelOptions.find(
            (o) => o.optionId === state.selectedOptionId,
          )
          // Show saved routes; if selected is a workspace model not in saved, show it too
          const visibleOptions =
            selected && !savedOpts.some((o) => o.optionId === selected.optionId)
              ? [selected, ...savedOpts]
              : savedOpts.length > 0
                ? savedOpts
                : selected
                  ? [selected]
                  : []

          return visibleOptions.length > 0 ? (
            <div
              role="radiogroup"
              aria-label="Model selection"
              className="flex flex-wrap gap-2"
            >
              {visibleOptions.map((option) => {
                const isSelected = option.optionId === state.selectedOptionId
                const healthStatus = option.keyId
                  ? healthMap[option.keyId]
                  : undefined
                const modelLabel = getTranslatedModelLabel(
                  tModels,
                  option.modelId,
                )
                const providerLabel = getProviderLabel(option.providerConfig)

                return (
                  <button
                    key={option.optionId}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() =>
                      dispatch({
                        type: 'SET_OPTION_ID',
                        payload: option.optionId,
                      })
                    }
                    className={cn(
                      'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                      isSelected
                        ? 'border border-primary/40 bg-primary/5 text-foreground shadow-sm shadow-primary/10'
                        : 'border border-border/50 text-muted-foreground hover:border-primary/20 hover:text-foreground hover:bg-primary/3',
                    )}
                  >
                    <ApiKeyHealthDot status={healthStatus} />
                    <span className="truncate max-w-40">
                      {option.keyLabel ?? modelLabel}
                    </span>
                    <span className="text-muted-foreground/60">
                      {providerLabel}
                    </span>
                    {option.sourceType === 'saved' && (
                      <span className="text-muted-foreground/50">
                        {tCommon('creditCount', { count: option.requestCount })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : null
        })()}

      <StudioPromptArea />
      <StudioGenerateBar />
      <StudioToolbarPanels />
    </div>
  )
})
