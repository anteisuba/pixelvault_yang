'use client'

import { memo, useCallback, useEffect } from 'react'
import { Key, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'

/** Adapter types that support LLM text generation (for prompt assistant) */
const LLM_CAPABLE_ADAPTERS = new Set([
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
])
import { StudioGenerateBar } from './StudioGenerateBar'

const PromptAssistantPanel = dynamic(() =>
  import('@/components/business/PromptAssistantPanel').then(
    (mod) => mod.PromptAssistantPanel,
  ),
)
const AdvancedSettings = dynamic(() =>
  import('@/components/business/AdvancedSettings').then(
    (mod) => mod.AdvancedSettings,
  ),
)
const ReverseEngineerPanel = dynamic(() =>
  import('@/components/business/ReverseEngineerPanel').then(
    (mod) => mod.ReverseEngineerPanel,
  ),
)
const ReferenceImageSection = dynamic(() =>
  import('@/components/ui/reference-image-section').then(
    (mod) => mod.ReferenceImageSection,
  ),
)
const LayerDecomposePanel = dynamic(() =>
  import('@/components/business/LayerDecomposePanel').then(
    (mod) => mod.LayerDecomposePanel,
  ),
)

/**
 * StudioDockPanelArea — renders ALL 6 tool panels inline in the right
 * side of the dock. Only one panel visible at a time (mutually exclusive).
 * Replaces both StudioPanelPopovers and StudioPanelSheets.
 */
export const StudioDockPanelArea = memo(function StudioDockPanelArea() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, promptEnhance, civitai, styles } = useStudioData()
  const { isGenerating } = useStudioGen()
  const t = useTranslations('StudioV2')
  const tPanels = useTranslations('StudioPanels')
  const { selectedModel } = useImageModelOptions()
  const { keys: apiKeys } = useApiKeysContext()

  // Filter to LLM-capable API keys for the prompt assistant
  const llmApiKeys = apiKeys
    .filter((k) => k.isActive && LLM_CAPABLE_ADAPTERS.has(k.adapterType))
    .map((k) => ({ id: k.id, label: k.label || k.adapterType }))

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
  const maxRefImages = getMaxReferenceImages(adapterType, modelId)

  useEffect(() => {
    imageUpload.setMaxImages(maxRefImages)
  }, [maxRefImages, imageUpload])

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

  // Check if any panel is open
  const hasOpenPanel =
    state.panels.enhance ||
    state.panels.advanced ||
    state.panels.civitai ||
    state.panels.refImage ||
    state.panels.reverse ||
    state.panels.layerDecompose ||
    state.panels.aspectRatio

  if (!hasOpenPanel) return null

  return (
    <div className="h-full overflow-y-auto">
      {/* ── Prompt Assistant (Chat-based) ──────────────────── */}
      {state.panels.enhance && (
        <PromptAssistantPanel
          currentPrompt={state.prompt}
          modelId={modelId}
          referenceImageData={imageUpload.referenceImages[0]}
          llmApiKeys={llmApiKeys}
          onUsePrompt={(text) => {
            dispatch({ type: 'SET_PROMPT', payload: text })
          }}
          onClose={() => {
            dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' })
          }}
        />
      )}

      {/* ── Advanced Settings ────────────────────────────────── */}
      {state.panels.advanced &&
        (selectedModel?.adapterType || selectedStyleCard?.adapterType ? (
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
        ))}

      {/* ── Civitai Token ────────────────────────────────────── */}
      {state.panels.civitai && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="size-3.5 text-primary" />
              <span className="text-xs font-medium font-display">
                {tPanels('civitai')}
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

      {/* ── Reference Image ──────────────────────────────────── */}
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

      {/* ── Reverse Engineer ──────────────────────────────────── */}
      {state.panels.reverse && (
        <ReverseEngineerPanel
          onUsePrompt={(prompt) => {
            dispatch({ type: 'SET_PROMPT', payload: prompt })
            dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
          }}
        />
      )}

      {/* ── Layer Decompose ───────────────────────────────────── */}
      {state.panels.layerDecompose && (
        <LayerDecomposePanel onAddAsReference={imageUpload.addFromUrl} />
      )}

      {/* ── Aspect Ratio ─────────────────────────────────────── */}
      {state.panels.aspectRatio && <StudioGenerateBar />}
    </div>
  )
})
