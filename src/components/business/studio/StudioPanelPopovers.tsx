'use client'

import { memo, useCallback } from 'react'
import { Key, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'

const PromptEnhancer = dynamic(() =>
  import('@/components/business/PromptEnhancer').then(
    (mod) => mod.PromptEnhancer,
  ),
)
const AdvancedSettings = dynamic(() =>
  import('@/components/business/AdvancedSettings').then(
    (mod) => mod.AdvancedSettings,
  ),
)
const StudioTransformPanel = dynamic(() =>
  import('@/components/business/studio/StudioTransformPanel').then(
    (mod) => mod.StudioTransformPanel,
  ),
)

/**
 * StudioPanelPopovers — renders 3 small/medium panels as Popovers.
 * Floats above the dock area. Zero layout impact on the dock.
 *
 * Panels: Enhance, Advanced, Civitai Token
 */
export const StudioPanelPopovers = memo(function StudioPanelPopovers() {
  const { state, dispatch } = useStudioForm()
  const { promptEnhance, civitai, styles, imageUpload } = useStudioData()
  const { isGenerating } = useStudioGen()
  const t = useTranslations('StudioV2')
  const { selectedModel } = useImageModelOptions()

  const selectedStyleCard = styles.activeCard
  const adapterType =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.adapterType
      : ((selectedStyleCard?.adapterType as AI_ADAPTER_TYPES) ??
        AI_ADAPTER_TYPES.FAL)
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)

  // ── Enhance handlers ──────────────────────────────────────────
  const handleEnhance = useCallback(
    (style: Parameters<typeof promptEnhance.enhance>[1]) => {
      if (!state.prompt.trim()) return
      void promptEnhance.enhance(state.prompt, style)
    },
    [state.prompt, promptEnhance],
  )

  const handleUseEnhanced = useCallback(
    (text: string) => {
      const current = state.prompt.trim()
      const appended = current ? `${current}, ${text}` : text
      dispatch({ type: 'SET_PROMPT', payload: appended })
      promptEnhance.clearEnhancement()
    },
    [dispatch, promptEnhance, state.prompt],
  )

  // ── Civitai handlers ──────────────────────────────────────────
  const handleSaveToken = useCallback(async () => {
    if (!state.tokenInput.trim()) return
    const ok = await civitai.save(state.tokenInput.trim())
    if (ok) {
      dispatch({ type: 'SET_TOKEN_INPUT', payload: '' })
    }
  }, [state.tokenInput, civitai, dispatch])

  const closePanel = useCallback(
    (panel: 'enhance' | 'advanced' | 'civitai' | 'transform') => {
      dispatch({ type: 'CLOSE_PANEL', payload: panel })
    },
    [dispatch],
  )

  return (
    <>
      {/* ── Prompt Enhancer Popover ────────────────────────────── */}
      <Popover
        open={state.panels.enhance}
        onOpenChange={(open) => {
          if (!open) {
            promptEnhance.clearEnhancement()
            closePanel('enhance')
          }
        }}
      >
        <PopoverAnchor className="fixed bottom-36 left-1/2 -translate-x-1/2" />
        <PopoverContent
          side="top"
          align="center"
          sideOffset={8}
          className="w-96 max-h-80 overflow-y-auto"
        >
          <PromptEnhancer
            prompt={state.prompt}
            isEnhancing={promptEnhance.isEnhancing}
            disabled={isGenerating}
            enhanced={promptEnhance.enhanced}
            enhancedOriginal={promptEnhance.original}
            enhancedStyle={promptEnhance.style}
            onEnhance={handleEnhance}
            onUseEnhanced={handleUseEnhanced}
            onDismiss={() => {
              promptEnhance.clearEnhancement()
              closePanel('enhance')
            }}
          />
        </PopoverContent>
      </Popover>

      {/* ── Advanced Settings Popover ──────────────────────────── */}
      <Popover
        open={state.panels.advanced}
        onOpenChange={(open) => {
          if (!open) closePanel('advanced')
        }}
      >
        <PopoverAnchor className="fixed bottom-36 left-1/2 -translate-x-1/2" />
        <PopoverContent
          side="top"
          align="center"
          sideOffset={8}
          className="w-96 max-h-96 overflow-y-auto"
        >
          {selectedModel?.adapterType || selectedStyleCard?.adapterType ? (
            <AdvancedSettings
              adapterType={adapterType}
              modelId={modelId}
              params={state.advancedParams}
              onChange={(params) =>
                dispatch({ type: 'SET_ADVANCED_PARAMS', payload: params })
              }
              hasReferenceImage={imageUpload.referenceImages.length > 0}
              disabled={isGenerating}
            />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              {t('selectModelFirst')}
            </p>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Civitai Token Popover ──────────────────────────────── */}
      <Popover
        open={state.panels.civitai}
        onOpenChange={(open) => {
          if (!open) closePanel('civitai')
        }}
      >
        <PopoverAnchor className="fixed bottom-36 left-1/2 -translate-x-1/2" />
        <PopoverContent
          side="top"
          align="center"
          sideOffset={8}
          className="w-80"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="size-3.5 text-primary" />
                <span className="text-xs font-medium font-display">
                  {t('civitaiToken')}
                </span>
                {civitai.hasToken && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    {t('tokenSaved')}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => closePanel('civitai')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={state.tokenInput}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_TOKEN_INPUT',
                    payload: e.target.value,
                  })
                }
                placeholder={t('tokenPlaceholder')}
                className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs font-mono focus:border-primary/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={!state.tokenInput.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
              >
                {t('save')}
              </button>
              {civitai.hasToken && (
                <button
                  type="button"
                  onClick={() => civitai.remove()}
                  className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5"
                >
                  {t('removeToken')}
                </button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* ── Transform Popover ─────────────────────────────────── */}
      <Popover
        open={state.panels.transform}
        onOpenChange={(open) => {
          if (!open) closePanel('transform')
        }}
      >
        <PopoverAnchor className="fixed bottom-36 left-1/2 -translate-x-1/2" />
        <PopoverContent
          side="top"
          align="center"
          sideOffset={8}
          className="w-96 max-h-[28rem] overflow-y-auto"
        >
          <StudioTransformPanel />
        </PopoverContent>
      </Popover>
    </>
  )
})
