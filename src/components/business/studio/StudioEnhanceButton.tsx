'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { adapterHasCapability } from '@/constants/llm-capability'
import { cn } from '@/lib/utils'
import {
  studioChipActiveClass,
  studioDialogBaseClass,
  StudioPanelHeader,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

const PromptAssistantPanel = dynamic(
  () =>
    import('@/components/business/prompts/PromptAssistantPanel').then(
      (mod) => mod.PromptAssistantPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

interface StudioEnhanceButtonProps {
  disabled?: boolean
}

/**
 * StudioEnhanceButton — toolbar trigger that opens the PromptAssistantPanel
 * in a responsive heavy panel. Enhance is intentionally heavier than its toolbar
 * siblings (style / refImage / aspect): it bundles an LLM textarea, style
 * picker, and Gemini quick-setup, so it uses desktop Dialog / mobile Drawer
 * instead of a popover that would clip on smaller viewports.
 */
export function StudioEnhanceButton({ disabled }: StudioEnhanceButtonProps) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, styles, promptEnhance } = useStudioData()
  const t = useTranslations('StudioV2')
  const { selectedModel: imageSelectedModel } = useImageModelOptions()
  const { selectedModel: videoSelectedModel } = useVideoModelOptions(
    state.selectedOptionId ?? '',
  )
  const { selectedModel: audioSelectedModel } = useAudioModelOptions()
  const { keys: apiKeys } = useApiKeysContext()

  const llmApiKeys = apiKeys
    .filter((k) => k.isActive && adapterHasCapability(k.adapterType, 'enhance'))
    .map((k) => ({ id: k.id, label: k.label || k.adapterType }))

  const selectedStyleCard = styles.activeCard
  const selectedModel =
    state.outputType === 'audio'
      ? audioSelectedModel
      : state.outputType === 'video'
        ? videoSelectedModel
        : imageSelectedModel
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)

  const open = state.panels.enhance
  const isEnhancing = promptEnhance.isEnhancing

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(nextOpen) =>
        dispatch({
          type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'enhance',
        })
      }
    >
      <ResponsiveDialogTrigger asChild>
        <Toolbar.Button
          type="button"
          disabled={disabled || isEnhancing}
          aria-label={t('enhance')}
          className={cn(studioToolTriggerClass, open && studioChipActiveClass)}
        >
          <Sparkles className={cn('size-4', isEnhancing && 'animate-pulse')} />
          <span className="hidden sm:inline">{t('enhance')}</span>
        </Toolbar.Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent
        className={cn(
          studioDialogBaseClass,
          'w-[calc(100vw-2rem)] !max-w-[calc(100vw-2rem)] sm:w-[min(860px,calc(100vw-4rem))] sm:!max-w-[860px]',
        )}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {/* 可见头部 — 与 StudioDockPanelArea 的 Dialog 型面板同规范（决议 5 契约） */}
        <StudioPanelHeader
          icon={<Sparkles className="size-3.5 text-primary" />}
        >
          {t('enhance')}
        </StudioPanelHeader>
        <ResponsiveDialogDescription className="sr-only">
          {t('enhance')}
        </ResponsiveDialogDescription>
        <div className="flex h-[min(680px,75vh)] flex-col overflow-hidden px-5 pb-5 pt-3">
          <PromptAssistantPanel
            currentPrompt={state.prompt}
            modelId={modelId}
            referenceImageData={imageUpload.referenceImages[0]}
            llmApiKeys={llmApiKeys}
            onUsePrompt={(text) => {
              dispatch({ type: 'SET_PROMPT', payload: text })
            }}
            onAppendPrompt={(text) => {
              const current = state.prompt.trim()
              dispatch({
                type: 'SET_PROMPT',
                payload: current ? `${current}, ${text}` : text,
              })
            }}
            onClose={() => {
              dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' })
            }}
          />
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
