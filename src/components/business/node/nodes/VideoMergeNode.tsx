'use client'

import { memo } from 'react'
import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { Maximize2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_NODE_SIDECAR_OFFSET } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { useVideoMergeAction } from '@/hooks/node/use-video-merge-action'
import { useIsMobile } from '@/hooks/use-mobile'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

import { ToolbarLabelButton } from '../CanvasImageSelectionToolbar'
import { CanvasPopIn } from '../CanvasPopIn'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeMediaPreview } from './NodeMediaPreview'

/**
 * 《画布修法》刀二·B3（2026-08-26）：合并入口从近场工具条（Position.Top，
 * `NodeShell` 的标准卡宽一高就把它顶出视口）撤下——合并动作保留在 ⤢ 详情
 * 面板动作坞（`VideoMergeDetailBody` 的 `dock` 槽，不动），但那样一来「不
 * 打开详情就没法合并」，所以片盒也挂一个右侧侧车（复用 `NodeToolbar
 * Position.Right` + `NODE_STUDIO_NODE_SIDECAR_OFFSET`，与视频侧车
 * `SeedanceNode` 同款几何/皮肤——同为 video kind，视觉语言本就该是一家）承接
 * 「选中即可达」。内容按包内锚点收窄到三样：片段计数 + 开始合并 + 禁用原因；
 * 额外挂了一个 ⤢ 展开——`ToolbarCapabilityRegion` 撤掉 videoMerge 分支后，
 * 空态（无媒体）卡的近场工具条会整条不渲染（没有能力区也没有媒体 =
 * 没有东西可操作，owner 2026-07-27 的既有规则，见 CanvasImageSelectionToolbar.tsx
 * `GenericSelectionToolbar` 头注），如果侧车不给 ⤢，空片盒就再也打不开详情
 * 面板去看上游片段/裁剪了——这颗按钮不是"顺手加的"，是保住既有可达性的
 * 必要件。
 */
function VideoMergeSidecar({
  id,
  data,
  selected,
}: {
  id: string
  data: NodeWorkflowNodeData
  selected?: boolean
}) {
  const t = useTranslations('StudioNode.videoMerge')
  const tToolbar = useTranslations('StudioNode.nodeToolbar')
  const { setExpandedNodeId, multiSelectActive, canvasNodeDragActive } =
    useNodeWorkflowActions()
  const isMobile = useIsMobile()
  // hook 要一个 `NodeWorkflowNode`，只读 `id`/`data`，画布上的真节点仍由
  // React Flow 持有——与 `VideoMergeDetailBody` 合成同一个形状的写法同源。
  const node: NodeWorkflowNode = {
    id,
    type: NODE_TYPE_IDS.videoMerge,
    position: { x: 0, y: 0 },
    data,
  }
  const {
    clipCount,
    maxClips,
    canMerge,
    isMerging,
    disabledReasonText,
    handleMerge,
  } = useVideoMergeAction(node)
  const hasMedia = Boolean(
    typeof data.mediaUrl === 'string' && data.mediaUrl.trim(),
  )

  return (
    <NodeToolbar
      nodeId={id}
      isVisible={
        Boolean(selected) && !multiSelectActive && !canvasNodeDragActive
      }
      position={Position.Right}
      align="start"
      offset={
        isMobile
          ? NODE_STUDIO_NODE_SIDECAR_OFFSET.mobile
          : NODE_STUDIO_NODE_SIDECAR_OFFSET.desktop
      }
      className="canvas-video-sidecar-toolbar"
    >
      <CanvasPopIn side="right">
        <aside
          aria-label={t('title')}
          className="canvas-video-sidecar nodrag nopan nowheel"
        >
          <header className="canvas-video-sidecar-header">
            <div className="min-w-0">
              <p className="canvas-video-sidecar-title">{t('title')}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setExpandedNodeId(id)}
                className="canvas-video-sidecar-icon-button"
                aria-label={tToolbar('expand')}
                title={tToolbar('expand')}
              >
                <Maximize2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </header>
          <div className="canvas-video-sidecar-body">
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-5 text-node-muted">
                {t('clipCount', { count: clipCount, max: maxClips })}
              </p>
              <ToolbarLabelButton
                icon={Sparkles}
                label={
                  isMerging
                    ? t('merging')
                    : hasMedia
                      ? t('merge.regenerate')
                      : t('merge.run')
                }
                onClick={() => void handleMerge()}
                disabled={!canMerge}
              />
              {disabledReasonText ? (
                <p className="canvas-video-composer-disabled-reason">
                  {disabledReasonText}
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </CanvasPopIn>
    </NodeToolbar>
  )
}

/**
 * Aggregator node: takes upstream video clips (any combination of Seedance
 * outputs, uploaded videoReference clips, or even nested videoMerge results)
 * and produces a single concatenated mp4 via fal-ai/ffmpeg-api/merge-videos.
 * Output is itself a video URL so downstream Seedance Reference / further
 * merges can consume it via the existing video_urls pipeline.
 */
export const VideoMergeNode = memo(function VideoMergeNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  return (
    <>
      <NodeMediaPreview
        {...props}
        type={NODE_TYPE_IDS.videoMerge}
        kind={NODE_MEDIA_KIND_IDS.video}
      />
      <VideoMergeSidecar
        id={props.id}
        data={props.data}
        selected={props.selected}
      />
    </>
  )
})
