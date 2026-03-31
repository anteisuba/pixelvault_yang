'use client'

import { memo, useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { ModelSelector } from '@/components/business/ModelSelector'
import { AnimatedCollapse } from '@/components/ui/animated-collapse'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { cn } from '@/lib/utils'

import { StudioPromptArea } from './StudioPromptArea'
import { StudioGenerateBar } from './StudioGenerateBar'
import { StudioToolbarPanels } from './StudioToolbarPanels'
import { StudioCardSection } from './StudioCardSection'

export const StudioLeftPanel = memo(function StudioLeftPanel({
  className,
}: {
  className?: string
}) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const tV3 = useTranslations('StudioV3')
  const { modelOptions, selectedModel } = useImageModelOptions()

  // Global drop zone: accept dragged history images as reference images
  const [isDragOver, setIsDragOver] = useState(false)

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    // Only react to studio-ref drags (check types)
    if (e.dataTransfer.types.includes('application/x-studio-ref')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }, [])

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    // Only reset when leaving the container (not child elements)
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
          // Auto-open reference image panel (OPEN, not TOGGLE)
          dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
        }
      } catch {
        // Ignore invalid data
      }
    },
    [imageUpload, state.panels.refImage, dispatch],
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
      {/* ── Workflow Toggle (Quick / Card) ──────────────────────── */}
      <div
        role="tablist"
        aria-label="Workflow mode"
        className="flex rounded-lg border border-border/60 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={state.workflowMode === 'quick'}
          onClick={() =>
            dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
          }
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            state.workflowMode === 'quick'
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {tV3('quickMode')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.workflowMode === 'card'}
          onClick={() =>
            dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'card' })
          }
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            state.workflowMode === 'card'
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {tV3('cardMode')}
        </button>
      </div>

      {/* ── Quick mode: Collapsible model selector ──────────────── */}
      {state.workflowMode === 'quick' && (
        <div className="rounded-xl border border-border/40 overflow-hidden">
          <button
            type="button"
            aria-expanded={state.panels.modelSelector}
            onClick={() =>
              dispatch({ type: 'TOGGLE_PANEL', payload: 'modelSelector' })
            }
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
          >
            <span className="font-display truncate">
              {selectedModel ? selectedModel.modelId : tV3('selectModel')}
            </span>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-300 shrink-0 ml-2',
                state.panels.modelSelector && 'rotate-180',
              )}
            />
          </button>
          <AnimatedCollapse open={state.panels.modelSelector}>
            <div className="border-t border-border/40 p-3">
              <ModelSelector
                value={state.selectedOptionId ?? ''}
                onChange={(optionId) => {
                  dispatch({ type: 'SET_OPTION_ID', payload: optionId })
                  dispatch({ type: 'CLOSE_PANEL', payload: 'modelSelector' })
                }}
                options={modelOptions}
              />
            </div>
          </AnimatedCollapse>
        </div>
      )}

      {/* ── Card mode: dropdowns + API keys + card management ───── */}
      {state.workflowMode === 'card' && <StudioCardSection />}

      {/* ── Shared: Prompt + Generate bar ──────────────────────── */}
      <StudioPromptArea />
      <StudioGenerateBar />

      {/* ── Shared: Toolbar + panels (both modes) ─────────────── */}
      <StudioToolbarPanels />
    </div>
  )
})
