'use client'

import { memo, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
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

/**
 * Shared loading state for dynamically-imported panel bodies. The first
 * click on Enhance / Reverse / Transform downloads the panel chunk before
 * the dialog can render — without a fallback, the overlay just dims the
 * page for ~1–2 s while the chunk arrives, which reads as "the screen
 * went white" to users. A centred spinner keeps the dialog feeling
 * intentional during that window.
 */
function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Radix Dialog suffers an open-and-immediately-close race when the trigger
 * is a sibling button outside the overlay: the same pointerdown that opens
 * the dialog bubbles up to the overlay's outside-click listener as soon as
 * the content mounts, and the dialog closes before the user sees it.
 *
 * Track the moment the panel goes from closed → open and ignore any
 * pointer-outside / interaction-outside event for the next 200 ms — long
 * enough for the trigger's pointer chain to finish, short enough that a
 * deliberate overlay click still dismisses the dialog.
 */
function useJustOpenedGuard(open: boolean) {
  const justOpenedRef = useRef(false)
  useEffect(() => {
    if (!open) return
    justOpenedRef.current = true
    const id = window.setTimeout(() => {
      justOpenedRef.current = false
    }, 200)
    return () => window.clearTimeout(id)
  }, [open])
  return justOpenedRef
}

const PromptAssistantPanel = dynamic(
  () =>
    import('@/components/business/PromptAssistantPanel').then(
      (mod) => mod.PromptAssistantPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const ReverseEngineerPanel = dynamic(
  () =>
    import('@/components/business/ReverseEngineerPanel').then(
      (mod) => mod.ReverseEngineerPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const StudioTransformPanel = dynamic(
  () =>
    import('@/components/business/studio/StudioTransformPanel').then(
      (mod) => mod.StudioTransformPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
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
 * Transform — image upload + 6 style presets + preservation control + 1×/4×
 * variants grid. Same shape as Reverse: starts compact (just the dropzone),
 * grows once an image is loaded; max-h keeps the variants grid scrollable
 * without forcing whitespace before upload.
 */
const TRANSFORM_DIALOG_CLASSES =
  'max-h-[85vh] w-[calc(100%-2rem)] !max-w-xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-xl'

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

  const enhanceGuard = useJustOpenedGuard(state.panels.enhance)
  const reverseGuard = useJustOpenedGuard(state.panels.reverse)
  const transformGuard = useJustOpenedGuard(state.panels.transform)

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
          onPointerDownOutside={(e) => {
            if (enhanceGuard.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (enhanceGuard.current) e.preventDefault()
          }}
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
        <DialogContent
          showCloseButton
          className={REVERSE_DIALOG_CLASSES}
          onPointerDownOutside={(e) => {
            if (reverseGuard.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (reverseGuard.current) e.preventDefault()
          }}
        >
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

      {/* ── Transform (图像风格转换) ──────────────────────────── */}
      <Dialog
        open={state.panels.transform}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: 'CLOSE_PANEL', payload: 'transform' })
        }}
      >
        <DialogContent
          showCloseButton
          className={TRANSFORM_DIALOG_CLASSES}
          onPointerDownOutside={(e) => {
            if (transformGuard.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (transformGuard.current) e.preventDefault()
          }}
        >
          <DialogTitle className="sr-only">{tPanels('transform')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('transform')}
          </DialogDescription>
          <div className="flex max-h-full flex-col overflow-y-auto rounded-xl border border-border/40 bg-background p-4 shadow-2xl">
            <StudioTransformPanel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
