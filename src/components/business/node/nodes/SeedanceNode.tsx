'use client'

import { memo } from 'react'
import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Maximize2, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import {
  buildDisplayNamePatch,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import { deriveSwitcherStateFromModel } from '@/lib/video-model-resolver'
import { useIsMobile } from '@/hooks/use-mobile'
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

  // §5.1 shot override: this node's model brand differs from the canvas default
  // → flag it (⚠ badge + dashed border) so cross-shot drift is scannable.
  const {
    defaultVideoModel,
    updateNodeData,
    setExpandedNodeId,
    multiSelectActive,
    canvasNodeDragActive,
  } = useNodeWorkflowActions()
  const nodeState = deriveSwitcherStateFromModel(data.model)
  const nodeBrand = nodeState.brand
  const isOverridden = Boolean(
    defaultVideoModel && nodeBrand && nodeBrand !== defaultVideoModel.brand,
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
        <div className="node-card-window relative aspect-video overflow-hidden bg-node-card-window">
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
              {/* Fixed dark plate (not bg-node-panel-inner) — this icon sits inside
                  the deep window, whose --node-panel-inner would otherwise still
                  resolve to the outer paper scope's light paper-strong. */}
              <span className="flex size-11 items-center justify-center rounded-xl bg-node-canvas text-node-muted">
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
