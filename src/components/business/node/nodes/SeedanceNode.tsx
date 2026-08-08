'use client'

import { memo } from 'react'
import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Maximize2, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getModelFamily, getModelVariant } from '@/constants/models'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import {
  buildDisplayNamePatch,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { VideoComposer } from '../composer/VideoComposer'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { CanvasPopIn } from '../CanvasPopIn'
import { NodeProgressState } from './NodeProgressState'
import { NodeVideoSurface } from './NodeVideoSurface'
import { NodeShell } from './NodeShell'

export const SeedanceNode = memo(function SeedanceNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  const { id, data, selected } = props
  const t = useTranslations('StudioNode.videoGeneration')
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const videoThumbnailUrl =
    typeof data.videoThumbnailUrl === 'string'
      ? data.videoThumbnailUrl
      : undefined
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const isMobile = useIsMobile()

  // §5.1 shot override：这个节点的模型与项目默认不一致 → 标出来（⚠ 徽标 + 虚线边），
  // 好让跨镜头的漂移一眼扫得到。
  const {
    defaultVideoModel,
    updateNodeData,
    setExpandedNodeId,
    multiSelectActive,
    canvasNodeDragActive,
  } = useNodeWorkflowActions()
  // 侧车标题显示**系列**（Seedance / Kling），那是这张卡在讲哪个牌子。
  const nodeBrand = data.model ? getModelFamily(data.model.modelId) : null
  // 但「有没有偏离项目默认」比的是**型号**：同族里从 Seedance 2.0 换到 2.5 属于实打
  // 实的跨镜头漂移，按系列比就标不出来。型号也正是选择器第二层用户真正选的那一层。
  const nodeVariant = data.model ? getModelVariant(data.model.modelId) : null
  const isOverridden = Boolean(
    defaultVideoModel &&
    nodeVariant &&
    nodeVariant !== defaultVideoModel.variant,
  )

  return (
    <NodeShell
      nodeId={id}
      type={NODE_TYPE_IDS.seedance}
      selected={selected}
      status={data.status}
      overridden={isOverridden}
      toolbarData={data}
      className="canvas-video-card"
    >
      <NodeToolbar
        nodeId={id}
        isVisible={
          Boolean(selected) && !multiSelectActive && !canvasNodeDragActive
        }
        position={Position.Right}
        align="start"
        offset={isMobile ? 20 : 24}
        className="canvas-video-sidecar-toolbar"
      >
        <CanvasPopIn side="right">
          <aside
            aria-label={t('sidecar.ariaLabel')}
            className="canvas-video-sidecar nodrag nopan nowheel"
          >
            <header className="canvas-video-sidecar-header">
              <div className="min-w-0">
                <p className="canvas-video-sidecar-eyebrow">
                  {t('sidecar.eyebrow')}
                </p>
                <p className="canvas-video-sidecar-title">
                  {nodeBrand ?? t('sidecar.titleFallback')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setExpandedNodeId(id)}
                  className="canvas-video-sidecar-icon-button"
                  aria-label={t('sidecar.detailAction')}
                  title={t('sidecar.detailAction')}
                >
                  <Maximize2 className="size-3.5" aria-hidden />
                </button>
              </div>
            </header>
            <div className="canvas-video-sidecar-body">
              <VideoComposer
                id={id}
                data={data}
                density="card"
                showMonitor={false}
              />
            </div>
          </aside>
        </CanvasPopIn>
      </NodeToolbar>
      <NodeShell.Header
        type={NODE_TYPE_IDS.seedance}
        status={data.status}
        // 台账 B7(b)：原来这里直接读 `data.mediaLabel`，**绕过了**
        // `resolveNodeDisplayName` 里的 `notMachineValue` 守卫（批 1 的 C5 加的），
        // 于是一张从没被命名过的视频卡就叫 `seedance-2.0-fast-reference` ——
        // 把模型 id 当人起的名字。读写两侧都接回共享链，别再各写各的。
        title={resolveNodeDisplayName(data)}
        // 组装台没有专属命名字段（同 videoMerge/frameImage），`buildDisplayNamePatch`
        // 的兜底分支写的就是 mediaLabel + 老搭档 sourceLabel，与原来手写的一致。
        onRenameCommit={(next) =>
          updateNodeData(
            id,
            buildDisplayNamePatch(
              { role: data.role, type: NODE_TYPE_IDS.seedance },
              next,
            ),
          )
        }
        hideStatusBadge
        action={
          isOverridden ? (
            <span
              title={t('overrideHint')}
              className="flex size-6 items-center justify-center rounded-lg border border-node-muted/50 bg-node-panel-inner text-node-foreground"
            >
              <AlertTriangle className="size-3.5" />
            </span>
          ) : null
        }
      />
      <NodeShell.Body className="p-0">
        <div
          className={cn(
            'node-card-window relative aspect-video overflow-hidden',
            mediaUrl ? 'bg-node-card-window' : 'canvas-video-empty-surface',
          )}
        >
          {mediaUrl ? (
            // 台账 B7：原来是原生 `<video controls muted>` —— 灰底 mute 图标 +
            // 原生进度条 + ⋮ 菜单，在 400px 的卡上跟别的什么都不搭；且没有
            // `preload`，`videoThumbnailUrl` 缺席时窗里就是一块纯黑。
            <NodeVideoSurface
              src={mediaUrl}
              poster={videoThumbnailUrl}
              fit="cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-node-panel-inner text-node-muted">
                <Video className="size-5" />
              </span>
              <p className="text-xs leading-5 text-node-muted">
                {t('emptyPreview')}
              </p>
            </div>
          )}

          {/* ⚠ 原来这里是「脉冲 Film 图标 + 扫光条」——把「这是视频」和「在跑」
              混进了一个器件，而模态是卡本身已经说清的事（台账 #14）。 */}
          {isPending ? (
            <NodeProgressState label={t('generating')} veiled />
          ) : null}
        </div>
      </NodeShell.Body>
    </NodeShell>
  )
})
