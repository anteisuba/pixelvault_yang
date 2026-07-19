'use client'

import Image from 'next/image'
import {
  AlertCircle,
  Mic2,
  Trash2,
  Upload,
  Video,
  WandSparkles,
} from 'lucide-react'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import { useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowFieldId,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { ROUTES } from '@/constants/routes'
import { STUDIO_NODE_HANDOFF_MAX_REFERENCES } from '@/constants/studio'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { writeStudioNodeHandoff } from '@/lib/studio-node-handoff'
import { cn } from '@/lib/utils'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { CharacterImageLoraControls } from '@/components/business/node/CharacterImageLoraControls'
import {
  CharacterImageReferenceControls,
  type CharacterReferenceGalleryExtraItem,
} from '@/components/business/node/CharacterImageReferenceControls'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { IMEAwareInput, IMEAwareTextarea } from './IMEAwareField'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WorkflowModelPicker } from '@/components/business/node/WorkflowModelPicker'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import {
  buildNodeWorkflowPrompt,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import type { GenerationRecord } from '@/types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { InspectorField } from './InspectorField'

interface NodeMediaInspectorProps {
  node: NodeWorkflowNode
  type: NodeWorkflowNodeType
  kind: NodeWorkflowMediaKind
  /**
   * Role-specific extras rendered in the identity region (below the preview,
   * above the source control) — e.g. a character node's always-visible name
   * field + bound-voice hint. Background/shot/frame leave it absent.
   */
  roleExtras?: ReactNode
  /**
   * Reference chips rendered at the top of the AI generate form — e.g. a shot
   * node's connected character/background nodes (click to insert the name into
   * the prompt, × to drop the edge). Only shot passes this today.
   */
  referenceChips?: ReactNode
  /**
   * S5c 二.2 档案面板视觉身份区: switches the reference-image control from the
   * compact popover chip (default, every other caller) to the always-visible
   * gallery grid. Only `CharacterImageInspector`/`BackgroundImageInspector`
   * pass `'gallery'` (+ the two props below) — shot/frame/shotText keep the
   * unchanged compact chip.
   */
  referenceGalleryMode?: 'popover' | 'gallery'
  /** Gallery mode only: closeup images merged in read-only, labeled by source. */
  referenceGalleryExtraItems?: readonly CharacterReferenceGalleryExtraItem[]
  /** Gallery mode only: 拆出 (§三.4). */
  onExtractReference?(referenceId: string): void
  /** Collector dossiers use referenceAssets as their only visual-input path.
   * Hide the standalone media preview/source switcher to avoid presenting the
   * same upload/library actions twice. */
  identityAssetsOnly?: boolean
}

function getStatusLabelKey(
  generationStatus: string | undefined,
  hasMedia: boolean,
  kind: NodeWorkflowMediaKind,
):
  | 'statusIdle'
  | 'statusPending'
  | 'statusSuccess'
  | 'statusError'
  | 'statusTextReady' {
  if (kind === NODE_MEDIA_KIND_IDS.text) {
    return 'statusTextReady'
  }

  switch (generationStatus) {
    case NODE_GENERATION_STATUS_IDS.pending:
      return 'statusPending'
    case NODE_GENERATION_STATUS_IDS.success:
      return 'statusSuccess'
    case NODE_GENERATION_STATUS_IDS.error:
      return 'statusError'
    default:
      return hasMedia ? 'statusSuccess' : 'statusIdle'
  }
}

function getEmptyPreviewIcon(kind: NodeWorkflowMediaKind) {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
      return <Video className="size-8 text-node-port-video" />
    case NODE_MEDIA_KIND_IDS.audio:
      return <Mic2 className="size-8 text-node-port-voice" />
    default:
      return <WandSparkles className="size-8 text-node-muted" />
  }
}

export function NodeMediaInspector({
  node,
  type,
  kind,
  roleExtras,
  referenceChips,
  referenceGalleryMode = 'popover',
  referenceGalleryExtraItems,
  onExtractReference,
  identityAssetsOnly = false,
}: NodeMediaInspectorProps) {
  const t = useTranslations('StudioNode.mediaNodes')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tWorkflows = useTranslations('StudioNode.workflowNodes')
  const router = useRouter()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  // Ephemeral editing target — NEVER persisted. `'ai'` reveals the generate
  // form below the preview; `null` is the default result/empty view (preview or
  // upload dropzone + the source row, no form). Because it is component-local
  // state, no persisted field can ever hide an existing image.
  const [editTarget, setEditTarget] = useState<'ai' | null>(null)
  const existingImageInputRef = useRef<HTMLInputElement>(null)

  const { generateMediaNode, modelOptionsByType, updateNodeData } =
    useNodeWorkflowActions()
  const { uploadFile, isUploading: isExistingImageUploading } =
    useNodeReferenceUpload()
  const mediaUrl =
    typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl : null
  const videoThumbnailUrl =
    typeof node.data.videoThumbnailUrl === 'string'
      ? node.data.videoThumbnailUrl
      : undefined
  const modelOptions = modelOptionsByType[type] ?? []
  const prompt = buildNodeWorkflowPrompt(type, node.data).trim()
  const referenceAssets = useMemo(
    () => node.data.referenceAssets ?? [],
    [node.data.referenceAssets],
  )
  const loras = useMemo(() => node.data.loras ?? [], [node.data.loras])
  const isImageNode = kind === NODE_MEDIA_KIND_IDS.image
  const hasMedia = Boolean(mediaUrl)
  const isExistingImage =
    isImageNode &&
    hasMedia &&
    node.data.imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
  const maxReferenceImages = node.data.model
    ? getMaxReferenceImages(
        node.data.model.adapterType,
        node.data.model.modelId,
      )
    : NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems
  const fields = NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[type] ?? [
    NODE_WORKFLOW_FIELD_IDS.prompt,
  ]
  const generationStatus =
    node.data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    node.data.status === NODE_STATUS_IDS.running
  const isTextNode = kind === NODE_MEDIA_KIND_IDS.text
  // Unified image layout (角色/背景/镜头 share one shell):
  //   - empty  → the preview block becomes an upload / paste / drop dropzone
  //   - filled → the image preview (与 collapsed card 一致)
  //   - source row (素材库 / AI 生成 / Studio) always shows for image nodes
  //   - the generate form only opens behind "AI 生成" (editTarget === 'ai')
  // Non-image nodes (e.g. shotText) keep their form-always behavior.
  const showUploadDropzone = isImageNode && !hasMedia && !identityAssetsOnly
  const showSourceRow = isImageNode && !identityAssetsOnly
  const showAiForm = identityAssetsOnly
    ? false
    : isImageNode
      ? editTarget === 'ai'
      : true
  const disabledReason = isPending
    ? t('generating')
    : !node.data.model && !isTextNode
      ? t('noModel')
      : !prompt && !isTextNode
        ? t('noPrompt')
        : null
  const statusLabelKey = getStatusLabelKey(
    generationStatus,
    Boolean(mediaUrl),
    kind,
  )
  const generateButtonLabel =
    isImageNode && isExistingImage
      ? t('generateFromExisting')
      : mediaUrl
        ? t('regenerate')
        : t('generate')

  const handleFieldChange = useCallback(
    (fieldId: NodeWorkflowFieldId, value: string) => {
      const nextData = {
        ...node.data,
        [fieldId]: value,
      }

      updateNodeData(node.id, {
        [fieldId]: value,
        status: buildNodeWorkflowPrompt(type, nextData).trim()
          ? NODE_STATUS_IDS.ready
          : NODE_STATUS_IDS.idle,
      })
    },
    [node.data, node.id, type, updateNodeData],
  )

  // Toggle the AI generate form. Purely ephemeral — never persists a field
  // that could hide the preview above.
  const toggleAiForm = useCallback(() => {
    setEditTarget((current) => (current === 'ai' ? null : 'ai'))
  }, [])

  const applyExistingImage = useCallback(
    (url: string, generationId: string | undefined, label: string) => {
      const sourceLabel = label
        .trim()
        .slice(0, NODE_STUDIO_MEDIA_IMAGE_OUTPUT.maxSourceLabelLength)

      updateNodeData(node.id, {
        generationError: undefined,
        generationId,
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaKind: kind,
        mediaLabel: sourceLabel || t('sourceFallback'),
        mediaUrl: url,
        sourceGenerationId: generationId,
        sourceLabel: sourceLabel || t('sourceFallback'),
        status: NODE_STATUS_IDS.done,
      })
      setEditTarget(null)
    },
    [kind, node.id, t, updateNodeData],
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
        NODE_STUDIO_MEDIA_IMAGE_OUTPUT.uploadNote,
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

  const handleDropExistingImage = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const file = Array.from(event.dataTransfer.files).find((entry) =>
        entry.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
      )
      if (!file) {
        return
      }
      void handleUploadExistingImage(file)
    },
    [handleUploadExistingImage],
  )

  const handleClearImage = useCallback(() => {
    updateNodeData(node.id, {
      generationError: undefined,
      generationId: undefined,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageSource: undefined,
      mediaLabel: undefined,
      mediaUrl: undefined,
      sourceGenerationId: undefined,
      sourceLabel: undefined,
      status: NODE_STATUS_IDS.idle,
    })
    setEditTarget(null)
  }, [node.id, updateNodeData])

  const handleGenerate = useCallback(() => {
    // Stay in the AI view after generating so the preview + the prompt that
    // produced it coexist (instead of collapsing back to the bare result view).
    setEditTarget('ai')
    void generateMediaNode?.(node.id)
  }, [generateMediaNode, node.id])

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
    const styleCode = loras.find((lora) => lora.styleCode)?.styleCode
    const characterName =
      typeof node.data.characterName === 'string'
        ? node.data.characterName.trim()
        : ''

    // Round-trip handoff: carry full context out so Studio can prefill and,
    // crucially, write the generated result BACK to this node (no dead-end).
    writeStudioNodeHandoff({
      originNodeId: node.id,
      prompt,
      characterName: characterName || undefined,
      referenceUrls: referenceAssets
        .map((reference) => reference.url)
        .slice(0, STUDIO_NODE_HANDOFF_MAX_REFERENCES),
      styleCode: styleCode || undefined,
    })

    router.push(
      styleCode
        ? `${ROUTES.STUDIO_IMAGE}?style=${encodeURIComponent(styleCode)}`
        : ROUTES.STUDIO_IMAGE,
    )
  }, [loras, node.data.characterName, node.id, prompt, referenceAssets, router])

  const renderField = (fieldId: NodeWorkflowFieldId) => {
    const value = getNodeWorkflowFieldValue(node.data, fieldId)
    const isLongField =
      fieldId === NODE_WORKFLOW_FIELD_IDS.prompt ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.action ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.composition ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.dialogue ||
      fieldId === NODE_WORKFLOW_FIELD_IDS.motion
    const commonClassName =
      'w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm leading-6 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20'

    return (
      <InspectorField
        key={fieldId}
        label={tFields(`${fieldId}.label`)}
        statusDotClassName="bg-node-muted"
      >
        {isLongField ? (
          <IMEAwareTextarea
            value={value}
            onValueChange={(next) => handleFieldChange(fieldId, next)}
            aria-label={tFields(`${fieldId}.label`)}
            placeholder={tFields(`${fieldId}.placeholder`)}
            className="min-h-24 w-full resize-none rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-sm leading-6 text-node-foreground shadow-none outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
          />
        ) : (
          <IMEAwareInput
            value={value}
            onValueChange={(next) => handleFieldChange(fieldId, next)}
            aria-label={tFields(`${fieldId}.label`)}
            placeholder={tFields(`${fieldId}.placeholder`)}
            className={`${commonClassName} h-10`}
          />
        )}
      </InspectorField>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {!identityAssetsOnly ? (
          <div
            className={cn(
              'relative aspect-video overflow-hidden rounded-2xl border bg-node-panel-soft',
              showUploadDropzone
                ? 'border-dashed border-node-edge'
                : 'border-node-panel-inner',
            )}
          >
            {showUploadDropzone ? (
              <div
                role="button"
                tabIndex={0}
                aria-label={t('existing.upload')}
                onClick={() => existingImageInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    existingImageInputRef.current?.click()
                  }
                }}
                onPaste={handleExistingPaste}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDropExistingImage}
                className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 px-4 text-center outline-none transition-colors hover:bg-node-panel-inner focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
              >
                {isExistingImageUploading ? (
                  <Spinner size="lg" className="text-node-muted" />
                ) : (
                  <Upload className="size-7 text-node-muted" />
                )}
                <span className="text-sm font-semibold text-node-foreground">
                  {t('existing.upload')}
                </span>
                <span className="text-2xs leading-4 text-node-muted">
                  {t('dropzoneHint')}
                </span>
                <input
                  ref={existingImageInputRef}
                  type="file"
                  accept={NODE_STUDIO_IMAGE_INPUT.accept}
                  className="hidden"
                  onChange={handleExistingFileInputChange}
                />
              </div>
            ) : (
              <>
                {mediaUrl && kind === NODE_MEDIA_KIND_IDS.image ? (
                  <>
                    <Image
                      src={mediaUrl}
                      alt={t('imageAlt')}
                      fill
                      sizes="360px"
                      className="object-cover"
                      unoptimized
                    />
                    <span className="absolute left-2 top-2 rounded-full border border-node-panel-inner bg-node-canvas/75 px-2 py-1 text-2xs font-semibold text-node-foreground backdrop-blur">
                      {isExistingImage
                        ? t('sourceExisting')
                        : t('sourceGenerated')}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearImage}
                      aria-label={t('clearImage')}
                      className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full border border-node-panel-inner bg-node-canvas/75 text-node-muted outline-none backdrop-blur transition-colors hover:text-node-foreground focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                ) : null}

                {mediaUrl && kind === NODE_MEDIA_KIND_IDS.video ? (
                  <video
                    src={mediaUrl}
                    poster={videoThumbnailUrl}
                    className="h-full w-full object-cover"
                    controls
                    muted
                  />
                ) : null}

                {mediaUrl && kind === NODE_MEDIA_KIND_IDS.audio ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
                    <Mic2 className="size-8 text-node-port-voice" />
                    <audio src={mediaUrl} controls className="w-full" />
                  </div>
                ) : null}

                {!mediaUrl ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                    {getEmptyPreviewIcon(kind)}
                    <p className="text-xs leading-5 text-node-muted">
                      {tWorkflows(`${type}.emptyPreview`)}
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {isPending ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
                <Spinner size="lg" className="text-node-muted" />
                <span className="text-xs font-semibold">{t('generating')}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Generation error — TOP-LEVEL so it surfaces in every view (result,
            empty, editing), not only inside the AI form. */}
        {node.data.generationError ? (
          <div className="flex gap-2 rounded-2xl border border-node-status-failed bg-node-status-failed/50 p-3 text-sm text-node-status-failed-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="line-clamp-3 text-xs leading-5 text-node-status-failed-fg/80">
              {node.data.generationError}
            </p>
          </div>
        ) : null}

        {/* Role-specific identity extras (e.g. character name + bound voice). */}
        {roleExtras}

        {/* Unified source row — 素材库 opens the asset dialog directly, AI 生成
            toggles the generate form, Studio hands off to the image studio. */}
        {showSourceRow ? (
          <div className="flex gap-1 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-1">
            <button
              type="button"
              onClick={() => setAssetDialogOpen(true)}
              className="flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
            >
              {t('changeSourceExisting')}
            </button>
            <button
              type="button"
              onClick={toggleAiForm}
              className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-node-focus-ring/20 ${
                editTarget === 'ai'
                  ? 'bg-node-foreground text-node-canvas'
                  : 'text-node-muted hover:text-node-foreground'
              }`}
            >
              {t('changeSourceAi')}
            </button>
            <button
              type="button"
              onClick={handleOpenImageStudio}
              className="flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold text-node-muted outline-none transition-colors hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
            >
              {t('changeSourceStudio')}
            </button>
          </div>
        ) : null}

        {/* S5c 二.2 视觉身份区: in gallery mode this sits OUTSIDE showAiForm —
            a dossier's reference gallery is identity, not a step of "now
            generating a new image," so it must stay visible in every source
            tab (素材库/AI生成/Studio), not only behind editTarget==='ai'
            (the compact-inspector default every other caller keeps). */}
        {isImageNode && referenceGalleryMode === 'gallery' ? (
          <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
            <CharacterImageReferenceControls
              value={referenceAssets}
              maxItems={maxReferenceImages}
              onChange={(nextReferences) =>
                updateNodeData(node.id, { referenceAssets: nextReferences })
              }
              mode="gallery"
              extraItems={referenceGalleryExtraItems}
              onExtract={
                onExtractReference
                  ? (reference) => onExtractReference(reference.id)
                  : undefined
              }
            />
          </div>
        ) : null}

        {showAiForm ? (
          <>
            {referenceChips}
            <div className="space-y-3">
              {fields.map((fieldId) => renderField(fieldId))}
            </div>

            {!isTextNode ? (
              <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
                <WorkflowModelPicker
                  value={node.data.model}
                  options={modelOptions}
                  onChange={(model) => updateNodeData(node.id, { model })}
                  kind={kind}
                />
                <p className="mt-1 truncate px-1 text-2xs font-medium text-node-subtle">
                  {t(statusLabelKey)}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-xs leading-5 text-node-muted">
                {t(statusLabelKey)}
              </div>
            )}

            {isImageNode && referenceGalleryMode === 'gallery' ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
                <CharacterImageLoraControls
                  value={loras}
                  model={node.data.model}
                  onChange={(nextLoras) =>
                    updateNodeData(node.id, { loras: nextLoras })
                  }
                  onInsertTrigger={handleInsertLoraTrigger}
                />
              </div>
            ) : isImageNode ? (
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
            ) : null}

            {!isTextNode ? (
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
                          <Spinner size="md" className="mr-2" />
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
            ) : null}
          </>
        ) : null}
      </div>

      {isImageNode && !identityAssetsOnly ? (
        <AssetSelectorDialog
          open={assetDialogOpen}
          onOpenChange={setAssetDialogOpen}
          onSelect={handleSelectExistingImage}
          title={t('existingAssetDialogTitle')}
          description={t('existingAssetDialogDescription')}
          mediaType="image"
        />
      ) : null}
    </>
  )
}
