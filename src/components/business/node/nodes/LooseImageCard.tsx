'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { NodeResizer, NodeToolbar, Position } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import type { NodeTokenType } from '@/constants/node-tokens'
import { NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE } from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import {
  CanvasImageSelectionToolbar,
  canOfferCanvasImageEdit,
  NodeSelectionToolbarChrome,
  ShotGenerateButton,
} from '../CanvasImageSelectionToolbar'
import { CanvasQuickEditPrompt } from '../CanvasQuickEditPrompt'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

interface LooseImageCardProps {
  id: string
  data: NodeWorkflowNodeData
  selected?: boolean
  /** React Flow node width (from resize / initial size). */
  width?: number
  /** React Flow node height (from resize / initial size). */
  height?: number
  /**
   * Semantic node type for the R3-3 selection toolbar registry (镜头图 gets a
   * 生成 capability button; every other image-family type gets none). This
   * component doesn't go through `NodeShell`, so unlike the other node
   * components it can't rely on that wrapper's own `type` prop — callers
   * (ImageNode/ShotNode/FrameImageNode) pass their resolved legacy type
   * explicitly. Defaults to the generic `image` type when omitted.
   */
  nodeType?: NodeTokenType
}

function getImageUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string' && data.mediaUrl.trim()) {
    return data.mediaUrl
  }
  if (typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    return data.imageUrl
  }
  return ''
}

/**
 * Pure-image canvas object. Size is owned by the React Flow node (width/height);
 * NodeResizer corner handles drag to scale. Content always fills 100% so resize
 * is not fought by a fixed Tailwind width.
 */
export function LooseImageCard({
  id,
  data,
  selected,
  width,
  height,
  nodeType = NODE_TYPE_IDS.image,
}: LooseImageCardProps) {
  const t = useTranslations('StudioNode.ingest.looseImage')
  const mediaUrl = getImageUrl(data)
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const { heavyOverlayOpen, transientLayerOpen, multiSelectActive } =
    useNodeWorkflowActions()
  const [naturalSize, setNaturalSize] = useState<{
    width: number
    height: number
  } | null>(null)

  // R3-4 §4.2 rule 3: 档2（详情面板）/档3（重编辑工作区/剧本笺展开）打开时，
  // 收起这张卡自己的 L3 近场快编面板——不管它属于哪张卡。同一效果延伸盖住
  // rule 1 的"同类临时层同刻一个"：L5（添加菜单 / 卡匣展开浮层）打开时也一
  // 并收起，避免选中节点上飘着的近场面板和另一处新开的浮层同屏叠着。R3-7：
  // 多选态同理收起——一旦选区变成 2+ 节点，这张卡自己的快编近场面板不该继续
  // 悬浮，跟单节点工具条一起让位给选区的「合成」条。
  useEffect(() => {
    if (heavyOverlayOpen || transientLayerOpen || multiSelectActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a workbench-owned external signal (a heavier or transient overlay tier claimed the slot), not derivable from this component's own render inputs
      setQuickEditOpen(false)
    }
  }, [heavyOverlayOpen, transientLayerOpen, multiSelectActive])

  // R3-4 §4.2 rule 2 (Esc 链 L3 一级): 面板打开时 Escape 收起它，不吞掉输入框
  // 内取消 IME 候选的 Escape。自成一体，和 NodeDetailPanel/CanvasAddMenu 同一
  // 套「组件自己听自己的层」写法。
  useEffect(() => {
    if (!quickEditOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        setQuickEditOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [quickEditOpen])

  const label =
    (typeof data.mediaLabel === 'string' && data.mediaLabel.trim()) ||
    (typeof data.sourceLabel === 'string' && data.sourceLabel.trim()) ||
    t('untitled')

  const frameWidth = width ?? NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE
  const frameHeight = height ?? NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE

  const displaySize = useMemo(() => {
    const mediaW =
      typeof data.mediaWidth === 'number' && data.mediaWidth > 0
        ? Math.round(data.mediaWidth)
        : naturalSize?.width
    const mediaH =
      typeof data.mediaHeight === 'number' && data.mediaHeight > 0
        ? Math.round(data.mediaHeight)
        : naturalSize?.height
    if (!mediaW || !mediaH) return null
    return { width: mediaW, height: mediaH }
  }, [data.mediaHeight, data.mediaWidth, naturalSize])

  const offerEdit = canOfferCanvasImageEdit(data)

  return (
    <div
      data-testid="loose-image-card"
      className={cn(
        'group relative box-border select-none',
        // R3-4 §4.1 L3: selected 时把这张散图卡的本地内容（resize 手柄等）
        // 提到自己兄弟之上；跨节点前置由 React Flow 自身的 elevateNodesOnSelect
        // 默认行为处理（.react-flow__node 的 z-index +1000），这里不重复。
        selected && 'z-canvas-selection',
      )}
      style={{
        width: frameWidth,
        height: frameHeight,
      }}
    >
      {/*
        Corner + edge handles: drag any corner to scale the image on canvas.
        keepAspectRatio so pure images don't shear.
      */}
      <NodeResizer
        nodeId={id}
        isVisible={Boolean(selected) && !quickEditOpen}
        minWidth={120}
        minHeight={120}
        maxWidth={2400}
        maxHeight={2400}
        keepAspectRatio
        autoScale
        color="var(--node-paint)"
        handleStyle={{
          width: 12,
          height: 12,
          borderRadius: 2,
          borderWidth: 2,
          borderColor: 'var(--node-paint)',
          backgroundColor: 'var(--node-panel)',
          // Sit outside the paint outline so the hit target is easy to grab.
        }}
        lineStyle={{
          borderColor: 'var(--node-paint)',
          borderWidth: 1,
          opacity: 0.55,
        }}
      />

      <NodeToolbar
        nodeId={id}
        isVisible={Boolean(selected) && !quickEditOpen && !multiSelectActive}
        position={Position.Top}
        offset={14}
      >
        {offerEdit ? (
          <CanvasImageSelectionToolbar
            nodeId={id}
            data={data}
            onQuickEditOpenChange={setQuickEditOpen}
            quickEditOpen={quickEditOpen}
            extra={
              nodeType === NODE_TYPE_IDS.shot ? (
                <ShotGenerateButton nodeId={id} data={data} />
              ) : null
            }
          />
        ) : (
          <NodeSelectionToolbarChrome
            nodeId={id}
            data={data}
            selected={selected}
            nodeType={nodeType}
          />
        )}
      </NodeToolbar>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 -top-5 flex items-end justify-between gap-2 px-0.5 text-[11px] leading-4',
          selected ? 'text-node-paint' : 'text-node-muted',
        )}
      >
        <span className="min-w-0 truncate font-medium" title={label}>
          {label}
        </span>
        {displaySize ? (
          <span className="shrink-0 tabular-nums opacity-90">
            {displaySize.width} × {displaySize.height}
          </span>
        ) : (
          <span className="shrink-0 tabular-nums opacity-80">
            {Math.round(frameWidth)} × {Math.round(frameHeight)}
          </span>
        )}
      </div>

      <div
        className={cn(
          'absolute inset-0 overflow-hidden bg-node-card-window',
          selected
            ? 'outline outline-2 outline-offset-0 outline-node-paint'
            : 'outline outline-1 outline-offset-0 outline-transparent group-hover:outline-node-edge/40',
        )}
      >
        {mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={t('cardAlt')}
            fill
            sizes={`${Math.round(frameWidth)}px`}
            className="object-cover"
            unoptimized
            draggable={false}
            onLoad={(event) => {
              const img = event.currentTarget
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setNaturalSize({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
              }
            }}
          />
        ) : null}
      </div>

      <NodeToolbar
        nodeId={id}
        isVisible={Boolean(selected) && quickEditOpen && !multiSelectActive}
        position={Position.Bottom}
        offset={14}
      >
        <CanvasQuickEditPrompt
          nodeId={id}
          data={data}
          fileLabel={label}
          onClose={() => setQuickEditOpen(false)}
        />
      </NodeToolbar>
    </div>
  )
}
