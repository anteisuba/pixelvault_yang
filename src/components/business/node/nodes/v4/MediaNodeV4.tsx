'use client'

/**
 * 图片 / 音频节点（node-canvas-v2 §2.1 / §2.2）。
 *
 * 两者共用一张卡：收起 = 缩略（音频是波形位 + 时长）+ 稳定名 + 状态点；
 * 展开 = 预览 + prompt + 参数 + 参考槽。⛔ 不再走 `NodeDetailPanel` 那张覆盖面板。
 */

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { AudioPlayer } from '@/components/ui/audio-player'
import { getNodeV4Ports } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import type {
  NodeV4,
  NodeV4AudioData,
  NodeV4ImageData,
} from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4GenerateDesk } from './NodeV4GenerateDesk'
import { NodeV4SlotCard } from './NodeV4SlotCard'
import { NodeV4Shell, NodeV4Thumbnail } from './NodeV4Shell'

function SlotRail({ node }: { node: NodeV4 }) {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports || ports.inputs.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {ports.inputs.map((spec) => (
        <NodeV4SlotCard
          key={spec.slot}
          nodeId={node.id}
          slot={spec.slot}
          binding={node.data.slots?.[spec.slot]}
        />
      ))}
    </div>
  )
}

export function ImageNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const imageData = data as unknown as NodeV4ImageData
  const node = canvas.nodes.find((item) => item.id === id)
  if (!node) return null
  const expanded = canvas.expandedNodeId === id

  return (
    <NodeV4Shell
      node={node}
      selected={selected}
      width={
        expanded ? NODE_V4_CARD.expandedWidth : NODE_V4_CARD.collapsedWidth
      }
      slotRail={expanded ? <SlotRail node={node} /> : undefined}
      collapsedBody={
        <NodeV4Thumbnail
          url={imageData.url}
          alt={imageData.name}
          kind="image"
        />
      }
      expandedBody={
        <div className="space-y-2">
          <NodeV4Thumbnail
            url={imageData.url}
            alt={imageData.name}
            kind="image"
          />
          {imageData.blocked ? (
            <p data-blocked="true" className="text-2xs text-destructive">
              {t('blocked', { reason: imageData.blockedReason ?? '' })}
            </p>
          ) : null}
          {/* 提示词的**可编辑**入口在编排区（§2 展开态底部），这里不再另放一份
              只读文本 —— 两处显示同一段字，用户会去点那个点不动的。 */}
          <NodeV4GenerateDesk node={node} />
        </div>
      }
    />
  )
}

export function AudioNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const audioData = data as unknown as NodeV4AudioData
  const node = canvas.nodes.find((item) => item.id === id)
  if (!node) return null
  const expanded = canvas.expandedNodeId === id

  return (
    <NodeV4Shell
      node={node}
      selected={selected}
      width={
        expanded ? NODE_V4_CARD.expandedWidth : NODE_V4_CARD.collapsedWidth
      }
      slotRail={expanded ? <SlotRail node={node} /> : undefined}
      collapsedBody={
        <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-2 text-2xs text-muted-foreground">
          <span className="h-3 w-16 rounded-sm bg-amber-600/50" />
          {audioData.durationSec
            ? t('audioDuration', { seconds: Math.round(audioData.durationSec) })
            : t('audioEmpty')}
        </div>
      }
      expandedBody={
        <div className="space-y-2">
          {audioData.url ? <AudioPlayer src={audioData.url} /> : null}
          {audioData.ownerName ? (
            <p className="text-2xs text-muted-foreground">
              {t('audioOwner', { name: audioData.ownerName })}
            </p>
          ) : null}
          <NodeV4GenerateDesk node={node} />
        </div>
      }
    />
  )
}
