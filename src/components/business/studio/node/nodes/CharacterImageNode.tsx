'use client'

import Image from 'next/image'
import {
  useCallback,
  useRef,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { NodeProps } from '@xyflow/react'
import {
  AlertCircle,
  ExternalLink,
  ImageIcon,
  Loader2,
  WandSparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { NODE_STUDIO_CHARACTER_IMAGE_REFERENCES } from '@/constants/node-studio'
import { ROUTES } from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowGenerationStatus,
} from '@/constants/node-types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CharacterImageLoraControls } from '@/components/business/studio/node/CharacterImageLoraControls'
import { CharacterImageReferenceControls } from '@/components/business/studio/node/CharacterImageReferenceControls'
import { useNodeWorkflowActions } from '@/components/business/studio/node/NodeWorkflowActionsContext'
import { WorkflowModelPicker } from '@/components/business/studio/node/WorkflowModelPicker'
import { useRouter } from '@/i18n/navigation'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'

function getStatusLabelKey(
  status: NodeWorkflowGenerationStatus | undefined,
): 'statusIdle' | 'statusPending' | 'statusSuccess' | 'statusError' {
  switch (status) {
    case NODE_GENERATION_STATUS_IDS.pending:
      return 'statusPending'
    case NODE_GENERATION_STATUS_IDS.success:
      return 'statusSuccess'
    case NODE_GENERATION_STATUS_IDS.error:
      return 'statusError'
    default:
      return 'statusIdle'
  }
}

export function CharacterImageNode({
  id,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode.characterImage')
  const router = useRouter()
  const { generateCharacterImage, modelOptionsByType, updateNodeData } =
    useNodeWorkflowActions()
  const isComposingPrompt = useRef(false)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : null
  const characterName = data.character?.name ?? t('namePrefix')
  const generationStatus =
    data.generationStatus ??
    (imageUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const isError =
    generationStatus === NODE_GENERATION_STATUS_IDS.error ||
    (data.status === NODE_STATUS_IDS.failed && Boolean(data.generationError))
  const modelOptions = modelOptionsByType[NODE_TYPE_IDS.characterImage] ?? []
  const prompt = data.prompt.trim()
  const referenceAssets = data.referenceAssets ?? []
  const loras = data.loras ?? []
  const maxReferenceImages = data.model
    ? getMaxReferenceImages(data.model.adapterType, data.model.modelId)
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems
  const disabledReason = isPending
    ? t('generating')
    : !data.model
      ? t('noModel')
      : !prompt
        ? t('noPrompt')
        : null

  const handlePromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (isComposingPrompt.current) {
        return
      }

      updateNodeData(id, { prompt: event.target.value })
    },
    [id, updateNodeData],
  )

  const handlePromptCompositionStart = useCallback(() => {
    isComposingPrompt.current = true
  }, [])

  const handlePromptCompositionEnd = useCallback(
    (event: CompositionEvent<HTMLTextAreaElement>) => {
      isComposingPrompt.current = false
      updateNodeData(id, { prompt: event.currentTarget.value })
    },
    [id, updateNodeData],
  )

  const handlePromptBlur = useCallback(
    (event: FocusEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { prompt: event.currentTarget.value })
    },
    [id, updateNodeData],
  )

  const stopCanvasKeyboardEvent = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      event.stopPropagation()
    },
    [],
  )

  const stopCanvasPointerEvent = useCallback(
    (event: PointerEvent<HTMLTextAreaElement>) => {
      event.stopPropagation()
    },
    [],
  )

  const handleGenerate = useCallback(() => {
    void generateCharacterImage?.(id)
  }, [generateCharacterImage, id])

  const handleInsertLoraTrigger = useCallback(
    (triggerWord: string) => {
      if (!triggerWord) {
        return
      }

      const currentPrompt = promptTextareaRef.current?.value ?? data.prompt
      if (currentPrompt.includes(triggerWord)) {
        return
      }

      const nextPrompt = currentPrompt.trim()
        ? `${currentPrompt.trim()} ${triggerWord}`
        : triggerWord
      if (promptTextareaRef.current) {
        promptTextareaRef.current.value = nextPrompt
      }
      updateNodeData(id, { prompt: nextPrompt })
    },
    [data.prompt, id, updateNodeData],
  )

  const handleOpenImageStudio = useCallback(() => {
    if (prompt) {
      window.sessionStorage.setItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY, prompt)
    }

    const styleCode = loras.find((lora) => lora.styleCode)?.styleCode
    router.push(
      styleCode
        ? `${ROUTES.STUDIO_IMAGE}?style=${encodeURIComponent(styleCode)}`
        : ROUTES.STUDIO_IMAGE,
    )
  }, [loras, prompt, router])

  return (
    <NodeShell type={NODE_TYPE_IDS.characterImage} selected={selected}>
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={data.status}
      />
      <NodeShell.Body className="space-y-3">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-node-panel-inner bg-node-panel-soft">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={t('imageAlt', { name: characterName })}
              fill
              sizes="320px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <ImageIcon className="size-8 text-rose-200" />
              <div>
                <p className="text-sm font-semibold text-node-foreground">
                  {characterName}
                </p>
                <p className="mt-1 text-xs leading-5 text-node-muted">
                  {t('emptyPreview')}
                </p>
              </div>
            </div>
          )}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Loader2 className="size-5 animate-spin text-rose-200" />
              <span className="text-xs font-semibold">{t('generating')}</span>
            </div>
          ) : null}
        </div>

        {isError ? (
          <div className="flex gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">{t('failedTitle')}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-red-100/80">
                {data.generationError}
              </p>
            </div>
          </div>
        ) : null}

        <Textarea
          ref={promptTextareaRef}
          defaultValue={data.prompt}
          onChange={handlePromptChange}
          onBlur={handlePromptBlur}
          onCompositionStart={handlePromptCompositionStart}
          onCompositionEnd={handlePromptCompositionEnd}
          onKeyDownCapture={stopCanvasKeyboardEvent}
          onKeyUpCapture={stopCanvasKeyboardEvent}
          onPointerDownCapture={stopCanvasPointerEvent}
          aria-label={t('promptLabel')}
          placeholder={t('promptPlaceholder')}
          className="nodrag nopan nowheel min-h-24 resize-none rounded-2xl border-node-panel-inner bg-node-panel-soft text-sm leading-6 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-node-amber/30"
        />

        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
          <CharacterImageReferenceControls
            value={referenceAssets}
            maxItems={maxReferenceImages}
            onChange={(nextReferences) =>
              updateNodeData(id, { referenceAssets: nextReferences })
            }
          />
          <CharacterImageLoraControls
            value={loras}
            model={data.model}
            onChange={(nextLoras) => updateNodeData(id, { loras: nextLoras })}
            onInsertTrigger={handleInsertLoraTrigger}
          />
          <button
            type="button"
            onClick={handleOpenImageStudio}
            className="nodrag nopan nowheel ml-auto inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground"
            title={t('openImageStudio')}
          >
            <ExternalLink className="size-3.5" />
            {t('openImageStudioShort')}
          </button>
        </div>
      </NodeShell.Body>
      <NodeShell.Footer className="items-center">
        <div className="min-w-0 flex-1 space-y-1">
          <WorkflowModelPicker
            value={data.model}
            options={modelOptions}
            onChange={(model) => updateNodeData(id, { model })}
          />
          <p className="truncate text-2xs font-medium text-node-subtle">
            {t(getStatusLabelKey(generationStatus))}
          </p>
        </div>
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  disabled={Boolean(disabledReason)}
                  onClick={handleGenerate}
                  className="h-9 rounded-2xl bg-node-foreground px-3 text-xs font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted"
                >
                  {isPending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <WandSparkles className="mr-1.5 size-3.5" />
                  )}
                  {imageUrl ? t('regenerate') : t('generate')}
                </Button>
              </span>
            </TooltipTrigger>
            {disabledReason ? (
              <TooltipContent side="top">{disabledReason}</TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
      </NodeShell.Footer>
    </NodeShell>
  )
}
