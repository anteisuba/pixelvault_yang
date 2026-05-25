'use client'

import Image from 'next/image'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ChangeEvent,
} from 'react'
import {
  ArrowLeft,
  Clipboard,
  ExternalLink,
  ImageIcon,
  Images,
  Library,
  Loader2,
  Trash2,
  Upload,
  WandSparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import {
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_CHARACTER_IMAGE_OUTPUT,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_REFERENCE_SOURCE_IDS,
} from '@/constants/node-studio'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { CharacterImageLoraControls } from '@/components/business/studio/node/CharacterImageLoraControls'
import { CharacterImageReferenceControls } from '@/components/business/studio/node/CharacterImageReferenceControls'
import { WorkflowModelPicker } from '@/components/business/studio/node/WorkflowModelPicker'
import { useNodeReferenceUpload } from '@/hooks/use-node-reference-upload'
import { useRouter } from '@/i18n/navigation'
import type { GenerationRecord, NodeWorkflowNode } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { InspectorField } from './InspectorField'

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

interface CharacterImageInspectorProps {
  node: NodeWorkflowNode
}

export function CharacterImageInspector({
  node,
}: CharacterImageInspectorProps) {
  const t = useTranslations('StudioNode.characterImage')
  const router = useRouter()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const existingImageInputRef = useRef<HTMLInputElement>(null)
  const existingPasteTargetRef = useRef<HTMLDivElement>(null)
  const { generateCharacterImage, modelOptionsByType, updateNodeData } =
    useNodeWorkflowActions()
  const { uploadFile, isUploading: isExistingImageUploading } =
    useNodeReferenceUpload()
  const imageUrl =
    typeof node.data.imageUrl === 'string' ? node.data.imageUrl : null
  const imageSource =
    node.data.imageSource ??
    (imageUrl ? NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated : undefined)
  const isExistingImage =
    Boolean(imageUrl) &&
    imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
  const imageMode =
    node.data.imageMode ??
    (isExistingImage
      ? NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing
      : NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice)
  const isChoiceMode = imageMode === NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice
  const isAiMode = imageMode === NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai
  const isExistingMode =
    imageMode === NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing
  const characterName =
    typeof node.data.characterName === 'string'
      ? node.data.characterName
      : (node.data.character?.name ?? t('namePrefix'))
  const generationStatus =
    node.data.generationStatus ??
    (imageUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    node.data.status === NODE_STATUS_IDS.running
  const modelOptions = modelOptionsByType[NODE_TYPE_IDS.characterImage] ?? []
  const prompt = node.data.prompt.trim()
  const referenceAssets = useMemo(
    () => node.data.referenceAssets ?? [],
    [node.data.referenceAssets],
  )
  const loras = useMemo(() => node.data.loras ?? [], [node.data.loras])
  const maxReferenceImages = node.data.model
    ? getMaxReferenceImages(
        node.data.model.adapterType,
        node.data.model.modelId,
      )
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems
  const disabledReason = isPending
    ? t('generating')
    : !node.data.model
      ? t('noModel')
      : !prompt
        ? t('noPrompt')
        : null
  const statusLabelKey = isExistingImage
    ? 'statusExisting'
    : getStatusLabelKey(generationStatus)
  const generateButtonLabel = imageUrl
    ? isExistingImage
      ? t('generateFromExisting')
      : t('regenerate')
    : t('generate')

  const handleChooseAiMode = useCallback(() => {
    updateNodeData(node.id, {
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
    })
  }, [node.id, updateNodeData])

  const handleReturnToChoice = useCallback(() => {
    updateNodeData(node.id, {
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
    })
  }, [node.id, updateNodeData])

  const applyExistingImage = useCallback(
    (url: string, generationId: string | undefined, label: string) => {
      const sourceLabel = label
        .trim()
        .slice(0, NODE_STUDIO_CHARACTER_IMAGE_OUTPUT.maxSourceLabelLength)

      updateNodeData(node.id, {
        generationError: undefined,
        generationId,
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        imageUrl: url,
        sourceGenerationId: generationId,
        sourceLabel: sourceLabel || t('sourceFallback'),
        status: NODE_STATUS_IDS.done,
      })
    },
    [node.id, t, updateNodeData],
  )

  const handleSelectExistingImage = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) {
        return
      }

      applyExistingImage(
        generation.url,
        generation.id,
        generation.prompt || generation.model || t('sourceFallback'),
      )
    },
    [applyExistingImage, t],
  )

  const handleUploadExistingImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix)) {
        return
      }

      const result = await uploadFile(
        file,
        NODE_STUDIO_CHARACTER_IMAGE_OUTPUT.uploadNote,
      )
      if (result.success && result.url) {
        applyExistingImage(
          result.url,
          result.generationId,
          file.name || t('sourceFallback'),
        )
        return
      }

      toast.error(result.error ?? t('existing.uploadFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [applyExistingImage, t, uploadFile],
  )

  const handleExistingFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (existingImageInputRef.current) {
        existingImageInputRef.current.value = ''
      }
      if (!file) {
        return
      }
      void handleUploadExistingImage(file)
    },
    [handleUploadExistingImage],
  )

  const handleExistingPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const file = Array.from(event.clipboardData.files).find((entry) =>
        entry.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      if (!file) {
        toast.info(t('existing.pasteEmpty'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      event.preventDefault()
      void handleUploadExistingImage(file)
    },
    [handleUploadExistingImage, t],
  )

  const handleClearImage = useCallback(() => {
    updateNodeData(node.id, {
      generationError: undefined,
      generationId: undefined,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
      imageSource: undefined,
      imageUrl: undefined,
      sourceGenerationId: undefined,
      sourceLabel: undefined,
      status: NODE_STATUS_IDS.idle,
    })
  }, [node.id, updateNodeData])

  const handleUseExistingAsReference = useCallback(() => {
    if (!imageUrl) {
      return
    }

    const existingReference = {
      id: node.data.sourceGenerationId ?? `existing-${node.id}`,
      url: imageUrl,
      role: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
      weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
      source: NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
      sourceId: node.data.sourceGenerationId,
      name: node.data.sourceLabel ?? t('sourceExisting'),
    }
    const nextReferences = [
      existingReference,
      ...referenceAssets.filter((reference) => reference.url !== imageUrl),
    ].slice(0, maxReferenceImages)

    updateNodeData(node.id, {
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
      referenceAssets: nextReferences,
    })
  }, [
    imageUrl,
    maxReferenceImages,
    node.data.sourceGenerationId,
    node.data.sourceLabel,
    node.id,
    referenceAssets,
    t,
    updateNodeData,
  ])

  const handleCharacterNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateNodeData(node.id, { characterName: event.target.value })
    },
    [node.id, updateNodeData],
  )

  const handlePromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(node.id, { prompt: event.target.value })
    },
    [node.id, updateNodeData],
  )

  const handleGenerate = useCallback(() => {
    void generateCharacterImage?.(node.id)
  }, [generateCharacterImage, node.id])

  const handleInsertLoraTrigger = useCallback(
    (triggerWord: string) => {
      if (!triggerWord || node.data.prompt.includes(triggerWord)) {
        return
      }

      const nextPrompt = node.data.prompt.trim()
        ? `${node.data.prompt.trim()} ${triggerWord}`
        : triggerWord
      updateNodeData(node.id, { prompt: nextPrompt })
    },
    [node.data.prompt, node.id, updateNodeData],
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

  const existingImagePickerContent = (
    <PopoverContent
      align="center"
      sideOffset={8}
      collisionPadding={12}
      onPaste={handleExistingPaste}
      className="w-72 rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
    >
      <div className="border-b border-node-panel-inner px-4 py-3">
        <p className="text-sm font-semibold text-node-foreground">
          {t('existing.title')}
        </p>
        <p className="mt-1 text-xs leading-5 text-node-muted">
          {t('existing.hint')}
        </p>
      </div>
      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={() => existingImageInputRef.current?.click()}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner"
        >
          {isExistingImageUploading ? (
            <Loader2 className="size-4 animate-spin text-node-amber" />
          ) : (
            <Upload className="size-4 text-node-amber" />
          )}
          {t('existing.upload')}
        </button>
        <button
          type="button"
          onClick={() => setAssetDialogOpen(true)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner"
        >
          <Library className="size-4 text-node-amber" />
          {t('existing.asset')}
        </button>
        <div
          ref={existingPasteTargetRef}
          role="button"
          tabIndex={0}
          onClick={() => existingPasteTargetRef.current?.focus()}
          onPaste={handleExistingPaste}
          className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-3 text-center text-node-muted outline-none transition-colors hover:border-node-amber/40 hover:text-node-foreground focus-visible:border-node-amber/60 focus-visible:ring-2 focus-visible:ring-node-amber/20"
        >
          <Clipboard className="size-4 text-node-amber" />
          <span className="text-xs font-semibold">{t('existing.paste')}</span>
          <span className="text-2xs">{t('existing.pasteMeta')}</span>
        </div>
      </div>
      <input
        ref={existingImageInputRef}
        type="file"
        accept={NODE_STUDIO_IMAGE_INPUT.accept}
        className="hidden"
        onChange={handleExistingFileInputChange}
      />
    </PopoverContent>
  )

  return (
    <>
      <div className="space-y-4">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-node-panel-inner bg-node-panel-soft">
          {imageUrl ? (
            <>
              <Image
                src={imageUrl}
                alt={t('imageAlt', { name: characterName })}
                fill
                sizes="360px"
                className="object-cover"
                unoptimized
              />
              <span className="absolute left-2 top-2 rounded-full border border-node-panel-inner bg-node-canvas/75 px-2 py-1 text-2xs font-semibold text-node-foreground backdrop-blur">
                {isExistingImage ? t('sourceExisting') : t('sourceGenerated')}
              </span>
              <button
                type="button"
                onClick={handleClearImage}
                aria-label={t('clearImage')}
                className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border border-node-panel-inner bg-node-canvas/75 text-node-muted backdrop-blur transition-colors hover:text-node-foreground"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <ImageIcon className="size-8 text-rose-200" />
              <p className="text-xs leading-5 text-node-muted">
                {t('emptyPreview')}
              </p>
            </div>
          )}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Loader2 className="size-5 animate-spin text-rose-200" />
              <span className="text-xs font-semibold">{t('generating')}</span>
            </div>
          ) : null}
        </div>

        {isChoiceMode ? (
          <div className="space-y-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3 text-left transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-node-panel-inner text-rose-200">
                    <Images className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-node-foreground">
                      {t('modeExistingTitle')}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-node-muted">
                      {t('modeExistingDescription')}
                    </span>
                  </span>
                </button>
              </PopoverTrigger>
              {existingImagePickerContent}
            </Popover>

            <button
              type="button"
              onClick={handleChooseAiMode}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-node-amber/35 bg-node-amber/10 p-3 text-left transition-colors hover:border-node-amber/60 hover:bg-node-amber/15"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-node-amber/15 text-node-amber">
                <WandSparkles className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-node-foreground">
                  {t('modeAiTitle')}
                </span>
                <span className="mt-1 block text-xs leading-5 text-node-muted">
                  {t('modeAiDescription')}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={handleOpenImageStudio}
              className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3 text-left transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-node-panel-inner text-node-foreground">
                <ExternalLink className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-node-foreground">
                  {t('modeStudioTitle')}
                </span>
                <span className="mt-1 block text-xs leading-5 text-node-muted">
                  {t('modeStudioDescription')}
                </span>
              </span>
            </button>
          </div>
        ) : null}

        {isExistingMode ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-node-panel-inner text-rose-200">
                <Images className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-node-foreground">
                  {t('activeExistingTitle')}
                </p>
                <p className="mt-1 text-xs leading-5 text-node-muted">
                  {t('activeExistingDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReturnToChoice}
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-node-panel-inner bg-node-panel text-node-muted transition-colors hover:text-node-foreground"
                aria-label={t('backToChoice')}
              >
                <ArrowLeft className="size-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted transition-colors hover:border-node-amber/40 hover:text-node-foreground"
                  >
                    <Images className="size-3.5" />
                    {imageUrl ? t('replaceImage') : t('selectExistingShort')}
                  </button>
                </PopoverTrigger>
                {existingImagePickerContent}
              </Popover>
              <button
                type="button"
                onClick={handleUseExistingAsReference}
                disabled={!imageUrl}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground disabled:text-node-subtle"
              >
                <WandSparkles className="size-3.5" />
                {t('useExistingAsReference')}
              </button>
            </div>
          </div>
        ) : null}

        {isAiMode ? (
          <>
            <div className="flex items-start gap-3 rounded-2xl border border-node-amber/25 bg-node-amber/10 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-node-amber/15 text-node-amber">
                <WandSparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-node-foreground">
                  {t('activeAiTitle')}
                </p>
                <p className="mt-1 text-xs leading-5 text-node-muted">
                  {t('activeAiDescription')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReturnToChoice}
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-node-panel-inner bg-node-panel text-node-muted transition-colors hover:text-node-foreground"
                aria-label={t('backToChoice')}
              >
                <ArrowLeft className="size-3.5" />
              </button>
            </div>

            <InspectorField
              label={t('nameLabel')}
              statusDotClassName="bg-rose-200"
            >
              <input
                value={characterName}
                onChange={handleCharacterNameChange}
                aria-label={t('nameLabel')}
                className="h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm font-semibold text-node-foreground outline-none focus-visible:border-node-amber focus-visible:ring-2 focus-visible:ring-node-amber/20"
              />
            </InspectorField>

            <InspectorField label={t('promptLabel')}>
              <Textarea
                value={node.data.prompt}
                onChange={handlePromptChange}
                aria-label={t('promptLabel')}
                placeholder={t('promptPlaceholder')}
                className="min-h-28 resize-none rounded-2xl border-node-panel-inner bg-node-panel-soft text-sm leading-6 text-node-foreground shadow-none placeholder:text-node-subtle focus-visible:border-node-amber focus-visible:ring-node-amber/30"
              />
            </InspectorField>

            <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
              <WorkflowModelPicker
                value={node.data.model}
                options={modelOptions}
                onChange={(model) => updateNodeData(node.id, { model })}
              />
              <p className="mt-1 truncate px-1 text-2xs font-medium text-node-subtle">
                {t(statusLabelKey)}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
              <CharacterImageReferenceControls
                value={referenceAssets}
                maxItems={maxReferenceImages}
                onChange={(nextReferences) =>
                  updateNodeData(node.id, { referenceAssets: nextReferences })
                }
              />
              <CharacterImageLoraControls
                value={loras}
                model={node.data.model}
                onChange={(nextLoras) =>
                  updateNodeData(node.id, { loras: nextLoras })
                }
                onInsertTrigger={handleInsertLoraTrigger}
              />
            </div>

            {node.data.generationError ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
                {node.data.generationError}
              </div>
            ) : null}

            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex w-full">
                    <Button
                      type="button"
                      disabled={Boolean(disabledReason)}
                      onClick={handleGenerate}
                      className="h-10 w-full rounded-2xl bg-node-foreground text-sm font-semibold text-node-canvas hover:bg-node-foreground/90 disabled:bg-node-panel-inner disabled:text-node-muted"
                    >
                      {isPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <WandSparkles className="mr-2 size-4" />
                      )}
                      {generateButtonLabel}
                    </Button>
                  </span>
                </TooltipTrigger>
                {disabledReason ? (
                  <TooltipContent side="top">{disabledReason}</TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          </>
        ) : null}
      </div>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={handleSelectExistingImage}
        title={t('existingAssetDialogTitle')}
        description={t('existingAssetDialogDescription')}
        mediaType="image"
      />
    </>
  )
}
