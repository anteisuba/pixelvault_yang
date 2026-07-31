'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { NodeProps } from '@xyflow/react'
import {
  AlertCircle,
  FileText,
  ImageIcon,
  Mic2,
  Video,
  WandSparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import {
  buildDisplayNamePatch,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import { buildNodeWorkflowPrompt } from '@/lib/node-workflow-prompt'
import { cn } from '@/lib/utils'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'
import { Spinner } from '@/components/ui/spinner'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import {
  ImageCardFailedContent,
  ImageCardStatusBadge,
} from './ImageCardMediaState'
import { NodeShell } from './NodeShell'

interface NodeMediaPreviewProps extends NodeProps<NodeWorkflowNode> {
  type: NodeWorkflowNodeType
  kind: NodeWorkflowMediaKind
}

function getEmptyIcon(kind: NodeWorkflowMediaKind, type: NodeWorkflowNodeType) {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
      return <Video className="size-8 text-node-port-video" />
    case NODE_MEDIA_KIND_IDS.audio:
      return <Mic2 className="size-8 text-node-port-voice" />
    case NODE_MEDIA_KIND_IDS.text:
      return <FileText className="size-8 text-node-foreground" />
    default:
      return (
        <ImageIcon
          className={
            type === NODE_TYPE_IDS.characterImage
              ? 'size-8 text-node-port-character'
              : 'size-8 text-node-foreground'
          }
        />
      )
  }
}

/**
 * Per-role header title — nodes with a user-editable identity (character name,
 * background name) show it on the card so renames in the Inspector track here;
 * other roles fall back to the localized type label inside NodeShell.Header.
 *
 * FB-4: frameImage/videoMerge/shotText have no dedicated name field — they
 * fall back to the generic `mediaLabel` (the same field LooseImageCard/
 * SeedanceNode already write+read for a media-bearing card of the same
 * shape), so renaming stays visible once media arrives and the card switches
 * away from this component (shotText has no such switch — it's text-only —
 * but the field is the same one either way).
 */
// 包 4.5：读侧收口到共享链。原本按类型分支各读各的字段，与写侧的分支必须
// 人工对齐 —— 分家一次就长出「换个组件渲染名字就没了」。
function getHeaderTitle(data: NodeWorkflowNodeData): string | undefined {
  return resolveNodeDisplayName(data)
}

/** Whether `getHeaderTitle` above resolves a real, writable field for `type`
 *  — mirrors that function's own branches 1:1 (kept as a sibling rather than
 *  merged into one switch so `getHeaderTitle`'s existing shape stays
 *  untouched). Types outside this set (anything this component never
 *  actually receives) get the read-only header, same as today. */
function isHeaderTitleEditable(type: NodeWorkflowNodeType): boolean {
  return (
    type === NODE_TYPE_IDS.characterImage ||
    type === NODE_TYPE_IDS.backgroundImage ||
    type === NODE_TYPE_IDS.shot ||
    type === NODE_TYPE_IDS.frameImage ||
    type === NODE_TYPE_IDS.videoMerge ||
    type === NODE_TYPE_IDS.shotText
  )
}

/**
 * S4 write side for the on-card rename (canvas-image-card.md §1). `nextValue`
 * arrives already trimmed and non-empty — `EditableNodeLabel` guards against
 * an empty submit itself, so this never has to special-case "".
 */
function commitHeaderTitle(
  type: NodeWorkflowNodeType,
  nodeId: string,
  nextValue: string,
  updateNodeData: (id: string, patch: Partial<NodeWorkflowNodeData>) => void,
  data: NodeWorkflowNodeData,
): void {
  // 包 4.5：写侧收口到共享的 `buildDisplayNamePatch`。传进去的 `type` 是**呈现
  // 类型**（统一 image 节点按 role 映射出来的 legacy type），共享函数按 role
  // 优先、type 兜底判断，对同一个节点必然得出同一个字段 —— 这正是「出图前后
  // 写不同字段」那个 bug 的根治点。
  //
  // 原本这里按类型手写四个分支；其中 mediaLabel + sourceLabel 一起写的理由已
  // 随之搬进共享函数。shotText 的正文走 `prompt`（NodeMediaInspector 的文本
  // 表单字段），与这里的「名字」不是同一件事，字段不冲突。
  updateNodeData(
    nodeId,
    buildDisplayNamePatch({ role: data.role, type }, nextValue),
  )
}

function getMediaStatusLabelKey(
  hasMedia: boolean,
  kind: NodeWorkflowMediaKind,
): 'statusIdle' | 'statusSuccess' | 'statusTextReady' {
  if (kind === NODE_MEDIA_KIND_IDS.text) {
    return 'statusTextReady'
  }

  return hasMedia ? 'statusSuccess' : 'statusIdle'
}

export function NodeMediaPreview({
  id,
  type,
  kind,
  data,
  selected,
}: NodeMediaPreviewProps) {
  const [videoAspect, setVideoAspect] = useState<number | null>(null)
  const t = useTranslations('StudioNode.mediaNodes')
  const tWorkflows = useTranslations('StudioNode.workflowNodes')
  const tImageCard = useTranslations('StudioNode.imageSourceStarter')
  const { updateNodeData, generateMediaNode } = useNodeWorkflowActions()
  // S4（2026-07-27）：这个组件同时服务 image/video/audio/text 四种 kind——
  // 本轮只重皮 kind=image 那份（shot/frame/closeup 落媒体前的形态），
  // video/audio/text 完全不动，一个字符都不改。
  const isImageKind = kind === NODE_MEDIA_KIND_IDS.image
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const videoThumbnailUrl =
    typeof data.videoThumbnailUrl === 'string'
      ? data.videoThumbnailUrl
      : undefined
  const hasWorkflowPrompt = Boolean(buildNodeWorkflowPrompt(type, data))
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const isError =
    generationStatus === NODE_GENERATION_STATUS_IDS.error ||
    (data.status === NODE_STATUS_IDS.failed && Boolean(data.generationError))

  return (
    <NodeShell
      nodeId={id}
      type={type}
      selected={selected}
      status={data.status}
      toolbarData={data}
      // S4：image kind 空态卡边转虚线（canvas-image-card.md §3 例外条）。这个
      // 组件只在没有媒体时渲染（有媒体的同类型节点已经切到 LooseImageCard），
      // 所以 mediaUrl 恒假，这里只需排除生成中/失败两态。
      className={
        isImageKind && !isPending && !isError
          ? 'canvas-card--dashed'
          : undefined
      }
    >
      <NodeShell.Header
        type={type}
        status={data.status}
        title={getHeaderTitle(data)}
        onRenameCommit={
          isHeaderTitleEditable(type)
            ? (next) => commitHeaderTitle(type, id, next, updateNodeData, data)
            : undefined
        }
        // image 族状态挪进媒体窗左上角徽标，卡外的头不重复盖章。
        hideStatusBadge={isImageKind}
      />
      <NodeShell.Ingredients nodeId={id} />
      <NodeShell.Body className="space-y-3">
        <div
          className={cn(
            'relative aspect-video overflow-hidden rounded-sm border',
            isImageKind
              ? 'canvas-image-preview-window'
              : 'node-card-window border-node-panel-inner bg-node-card-window',
          )}
          style={
            kind === NODE_MEDIA_KIND_IDS.video && videoAspect
              ? { aspectRatio: videoAspect }
              : undefined
          }
        >
          {isImageKind ? (
            <ImageCardStatusBadge
              variant={isError ? 'failed' : isPending ? 'generating' : 'empty'}
              label={
                isError
                  ? tImageCard('badgeFailed')
                  : isPending
                    ? tImageCard('badgeGenerating')
                    : tImageCard('badgeEmpty')
              }
            />
          ) : null}

          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.image ? (
            <>
              <Image
                src={mediaUrl}
                alt={t('imageAlt')}
                fill
                sizes="320px"
                className="object-cover"
                unoptimized
              />
              <span className="absolute left-2 top-2 rounded-full border border-node-panel-inner bg-node-canvas/75 px-2 py-1 text-2xs font-semibold text-node-foreground backdrop-blur">
                {data.imageSource ===
                NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
                  ? t('sourceExisting')
                  : t('sourceGenerated')}
              </span>
            </>
          ) : null}

          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.video ? (
            <video
              src={mediaUrl}
              poster={videoThumbnailUrl}
              className="h-full w-full object-contain"
              controls
              muted
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget
                if (videoWidth > 0 && videoHeight > 0) {
                  setVideoAspect(videoWidth / videoHeight)
                }
              }}
            />
          ) : null}

          {mediaUrl && kind === NODE_MEDIA_KIND_IDS.audio ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
              <Mic2 className="size-8 text-node-port-voice" />
              <audio src={mediaUrl} controls className="w-full" />
            </div>
          ) : null}

          {kind === NODE_MEDIA_KIND_IDS.text || !mediaUrl ? (
            isImageKind && isError ? (
              // §3 硬要求②：失败必须给具体原因 + 重试，重试复用与画布其它地方
              // 相同的 generateMediaNode 通道（ShotGenerateButton 同款）。
              <ImageCardFailedContent
                reason={
                  data.generationError || tWorkflows(`${type}.emptyPreview`)
                }
                retryLabel={tImageCard('retry')}
                onRetry={() => void generateMediaNode?.(id)}
              />
            ) : isImageKind && isPending ? (
              // 生成中无法给百分比（规格 §5），只给旋转图标 + 文案；这里没有
              // 已有媒体要遮挡，不需要 video/audio 那种深色暗幕。
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <Spinner size="lg" className="text-node-foreground" />
                <span className="text-xs font-semibold text-node-foreground">
                  {t('generating')}
                </span>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                {getEmptyIcon(kind, type)}
                <p className="text-xs leading-5 text-node-muted">
                  {tWorkflows(`${type}.emptyPreview`)}
                </p>
              </div>
            )
          ) : null}

          {isPending && !isImageKind ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Spinner size="lg" className="text-node-foreground" />
              <span className="text-xs font-semibold">{t('generating')}</span>
              {/* Fixed dark track (not the scope-relative bg-node-panel-inner): this
                  sits inside the deep window (.node-card-window), where the sweep
                  itself already reads --node-foreground from that scope (light).
                  A track tied to the outer .node-card-paper scope would resolve to
                  paper-strong (light-on-light, invisible) — see S2 report. */}
              <div className="node-canvas-progress-track h-1 w-24 rounded-full bg-node-canvas" />
            </div>
          ) : null}
        </div>

        {isError && !isImageKind ? (
          <div className="flex gap-2 rounded-2xl border border-node-status-failed bg-node-status-failed/50 p-3 text-sm text-node-status-failed-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="line-clamp-3 text-xs leading-5 text-node-status-failed-fg/80">
              {data.generationError}
            </p>
          </div>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {hasWorkflowPrompt
            ? t(getMediaStatusLabelKey(Boolean(mediaUrl), kind))
            : tWorkflows(`${type}.footerEmpty`)}
        </p>
        <span className="flex size-8 items-center justify-center rounded-2xl bg-node-panel-inner text-node-foreground">
          <WandSparkles className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
