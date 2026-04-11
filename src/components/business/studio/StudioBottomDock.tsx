'use client'

import { memo } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

import { StudioCardSection } from './StudioCardSection'
import { StudioPromptArea } from './StudioPromptArea'
import { StudioGenerateBar } from './StudioGenerateBar'
import { StudioToolbarPanels } from './StudioToolbarPanels'
import { StudioDockPanelArea } from './StudioDockPanelArea'

/**
 * StudioBottomDock — Left-right split layout.
 * Desktop: 60%/40% grid with inline panel area.
 * Mobile: full-width controls, panel opens as bottom drawer.
 */
export const StudioBottomDock = memo(function StudioBottomDock() {
  const { state, dispatch } = useStudioForm()
  const isMobile = useIsMobile()

  const hasOpenPanel =
    state.panels.enhance ||
    state.panels.advanced ||
    state.panels.civitai ||
    state.panels.refImage ||
    state.panels.reverse ||
    state.panels.layerDecompose ||
    state.panels.aspectRatio

  const closeAllPanels = () => dispatch({ type: 'CLOSE_ALL_PANELS' })

  // ── Mobile: full-width dock + drawer for panels ───────────────────
  if (isMobile) {
    return (
      <div className="studio-dock">
        <div className="space-y-2">
          {state.workflowMode === 'card' && state.outputType !== 'audio' && (
            <StudioCardSection />
          )}
          <StudioPromptArea />
          <StudioToolbarPanels />
        </div>

        <Drawer
          open={hasOpenPanel}
          onOpenChange={(open) => {
            if (!open) closeAllPanels()
          }}
        >
          <DrawerContent className="max-h-[80vh]">
            <div className="overflow-y-auto px-4 pb-6 pt-2">
              <StudioDockPanelArea />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    )
  }

  // ── Desktop: 60%/40% grid layout ──────────────────────────────────
  return (
    <div className="studio-dock">
      <div
        className="grid gap-4 transition-all duration-300"
        style={{
          gridTemplateColumns: hasOpenPanel ? '60% 1fr' : '1fr',
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* Left: input controls */}
        <div className="space-y-2">
          {state.workflowMode === 'card' && state.outputType !== 'audio' && (
            <StudioCardSection />
          )}
          <StudioPromptArea />
          <StudioToolbarPanels />
        </div>

        {/* Right: tool panel — expands naturally, pushes history down */}
        {hasOpenPanel && <StudioDockPanelArea />}
      </div>
    </div>
  )
})

// ── Standalone model dropdown for the dock (quick mode) ─────────────

import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { getProviderLabel } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { ApiKeyHealthStatus } from '@/types'

function ModelDropdownStandalone() {
  const { state, dispatch } = useStudioForm()
  const { modelOptions } = useImageModelOptions()
  const { healthMap } = useApiKeysContext()
  const tModels = useTranslations('Models')
  const tCommon = useTranslations('Common')

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const savedOpts = modelOptions.filter((o) => o.sourceType === 'saved')
  const selected = modelOptions.find(
    (o) => o.optionId === state.selectedOptionId,
  )

  const visibleOptions =
    selected && !savedOpts.some((o) => o.optionId === selected.optionId)
      ? [selected, ...savedOpts]
      : savedOpts.length > 0
        ? savedOpts
        : selected
          ? [selected]
          : []

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

  const activeOpt = selected ?? visibleOptions[0]
  const selectedLabel = activeOpt
    ? (activeOpt.keyLabel ??
      getTranslatedModelLabel(tModels, activeOpt.modelId))
    : ''
  const selectedProvider = activeOpt
    ? getProviderLabel(activeOpt.providerConfig)
    : ''
  const selectedHealth = activeOpt?.keyId
    ? healthMap[activeOpt.keyId]
    : undefined

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
          'border-border/50 hover:border-primary/20 active:scale-[0.97]',
        )}
        style={{
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <ApiKeyHealthDot status={selectedHealth} />
        <span className="truncate max-w-40">{selectedLabel}</span>
        <span className="text-muted-foreground/60">{selectedProvider}</span>
        <ChevronDown
          className={cn(
            'size-3.5 text-muted-foreground transition-transform duration-300',
            open && 'rotate-180',
          )}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 bottom-full z-50 mb-1 min-w-[280px] rounded-xl border border-border/60 bg-background py-1 shadow-lg"
          style={{
            animation:
              'studio-dropdown-in 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {visibleOptions.map((option) => {
            const isSelected = option.optionId === state.selectedOptionId
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
                  dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors',
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
