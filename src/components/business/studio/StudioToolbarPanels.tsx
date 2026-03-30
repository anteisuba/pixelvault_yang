'use client'

import { useCallback } from 'react'
import { Key, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import { StudioToolbar } from '@/components/business/StudioToolbar'
import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'

const PromptEnhancer = dynamic(() =>
  import('@/components/business/PromptEnhancer').then(
    (mod) => mod.PromptEnhancer,
  ),
)
const ReverseEngineerPanel = dynamic(() =>
  import('@/components/business/ReverseEngineerPanel').then(
    (mod) => mod.ReverseEngineerPanel,
  ),
)
const AdvancedSettings = dynamic(() =>
  import('@/components/business/AdvancedSettings').then(
    (mod) => mod.AdvancedSettings,
  ),
)
const ReferenceImageSection = dynamic(() =>
  import('@/components/ui/reference-image-section').then(
    (mod) => mod.ReferenceImageSection,
  ),
)

export function StudioToolbarPanels() {
  const { state, dispatch } = useStudioForm()
  const { styles, imageUpload, promptEnhance, civitai } = useStudioData()
  const { isGenerating } = useStudioGen()

  const t = useTranslations('StudioV2')

  const selectedStyleCard = styles.activeCard
  const adapterType =
    (selectedStyleCard?.adapterType as AI_ADAPTER_TYPES) ?? AI_ADAPTER_TYPES.FAL
  const maxRefImages = getMaxReferenceImages(adapterType)

  const handleEnhance = useCallback(
    (style: Parameters<typeof promptEnhance.enhance>[1]) => {
      if (!state.prompt.trim()) return
      void promptEnhance.enhance(state.prompt, style)
    },
    [state.prompt, promptEnhance],
  )

  const handleUseEnhanced = useCallback(
    (text: string) => {
      dispatch({ type: 'SET_PROMPT', payload: text })
      promptEnhance.clearEnhancement()
    },
    [dispatch, promptEnhance],
  )

  const handleSaveToken = useCallback(async () => {
    if (!state.tokenInput.trim()) return
    const ok = await civitai.save(state.tokenInput.trim())
    if (ok) {
      dispatch({ type: 'SET_TOKEN_INPUT', payload: '' })
      dispatch({ type: 'CLOSE_PANEL', payload: 'civitai' })
    }
  }, [state.tokenInput, civitai, dispatch])

  return (
    <>
      {/* Toolbar buttons */}
      <StudioToolbar
        onEnhance={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'enhance' })}
        isEnhancing={promptEnhance.isEnhancing}
        onReverse={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'reverse' })}
        onAdvanced={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'advanced' })
        }
        advancedOpen={state.panels.advanced}
        onReferenceImage={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'refImage' })
        }
        referenceImageCount={imageUpload.referenceImages.length}
        onCivitaiToken={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'civitai' })
        }
        hasToken={civitai.hasToken}
        disabled={isGenerating}
      />

      {/* Prompt enhance panel */}
      {state.panels.enhance && (
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
            dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' })
          }}
        />
      )}

      {/* Reverse engineer panel */}
      {state.panels.reverse && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <ReverseEngineerPanel
            onUsePrompt={(prompt) => {
              dispatch({ type: 'SET_PROMPT', payload: prompt })
              dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
            }}
          />
        </div>
      )}

      {/* Advanced settings panel */}
      {state.panels.advanced && selectedStyleCard?.adapterType && (
        <div
          aria-live="polite"
          className="rounded-lg border border-border/60 bg-background/60 p-3"
        >
          <AdvancedSettings
            adapterType={adapterType}
            params={state.advancedParams}
            onChange={(params) =>
              dispatch({ type: 'SET_ADVANCED_PARAMS', payload: params })
            }
            hasReferenceImage={imageUpload.referenceImages.length > 0}
            disabled={isGenerating}
          />
        </div>
      )}

      {/* Reference image panel */}
      {state.panels.refImage && (
        <ReferenceImageSection
          referenceImages={imageUpload.referenceImages}
          maxImages={maxRefImages}
          isDragging={imageUpload.isDragging}
          fileInputRef={imageUpload.fileInputRef}
          onDrop={imageUpload.handleDrop}
          onDragOver={imageUpload.handleDragOver}
          onDragLeave={imageUpload.handleDragLeave}
          onOpenFilePicker={imageUpload.openFilePicker}
          onInputChange={imageUpload.handleInputChange}
          onRemoveImage={imageUpload.removeReferenceImage}
          onClearAll={imageUpload.clearAllImages}
          previewAlt={t('referenceImage')}
          removeLabel={t('cancel')}
          uploadLabel={t('referenceImage')}
          formatsLabel="JPG · PNG · WEBP"
          counterLabel={`${imageUpload.referenceImages.length} / ${maxRefImages}`}
        />
      )}

      {/* Civitai token inline panel */}
      {state.panels.civitai && (
        <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
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
              onClick={() =>
                dispatch({ type: 'CLOSE_PANEL', payload: 'civitai' })
              }
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
      )}
    </>
  )
}
