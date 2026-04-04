'use client'

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
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
        'space-y-3 transition-colors',
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

      {/* Model selector dropdown — quick mode only */}
      {state.workflowMode === 'quick' && (
        <ModelDropdown
          modelOptions={modelOptions}
          selectedOptionId={state.selectedOptionId}
          healthMap={healthMap}
          onSelect={(optionId) =>
            dispatch({ type: 'SET_OPTION_ID', payload: optionId })
          }
          tModels={tModels}
          tCommon={tCommon}
        />
      )}

      <StudioPromptArea />

      {/* Controls: aspect ratio + toolbar (tighter spacing) */}
      <div className="space-y-2">
        <StudioGenerateBar />
        <StudioToolbarPanels />
      </div>
    </div>
  )
})

// ── Model Dropdown ───────────────────────────────────────────────────

import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { ApiKeyHealthStatus } from '@/types'

function ModelDropdown({
  modelOptions,
  selectedOptionId,
  healthMap,
  onSelect,
  tModels,
  tCommon,
}: {
  modelOptions: StudioModelOption[]
  selectedOptionId: string | null
  healthMap: Record<string, ApiKeyHealthStatus>
  onSelect: (optionId: string) => void
  tModels: ReturnType<typeof useTranslations>
  tCommon: ReturnType<typeof useTranslations>
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const savedOpts = modelOptions.filter((o) => o.sourceType === 'saved')
  const selected = modelOptions.find((o) => o.optionId === selectedOptionId)

  const visibleOptions =
    selected && !savedOpts.some((o) => o.optionId === selected.optionId)
      ? [selected, ...savedOpts]
      : savedOpts.length > 0
        ? savedOpts
        : selected
          ? [selected]
          : []

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (visibleOptions.length === 0) return null

  const selectedLabel = selected
    ? (selected.keyLabel ?? getTranslatedModelLabel(tModels, selected.modelId))
    : visibleOptions[0]
      ? (visibleOptions[0].keyLabel ??
        getTranslatedModelLabel(tModels, visibleOptions[0].modelId))
      : ''
  const selectedProvider = selected
    ? getProviderLabel(selected.providerConfig)
    : visibleOptions[0]
      ? getProviderLabel(visibleOptions[0].providerConfig)
      : ''
  const selectedHealth = (selected ?? visibleOptions[0])?.keyId
    ? healthMap[(selected ?? visibleOptions[0])!.keyId!]
    : undefined

  return (
    <div ref={wrapRef} className="relative inline-flex">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
          'border-border/50 hover:border-primary/20 active:scale-[0.97]',
        )}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <ApiKeyHealthDot status={selectedHealth} />
        <span className="truncate max-w-40">{selectedLabel}</span>
        <span className="text-muted-foreground/60">{selectedProvider}</span>
        <ChevronDown
          className={cn(
            'size-3 text-muted-foreground transition-transform duration-300',
            open && 'rotate-180',
          )}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-xl border border-border/60 bg-background py-1 shadow-lg"
          style={{
            animation:
              'studio-dropdown-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {visibleOptions.map((option) => {
            const isSelected = option.optionId === selectedOptionId
            const healthStatus = option.keyId
              ? healthMap[option.keyId]
              : undefined
            const modelLabel = getTranslatedModelLabel(tModels, option.modelId)
            const providerLabel = getProviderLabel(option.providerConfig)

            return (
              <button
                key={option.optionId}
                type="button"
                onClick={() => {
                  onSelect(option.optionId)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors',
                  'hover:bg-muted',
                  isSelected && 'bg-muted/60',
                )}
              >
                <ApiKeyHealthDot status={healthStatus} />
                <span className="font-medium text-foreground">
                  {option.keyLabel ?? modelLabel}
                </span>
                <span className="text-muted-foreground/60">
                  {providerLabel}
                </span>
                {option.sourceType === 'saved' && (
                  <span className="ml-auto text-muted-foreground/50">
                    {tCommon('creditCount', { count: option.requestCount })}
                  </span>
                )}
                {isSelected && (
                  <span className="ml-auto text-primary">&#x2713;</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
