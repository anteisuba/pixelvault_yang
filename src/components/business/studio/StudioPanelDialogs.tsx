'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

const PromptAssistantPanel = dynamic(() =>
  import('@/components/business/PromptAssistantPanel').then(
    (mod) => mod.PromptAssistantPanel,
  ),
)
const ReverseEngineerPanel = dynamic(() =>
  import('@/components/business/ReverseEngineerPanel').then(
    (mod) => mod.ReverseEngineerPanel,
  ),
)

const LLM_CAPABLE_ADAPTERS = new Set([
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
])

/**
 * Enhance is a chat panel — content scrolls inside, so it deserves a
 * fixed height so the conversation area has somewhere to live.
 */
const ENHANCE_DIALOG_CLASSES =
  'h-[min(70vh,640px)] w-[calc(100%-2rem)] !max-w-2xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-2xl'

/**
 * Reverse engineer starts as a small upload dropzone, then grows when
 * the user picks dimensions / sees results. A fixed height left a wall
 * of empty space below the dropzone in the initial state, so this dialog
 * uses max-h instead and fits the content vertically.
 */
const REVERSE_DIALOG_CLASSES =
  'max-h-[80vh] w-[calc(100%-2rem)] !max-w-2xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-2xl'

/**
 * StudioPanelDialogs — `enhance` (prompt assistant) and `reverse` (image
 * reverse engineer) used to render inline in the dock's right 40% column.
 * They felt like a separate workspace fighting the prompt area for screen
 * space, so they're now centred small dialogs (Krea-style) the user can
 * dismiss with the chip / Esc / overlay click.
 *
 * `aspectRatio`, `refImage`, `keepChange`, etc. still live in their own
 * places (popover, sheet, dedicated component); this file only owns the
 * two panels the user explicitly asked to be modal.
 */
export const StudioPanelDialogs = memo(function StudioPanelDialogs() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, styles } = useStudioData()
  const tPanels = useTranslations('StudioPanels')
  const { selectedModel } = useImageModelOptions()
  const { keys: apiKeys } = useApiKeysContext()

  const llmApiKeys = apiKeys
    .filter((k) => k.isActive && LLM_CAPABLE_ADAPTERS.has(k.adapterType))
    .map((k) => ({ id: k.id, label: k.label || k.adapterType }))

  const selectedStyleCard = styles.activeCard
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)

  return (
    <>
      {/* ── Prompt Assistant (Enhance / 追加) ─────────────────── */}
      <Dialog
        open={state.panels.enhance}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' })
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={ENHANCE_DIALOG_CLASSES}
        >
          <DialogTitle className="sr-only">{tPanels('enhance')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('enhance')}
          </DialogDescription>
          <div className="flex size-full flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-2xl">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reverse Engineer (图片反向工程) ───────────────────── */}
      <Dialog
        open={state.panels.reverse}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
        }}
      >
        <DialogContent showCloseButton className={REVERSE_DIALOG_CLASSES}>
          <DialogTitle className="sr-only">{tPanels('reverse')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('reverse')}
          </DialogDescription>
          <div className="flex max-h-full flex-col overflow-y-auto rounded-xl border border-border/40 bg-background p-4 shadow-2xl">
            <ReverseEngineerPanel
              onUsePrompt={(prompt) => {
                dispatch({ type: 'SET_PROMPT', payload: prompt })
                dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
