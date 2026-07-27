'use client'

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { ImageIcon, Library, WandSparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

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
} from '@/constants/node-studio'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import type { GenerationRecord } from '@/types'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import {
  ImageCardFailedContent,
  ImageCardStatusBadge,
  ImageCardUploadOverlay,
} from './ImageCardMediaState'
import { NodeShell } from './NodeShell'

interface ImageSourceStarterProps {
  nodeId: string
  selected?: boolean
  status: NodeWorkflowStatus
  /** owner 真机: 空态图片工具条改名写 mediaLabel（IdentityRegion image→mediaLabel）——
   *  卡头读同一字段，改完卡上标题即刻反映；未命名时回落到类型名「图片」。 */
  mediaLabel?: string
}

/** A failed upload's file + reason, kept local so retry can re-attempt the
 *  exact same file without asking the user to re-pick it (canvas-image-card.md
 *  §3 「失败必须给原因」+「重试」— this is the state that makes 重试 possible). */
interface UploadFailure {
  file: File
  reason: string
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
 *
 * S4（2026-07-27，canvas-image-card.md §3）: this component now also owns the
 * 空 / 上传中 / 失败 three of the family's five states (就绪 / 就绪·hover live
 * in LooseImageCard, which takes over once media lands). Upload progress is
 * real (XHR, see use-node-reference-upload.ts), cancellable, and a failure
 * stays on the card with its reason + a retry — it no longer just fires a
 * toast and quietly reverts to empty.
 */
export function ImageSourceStarter({
  nodeId,
  selected,
  status,
  mediaLabel,
}: ImageSourceStarterProps) {
  const t = useTranslations('StudioNode.imageSourceStarter')
  const { updateNodeData, setExpandedNodeId } = useNodeWorkflowActions()
  const { uploadFile, isUploading, progress, cancelUpload } =
    useNodeReferenceUpload()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [failure, setFailure] = useState<UploadFailure | null>(null)
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
    setFailure(null)
    const result = await uploadFile(
      file,
      NODE_STUDIO_MEDIA_IMAGE_OUTPUT.uploadNote,
    )
    if (result.success && result.url) {
      applyImage(result.url, result.generationId, file.name)
      return
    }
    // A deliberate × cancel isn't a failure — go straight back to the empty
    // dropzone, no reason banner (canvas-image-card.md §3 only requires a
    // reason for real failures).
    if (result.cancelled) return
    setFailure({ file, reason: result.error ?? t('uploadFailed') })
  }

  const handleRetry = () => {
    if (!failure) return
    const { file } = failure
    setFailure(null)
    void handleFile(file)
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
    if (isUploading) return
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

  const isEmpty = !isUploading && !failure

  return (
    <NodeShell
      nodeId={nodeId}
      type={NODE_TYPE_IDS.image}
      selected={selected}
      // 失败态借用既有的「卡边转 --canvas-danger」通用规则（NodeShell 的
      // .canvas-card[data-status='failed']）——只是视觉信号，不写回 data.status，
      // 一次上传失败不该把整个节点标脏。
      status={failure ? NODE_STATUS_IDS.failed : status}
      showSourceHandle={false}
      showTargetHandle={false}
      className={isEmpty ? 'canvas-card--dashed' : undefined}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.image}
        status={status}
        title={mediaLabel?.trim() || undefined}
        onRenameCommit={(next) =>
          updateNodeData(nodeId, { mediaLabel: next, sourceLabel: next })
        }
        // 状态浮标挪进媒体窗左上角（下面），卡外的头不用再盖一次章。
        hideStatusBadge
      />
      <NodeShell.Body className="space-y-2 p-0">
        <div
          role="button"
          tabIndex={0}
          aria-label={t('uploadAria')}
          aria-disabled={isUploading}
          data-drag-over={isDragOver ? 'true' : undefined}
          onClick={() => {
            if (!isUploading) inputRef.current?.click()
          }}
          onKeyDown={(event) => {
            if (isUploading) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files') || isUploading)
              return
            event.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className="canvas-image-dropzone flex aspect-square w-full flex-col items-center justify-center outline-none"
        >
          <ImageCardStatusBadge
            variant={failure ? 'failed' : isUploading ? 'uploading' : 'empty'}
            label={
              failure
                ? t('badgeFailed')
                : isUploading
                  ? t('badgeUploading')
                  : t('badgeEmpty')
            }
          />

          {failure ? (
            <ImageCardFailedContent
              reason={failure.reason}
              retryLabel={t('retry')}
              onRetry={handleRetry}
            />
          ) : isUploading ? (
            <ImageCardUploadOverlay
              progress={progress}
              label={t('uploading', { percent: progress })}
              cancelLabel={t('cancelUpload')}
              onCancel={cancelUpload}
            />
          ) : (
            <div className="canvas-image-empty-hint">
              <ImageIcon className="size-6" aria-hidden />
              <span>{t('uploadHint')}</span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={NODE_STUDIO_IMAGE_INPUT.accept}
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        <div className="flex gap-1.5 px-3 pb-3 pt-1">
          <button
            type="button"
            onClick={() => setAssetDialogOpen(true)}
            disabled={isUploading}
            className="canvas-secondary-btn nodrag flex-1"
          >
            <Library className="size-3.5" aria-hidden />
            {t('library')}
          </button>
          <button
            type="button"
            onClick={() => setExpandedNodeId(nodeId)}
            disabled={isUploading}
            className="canvas-secondary-btn nodrag flex-1"
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
