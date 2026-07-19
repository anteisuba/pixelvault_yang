'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Library, Upload, WandSparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import {
  NODE_STUDIO_IMAGE_INPUT,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_MEDIA_IMAGE_OUTPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
} from '@/constants/node-studio'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Spinner } from '@/components/ui/spinner'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import type { GenerationRecord } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeShell } from './NodeShell'

interface ImageSourceStarterProps {
  nodeId: string
  selected?: boolean
  status: NodeWorkflowStatus
  /** owner 真机: 空态图片工具条改名写 mediaLabel（IdentityRegion image→mediaLabel）——
   *  卡头读同一字段，改完卡上标题即刻反映；未命名时回落到类型名「图片」。 */
  mediaLabel?: string
}

/**
 * §6.0/§6.1 S5d ③「ImageNode 空态废 role picker → 直接三来源起步」: replaces
 * the old "这张图做什么用（镜头/关键帧）" chooser for a fresh, role-less,
 * media-less `image` node. No role question — the three sources (上传
 * dropzone / 素材库 / AI 生成) are reachable straight from the empty card.
 * Upload and 素材库 resolve inline; AI 生成 hands off to the ⤢ detail panel
 * (`LooseImageDetailBody` → `NodeMediaInspector`, which already owns the full
 * model/prompt/generate form) rather than duplicating that form on a card-
 * sized surface — reuse over a second generate UI.
 *
 * Once media lands the node becomes a role-less `LooseImageCard` (ImageNode's
 * existing dispatch); naming + categorizing happens in the expand panel,
 * same as every other node field.
 */
export function ImageSourceStarter({
  nodeId,
  selected,
  status,
  mediaLabel,
}: ImageSourceStarterProps) {
  const t = useTranslations('StudioNode.imageSourceStarter')
  const { updateNodeData, setExpandedNodeId } = useNodeWorkflowActions()
  const { uploadFile, isUploading } = useNodeReferenceUpload()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const applyImage = (
    url: string,
    generationId: string | undefined,
    label: string,
  ) => {
    const trimmedLabel = label
      .trim()
      .slice(0, NODE_STUDIO_MEDIA_IMAGE_OUTPUT.maxSourceLabelLength)

    updateNodeData(nodeId, {
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      mediaUrl: url,
      mediaLabel: trimmedLabel || t('untitled'),
      sourceLabel: trimmedLabel || t('untitled'),
      sourceGenerationId: generationId,
      generationId,
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      status: NODE_STATUS_IDS.done,
    })
  }

  const handleFile = async (file: File) => {
    if (!file.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix)) return
    const result = await uploadFile(
      file,
      NODE_STUDIO_MEDIA_IMAGE_OUTPUT.uploadNote,
    )
    if (result.success && result.url) {
      applyImage(result.url, result.generationId, file.name)
      return
    }
    toast.error(result.error ?? t('uploadFailed'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    void handleFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
    const file = Array.from(event.dataTransfer.files).find((entry) =>
      entry.type.startsWith(NODE_STUDIO_IMAGE_INPUT.mimePrefix),
    )
    if (file) void handleFile(file)
  }

  const handleSelectAsset = (generation: GenerationRecord) => {
    if (!generation.url) return
    applyImage(
      generation.url,
      generation.id,
      generation.prompt || generation.model || t('untitled'),
    )
    setAssetDialogOpen(false)
  }

  return (
    <NodeShell
      nodeId={nodeId}
      type={NODE_TYPE_IDS.image}
      selected={selected}
      status={status}
      showSourceHandle={false}
      showTargetHandle={false}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.image}
        status={status}
        title={mediaLabel?.trim() || undefined}
      />
      <NodeShell.Body className="space-y-2">
        <div
          role="button"
          tabIndex={0}
          aria-label={t('uploadAria')}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`node-card-window flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-node-panel-inner bg-node-card-window text-center outline-none transition-colors hover:border-node-paint/50 focus-visible:ring-2 focus-visible:ring-node-paint/60 ${isDragOver ? 'border-node-paint/60' : ''}`}
        >
          {isUploading ? (
            <Spinner size="lg" className="text-node-foreground" />
          ) : (
            <Upload className="size-6 text-node-foreground" />
          )}
          <span className="text-xs font-semibold text-node-foreground">
            {t('uploadTitle')}
          </span>
          <span className="px-3 text-2xs leading-4 text-node-subtle">
            {t('uploadHint')}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={NODE_STUDIO_IMAGE_INPUT.accept}
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setAssetDialogOpen(true)}
            className="nodrag flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
          >
            <Library className="size-3.5" aria-hidden />
            {t('library')}
          </button>
          <button
            type="button"
            onClick={() => setExpandedNodeId(nodeId)}
            className="nodrag flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2 py-2 text-xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
          >
            <WandSparkles className="size-3.5" aria-hidden />
            {t('aiGenerate')}
          </button>
        </div>
      </NodeShell.Body>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={handleSelectAsset}
        title={t('libraryDialogTitle')}
        description={t('libraryDialogDescription')}
        mediaType="image"
      />
    </NodeShell>
  )
}
