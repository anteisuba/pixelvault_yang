'use client'

import Image from 'next/image'
import {
  AlertCircle,
  Clipboard,
  ExternalLink,
  Images,
  Library,
  Loader2,
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
  NODE_STUDIO_REFERENCE_SOURCE_IDS,
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
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { CharacterImageLoraControls } from '@/components/business/node/CharacterImageLoraControls'
import { CharacterImageReferenceControls } from '@/components/business/node/CharacterImageReferenceControls'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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

/**
 * Optional card library slot — when provided, NodeMediaInspector adds a
 * "from card library" choice in the image-choice block and renders a
 * "bound card" hint when the node is currently sourced from a card.
 * BackgroundImageInspector populates this slot using useBackgroundCards;
 * other media node types (frameImage, shotText, etc.) leave it absent
 * and see no behavioral change. All copy lives under the inspector's
 * existing i18n namespace (StudioNode.mediaNodes.cardLibrary.*).
 */
interface NodeMediaCardLibrarySlot {
  cards: ReadonlyArray<{
    id: string
    name: string
    description: string | null
    sourceImageUrl: string | null
    tags?: string[]
  }>
  isLoading: boolean
  /**
   * Currently bound card (typically resolved by the caller from
   * node.data.cardId). Drives the "📇 来自背景卡：xxx" hint.
   */
  boundCard: { id: string; name: string } | null
  onApply: (cardId: string) => void
  /**
   * Per-role copy override. Background leaves this absent and falls back to the
   * generic mediaNodes.cardLibrary.* copy; character passes its own
   * (characterImage.cardLibrary.*) so the wording reads "character card", not
   * "background card".
   */
  labels?: {
    modeTitle: string
    modeDescription: string
    title: string
    hint: string
    empty: string
  }
}

interface NodeMediaInspectorProps {
  node: NodeWorkflowNode
  type: NodeWorkflowNodeType
  kind: NodeWorkflowMediaKind
  cardLibrary?: NodeMediaCardLibrarySlot
  /**
   * Role-specific extras rendered in the identity region (below the preview,
   * above the change-source control) — e.g. a character node's always-visible
   * name field + bound-voice hint. Background/shot/frame leave it absent.
   */
  roleExtras?: ReactNode
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
  cardLibrary,
  roleExtras,
}: NodeMediaInspectorProps) {
  const t = useTranslations('StudioNode.mediaNodes')
  const tFields = useTranslations('StudioNode.workflowFields')
  const tWorkflows = useTranslations('StudioNode.workflowNodes')
  const router = useRouter()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [cardPickerOpen, setCardPickerOpen] = useState(false)
  const [cardPickerQuery, setCardPickerQuery] = useState('')
  // Ephemeral editing target — NEVER persisted. Drives which controls show
  // BELOW the always-on preview. null = default "result" view (preview + a
  // change-source control, no form). Because it is component-local state, no
  // persisted field can ever hide an existing image (the root cause of the
  // old imageMode/imageUrl divergence).
  const [editTarget, setEditTarget] = useState<'ai' | 'existing' | null>(null)
  const existingImageInputRef = useRef<HTMLInputElement>(null)
  const existingPasteTargetRef = useRef<HTMLDivElement>(null)

  // Filter the card library by free-form query (matches name, description,
  // tags). Cards array is empty when no slot was provided, so the filter
  // short-circuits without rebuilding the array.
  const cardSearchResults = useMemo(() => {
    if (!cardLibrary) return []
    const query = cardPickerQuery.trim().toLowerCase()
    if (query.length === 0) return cardLibrary.cards
    return cardLibrary.cards.filter((card) => {
      if (card.name.toLowerCase().includes(query)) return true
      if (card.description?.toLowerCase().includes(query)) return true
      if (card.tags?.some((tag) => tag.toLowerCase().includes(query)))
        return true
      return false
    })
  }, [cardLibrary, cardPickerQuery])
  const { generateMediaNode, modelOptionsByType, updateNodeData } =
    useNodeWorkflowActions()
  const { uploadFile, isUploading: isExistingImageUploading } =
    useNodeReferenceUpload()
  const mediaUrl =
    typeof node.data.mediaUrl === 'string' ? node.data.mediaUrl : null
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
  // Empty image nodes are FORM-FIRST (clean + consistent with video/audio/text
  // nodes): the generate form shows by default with a slim "import instead" row
  // — NOT a heavy full-takeover chooser. With media: preview + a change-source
  // segmented control, and editing controls coexist BELOW the preview.
  const isEmptyImage = isImageNode && !hasMedia
  const showPreviewHero = isImageNode ? hasMedia : true
  const showAiForm = isImageNode ? !hasMedia || editTarget === 'ai' : true
  const showExistingControls =
    isImageNode && hasMedia && editTarget === 'existing'
  const showChangeSource = isImageNode && hasMedia
  const showEmptyImportRow = isEmptyImage
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
  // Card-library copy, with optional per-role overrides (character vs the
  // generic background wording). Falls back to the shared mediaNodes copy.
  const cardCopy = {
    modeTitle: cardLibrary?.labels?.modeTitle ?? t('modeCardTitle'),
    modeDescription:
      cardLibrary?.labels?.modeDescription ?? t('modeCardDescription'),
    title: cardLibrary?.labels?.title ?? t('cardLibrary.title'),
    hint: cardLibrary?.labels?.hint ?? t('cardLibrary.hint'),
    empty: cardLibrary?.labels?.empty ?? t('cardLibrary.empty'),
  }

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

  // Switch which editing controls show below the preview. Purely ephemeral —
  // it replaces the old persisted-imageMode "back to chooser" that stranded a
  // visible image. `null` collapses back to the plain result view.
  const handleChangeSource = useCallback((target: 'ai' | 'existing' | null) => {
    setEditTarget(target)
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

  const handleUseExistingAsReference = useCallback(() => {
    if (!mediaUrl) {
      return
    }

    const existingReference = {
      id: node.data.sourceGenerationId ?? `existing-${node.id}`,
      url: mediaUrl,
      role: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
      weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
      source: NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
      sourceId: node.data.sourceGenerationId,
      name: node.data.sourceLabel ?? t('sourceExisting'),
    }
    const nextReferences = [
      existingReference,
      ...referenceAssets.filter((reference) => reference.url !== mediaUrl),
    ].slice(0, maxReferenceImages)

    updateNodeData(node.id, {
      referenceAssets: nextReferences,
    })
    setEditTarget('ai')
  }, [
    maxReferenceImages,
    mediaUrl,
    node.data.sourceGenerationId,
    node.data.sourceLabel,
    node.id,
    referenceAssets,
    t,
    updateNodeData,
  ])

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
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground transition-colors hover:border-node-edge hover:bg-node-panel-inner"
        >
          {isExistingImageUploading ? (
            <Loader2 className="size-4 animate-spin text-node-muted" />
          ) : (
            <Upload className="size-4 text-node-muted" />
          )}
          {t('existing.upload')}
        </button>
        <button
          type="button"
          onClick={() => setAssetDialogOpen(true)}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft text-xs font-semibold text-node-foreground transition-colors hover:border-node-edge hover:bg-node-panel-inner"
        >
          <Library className="size-4 text-node-muted" />
          {t('existing.asset')}
        </button>
        <div
          ref={existingPasteTargetRef}
          role="button"
          tabIndex={0}
          onClick={() => existingPasteTargetRef.current?.focus()}
          onPaste={handleExistingPaste}
          className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-node-panel-inner bg-node-panel-soft px-3 text-center text-node-muted outline-none transition-colors hover:border-node-edge hover:text-node-foreground focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
        >
          <Clipboard className="size-4 text-node-muted" />
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

  // Card library picker — only rendered when the parent supplies the slot.
  // The popover state stays local because each node instance keeps its own
  // search + scroll position.
  const cardLibraryPickerContent = cardLibrary ? (
    <PopoverContent
      align="center"
      sideOffset={8}
      collisionPadding={12}
      className="w-80 rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
    >
      <div className="border-b border-node-panel-inner px-4 py-3">
        <p className="text-sm font-semibold text-node-foreground">
          {cardCopy.title}
        </p>
        <p className="mt-1 text-xs leading-5 text-node-muted">
          {cardCopy.hint}
        </p>
        <input
          type="search"
          value={cardPickerQuery}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setCardPickerQuery(event.target.value)
          }
          placeholder={t('cardLibrary.searchPlaceholder')}
          className="mt-2 h-9 w-full rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 text-xs leading-4 text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-2">
        {cardLibrary.isLoading ? (
          <div className="flex h-24 items-center justify-center gap-2 text-xs text-node-muted">
            <Loader2 className="size-4 animate-spin text-node-muted" />
            {t('cardLibrary.loading')}
          </div>
        ) : cardSearchResults.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs leading-5 text-node-subtle">
            {cardLibrary.cards.length === 0
              ? cardCopy.empty
              : t('cardLibrary.noMatch')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {cardSearchResults.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => {
                    cardLibrary.onApply(card.id)
                    setCardPickerOpen(false)
                    setCardPickerQuery('')
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-node-panel-inner bg-node-panel-soft p-2 text-left transition-colors hover:border-node-edge hover:bg-node-panel-inner"
                >
                  <span className="relative flex size-12 shrink-0 overflow-hidden rounded-lg bg-node-panel">
                    {card.sourceImageUrl ? (
                      <Image
                        src={card.sourceImageUrl}
                        alt={card.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <Images className="m-auto size-4 text-node-subtle" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-node-foreground">
                      {card.name}
                    </span>
                    {card.description ? (
                      <span className="mt-0.5 line-clamp-2 block text-2xs leading-4 text-node-muted">
                        {card.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PopoverContent>
  ) : null

  return (
    <>
      <div className="space-y-4">
        {showPreviewHero ? (
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-node-panel-inner bg-node-panel-soft">
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
                  {isExistingImage ? t('sourceExisting') : t('sourceGenerated')}
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

            {isPending ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-node-muted" />
                <span className="text-xs font-semibold">{t('generating')}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Generation error — TOP-LEVEL so it surfaces in every view (result,
            editing, chooser), not only inside the AI form. */}
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

        {/* Bound-card hint — shown whenever a result is sourced from a card,
            regardless of which editing target is open. */}
        {isImageNode && hasMedia && cardLibrary?.boundCard ? (
          <div className="flex items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-xs leading-5 text-node-muted">
            <Library className="size-3.5 shrink-0" />
            <span className="flex-1 truncate">
              {t('cardLibrary.bound', { name: cardLibrary.boundCard.name })}
            </span>
          </div>
        ) : null}

        {/* Change-source segmented control — REPLACES the old back-arrow. It
            flips the ephemeral editTarget only; it never persists a field that
            could hide the preview above. */}
        {showChangeSource ? (
          <div className="flex gap-1 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-1">
            <button
              type="button"
              onClick={() => handleChangeSource('existing')}
              className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-node-focus-ring/20 ${
                editTarget === 'existing'
                  ? 'bg-node-foreground text-node-canvas'
                  : 'text-node-muted hover:text-node-foreground'
              }`}
            >
              {t('changeSourceExisting')}
            </button>
            <button
              type="button"
              onClick={() => handleChangeSource('ai')}
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

        {/* Empty image node = FORM-FIRST. A slim "import instead" row offers the
            alternative sources (existing image · card library · Studio) without
            a heavy full-takeover chooser. The generate form renders below. */}
        {showEmptyImportRow ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted outline-none transition-colors hover:border-node-edge hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
                >
                  <Images className="size-3.5" />
                  {t('changeSourceExisting')}
                </button>
              </PopoverTrigger>
              {existingImagePickerContent}
            </Popover>

            {cardLibrary ? (
              <Popover open={cardPickerOpen} onOpenChange={setCardPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted outline-none transition-colors hover:border-node-edge hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
                  >
                    <Library className="size-3.5" />
                    {cardCopy.title}
                  </button>
                </PopoverTrigger>
                {cardLibraryPickerContent}
              </Popover>
            ) : null}

            <button
              type="button"
              onClick={handleOpenImageStudio}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted outline-none transition-colors hover:border-node-edge hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
            >
              <ExternalLink className="size-3.5" />
              {t('changeSourceStudio')}
            </button>
          </div>
        ) : null}

        {showExistingControls ? (
          <div className="flex flex-wrap gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft p-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted outline-none transition-colors hover:border-node-edge hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
                >
                  <Images className="size-3.5" />
                  {mediaUrl ? t('replaceImage') : t('selectExistingShort')}
                </button>
              </PopoverTrigger>
              {existingImagePickerContent}
            </Popover>
            <button
              type="button"
              onClick={handleUseExistingAsReference}
              disabled={!mediaUrl}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel px-2.5 text-xs font-semibold text-node-muted outline-none transition-colors hover:border-node-edge hover:bg-node-panel-inner hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/20 disabled:text-node-subtle"
            >
              <WandSparkles className="size-3.5" />
              {t('useExistingAsReference')}
            </button>
          </div>
        ) : null}

        {showAiForm ? (
          <>
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

            {isImageNode ? (
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
            ) : null}
          </>
        ) : null}
      </div>

      {isImageNode ? (
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
