'use client'

/**
 * 图片节点的两态渲染（node-canvas-v2 §2.1）。
 *
 * ⚠ 2026-09-07 21:53 (JST) 从 `MediaNodeV4.tsx` 拆出（C3c-②P）：image 与 audio 从
 * 这一步起各自长出一整套子面板（图片走审核 / 证据 / 关系带 / 图集，音频走音色库 /
 * 情绪参数），再共用一个文件只会让两边互相挡路。共享的只剩 `NodeV4SlotRail`。
 *
 * ── 卡宽随媒体比例（legacy `LooseImageCard.computeClampedCardSize` 的移植）──
 * 收起态不再是一个固定宽：竖图挤在 16:9 的框里两侧全是空，横图又被压扁。所以按
 * `mediaWidth/mediaHeight` 算出宽度并**钳制**在 [collapsedWidth, expandedWidth]
 * 之间——⛔ 不放开上下限，画布上一张卡撑满视口谁都别想找回它。⚠ 展开态仍是定宽：
 * 展开的内容（编排区/证据/关系带）是文字排版，跟着图变宽只会让行长失控。
 *
 * `NodeResizer` 只在**选中且收起**时挂：展开态的高度由内容决定，给它四角把手会
 * 让用户拽出一个和内容对不上的框。
 */

import { NodeResizer, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Check, Ban } from 'lucide-react'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_V4_CARD,
} from '@/constants/node-studio'
import {
  NODE_REVIEW_STATE_IDS,
  type NodeReviewState,
} from '@/constants/node-types'
import { resolveMediaReviewState } from '@/lib/node-media-review'
import type { NodeV4, NodeV4ImageData } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { NodeV4EvidenceDrawer } from './NodeV4EvidenceDrawer'
import { NodeV4GenerateDesk } from './NodeV4GenerateDesk'
import { NodeV4ReferenceGallery } from './NodeV4ReferenceGallery'
import { NodeV4RelationBand } from './NodeV4RelationBand'
import {
  NodeV4SelectionToolbar,
  NodeV4ToolbarButton,
} from './NodeV4SelectionToolbar'
import { NodeV4SlotRail } from './NodeV4SlotRail'
import { NodeV4Shell, NodeV4Thumbnail } from './NodeV4Shell'

/** 收起态卡宽：按媒体比例算，钳在两个已有档位之间（⛔ 不新造魔法值）。 */
export function collapsedImageWidth(data: NodeV4ImageData): number {
  const { mediaWidth, mediaHeight } = data
  if (!mediaWidth || !mediaHeight) return NODE_V4_CARD.collapsedWidth
  const ratio = mediaWidth / mediaHeight
  const width = NODE_V4_CARD.collapsedWidth * Math.min(Math.max(ratio, 1), 1.5)
  return Math.round(
    Math.min(
      Math.max(width, NODE_V4_CARD.collapsedWidth),
      NODE_V4_CARD.expandedWidth,
    ),
  )
}

/** 字节数 → 人读得懂的一行。⛔ 不引库，两档够用。 */
export function formatSizeBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImageNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const imageData = data as unknown as NodeV4ImageData
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  if (!node) return null
  const expanded = canvas.expandedNodeId === id
  const reviewState = resolveMediaReviewState(imageData, imageData.url)

  const setReview = (state: NodeReviewState) => {
    if (!imageData.url) return
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setReviewState,
      target: id,
      url: imageData.url,
      state,
    })
  }

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
      }}
      data-review-state={reviewState}
      className="relative"
    >
      {/* 四角把手只在「选中 + 收起」时挂——展开态高度由内容决定。 */}
      <NodeResizer
        isVisible={Boolean(selected) && !expanded}
        minWidth={NODE_V4_CARD.collapsedWidth}
        maxWidth={NODE_V4_CARD.expandedWidth}
        keepAspectRatio
      />
      <NodeV4SelectionToolbar
        node={node}
        selected={selected}
        {...(imageData.url ? { mediaUrl: imageData.url } : {})}
        extra={
          <>
            <NodeV4ToolbarButton
              testId="approve"
              label={t('review.approve')}
              icon={Check}
              disabled={!imageData.url}
              onClick={() => setReview(NODE_REVIEW_STATE_IDS.approved)}
            />
            <NodeV4ToolbarButton
              testId="reject"
              label={t('review.reject')}
              icon={Ban}
              disabled={!imageData.url}
              onClick={() => setReview(NODE_REVIEW_STATE_IDS.rejected)}
            />
          </>
        }
      />
      <NodeV4Shell
        node={node}
        selected={selected}
        width={
          expanded ? NODE_V4_CARD.expandedWidth : collapsedImageWidth(imageData)
        }
        slotRail={expanded ? <NodeV4SlotRail node={node} /> : undefined}
        collapsedBody={
          <div className="space-y-1">
            <NodeV4Thumbnail
              url={imageData.url}
              alt={imageData.name}
              kind="image"
            />
            <ImageReadout data={imageData} reviewState={reviewState} />
          </div>
        }
        expandedBody={
          <div className="space-y-2">
            <NodeV4Thumbnail
              url={imageData.url}
              alt={imageData.name}
              kind="image"
            />
            <ImageReadout data={imageData} reviewState={reviewState} />
            {imageData.blocked ? (
              <p data-blocked="true" className="text-2xs text-destructive">
                {t('blocked', { reason: imageData.blockedReason ?? '' })}
              </p>
            ) : null}
            <NodeV4ReferenceGallery node={node} />
            <NodeV4RelationBand node={node} />
            <NodeV4EvidenceDrawer node={node} />
            {/* 提示词的**可编辑**入口在编排区（§2 展开态底部），这里不再另放一份
                只读文本 —— 两处显示同一段字，用户会去点那个点不动的。 */}
            <NodeV4GenerateDesk node={node} />
          </div>
        }
      />
      {menu ? (
        <NodeV4ContextMenu
          node={node}
          x={menu.x}
          y={menu.y}
          {...(imageData.url ? { mediaUrl: imageData.url } : {})}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * 读数条：W×H · 大小 · 来源角标 · 审核态。
 *
 * ⚠ 缺字段就**整段不渲染那一条**，⛔ 不显示 `0×0` 或「未知」——上传回填链断掉时
 * 一行占位符会让人以为图真的是 0 像素。
 */
function ImageReadout({
  data,
  reviewState,
}: {
  data: NodeV4ImageData
  reviewState: string
}) {
  const t = useTranslations('StudioNode.v4')
  if (!data.url) return null
  return (
    <div
      data-image-readout
      className="flex flex-wrap items-center gap-1 text-2xs text-muted-foreground"
    >
      {data.mediaWidth && data.mediaHeight ? (
        <span data-readout-dimensions>
          {t('readout.dimensions', {
            width: data.mediaWidth,
            height: data.mediaHeight,
          })}
        </span>
      ) : null}
      {data.sizeBytes ? (
        <span data-readout-size>{formatSizeBytes(data.sizeBytes)}</span>
      ) : null}
      {data.imageSource ? (
        <span
          data-image-source={data.imageSource}
          className="rounded-sm border px-1"
        >
          {t(
            data.imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated
              ? 'readout.sourceGenerated'
              : 'readout.sourceExisting',
          )}
        </span>
      ) : null}
      {reviewState === NODE_REVIEW_STATE_IDS.approved ? null : (
        <span
          data-readout-review={reviewState}
          className="rounded-sm border px-1"
        >
          {t(`review.state.${reviewState}`)}
        </span>
      )}
    </div>
  )
}
