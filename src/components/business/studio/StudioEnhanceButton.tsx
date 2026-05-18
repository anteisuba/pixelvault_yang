'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { cn } from '@/lib/utils'

const LLM_CAPABLE_ADAPTERS = new Set([
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
])

function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

const PromptAssistantPanel = dynamic(
  () =>
    import('@/components/business/PromptAssistantPanel').then(
      (mod) => mod.PromptAssistantPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

interface StudioEnhanceButtonProps {
  disabled?: boolean
}

/**
 * StudioEnhanceButton — toolbar trigger that opens the PromptAssistantPanel
 * in a centred Dialog. Enhance is intentionally heavier than its toolbar
 * siblings (style / refImage / aspect): it bundles an LLM textarea, style
 * picker, and Gemini quick-setup, so a focused modal beats a popover that
 * would clip on smaller viewports.
 */
export function StudioEnhanceButton({ disabled }: StudioEnhanceButtonProps) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, styles, promptEnhance } = useStudioData()
  const t = useTranslations('StudioV2')
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

  const open = state.panels.enhance
  const isEnhancing = promptEnhance.isEnhancing

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'enhance',
        })
      }
    >
      <DialogTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled || isEnhancing}
          aria-label={t('enhance')}
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
            'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
            'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
            open && 'bg-muted/30 text-primary',
          )}
        >
          <Sparkles className={cn('size-4', isEnhancing && 'animate-pulse')} />
          <span className="hidden sm:inline">{t('enhance')}</span>
        </Toolbar.Button>
      </DialogTrigger>
      <DialogContent className="w-[min(720px,calc(100vw-2rem))] max-w-[720px] gap-0 overflow-hidden !p-0">
        <DialogTitle className="sr-only">{t('enhance')}</DialogTitle>
        <div className="flex h-[min(640px,80vh)] flex-col overflow-hidden">
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
  )
}
