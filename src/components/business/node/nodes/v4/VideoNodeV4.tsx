'use client'

/**
 * 视频节点 = **镜头**（node-canvas-v2 §1.3 / §2.2）。
 *
 * 展开态是**固定版式**：上排文本槽摘要，下排 首帧 / 尾帧 / 参考（多）/ 语音 四槽卡。
 * 收起态 = 缩略图 + 稳定名 + 状态点（槽格在左缘那一列）。
 *
 * ⛔ 槽的顺序不在这里重写一遍——它是 `NODE_V4_PORTS['video.shot'].inputs` 的数组
 * 顺序（§6：画布上「左边这一摞的顺序」= 「槽的顺序」，两处不许各排各的）。
 */

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { getNodeV4Ports, NODE_SLOT_IDS } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import type { NodeV4, NodeV4VideoData } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4SlotCard } from './NodeV4SlotCard'
import { NodeV4Shell, NodeV4Thumbnail } from './NodeV4Shell'

export function VideoNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const videoData = data as unknown as NodeV4VideoData
  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  if (!node) return null

  const expanded = canvas.expandedNodeId === id
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  const mediaSlots = (ports?.inputs ?? []).filter(
    (spec) => spec.slot !== NODE_SLOT_IDS.text,
  )
  const textBinding = node.data.slots?.[NODE_SLOT_IDS.text]
  // 未生成时缩略取首帧槽（§1.2 缩略图来源）。
  const firstFrameSourceId = node.data.slots?.firstFrame?.versions.find(
    (version) => version.id === node.data.slots?.firstFrame?.cur,
  )?.sourceNodeId
  const firstFrameSource = canvas.nodes.find(
    (item) => item.id === firstFrameSourceId,
  )
  const posterUrl =
    videoData.url ??
    (firstFrameSource?.data.kind === 'image'
      ? firstFrameSource.data.url
      : undefined)

  return (
    <NodeV4Shell
      node={node}
      selected={selected}
      width={
        expanded ? NODE_V4_CARD.expandedWidth : NODE_V4_CARD.shotCollapsedWidth
      }
      slotRail={
        expanded ? undefined : (
          <div className="flex flex-col gap-1">
            {(ports?.inputs ?? []).map((spec) => (
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
      collapsedBody={
        <NodeV4Thumbnail
          url={posterUrl}
          alt={videoData.name}
          kind={videoData.url ? 'video' : 'image'}
        />
      }
      expandedBody={
        <div className="space-y-2" data-shot-layout>
          {/* 上排：文本槽摘要 */}
          <div data-shot-row="text" className="rounded-md border p-2 text-2xs">
            <span className="text-muted-foreground">
              {t('slots.text')}
              {' · '}
            </span>
            {textBinding && textBinding.versions.length > 0
              ? textBinding.versions
                  .map(
                    (version) =>
                      canvas.nodes.find(
                        (item) => item.id === version.sourceNodeId,
                      )?.data.name ?? version.sourceNodeId,
                  )
                  .join(' / ')
              : t('slotEmpty')}
          </div>
          {/* 下排：首帧 / 尾帧 / 参考 / 语音 四槽卡 */}
          <div data-shot-row="media" className="flex gap-1">
            {mediaSlots.map((spec) => (
              <NodeV4SlotCard
                key={spec.slot}
                nodeId={node.id}
                slot={spec.slot}
                binding={node.data.slots?.[spec.slot]}
              />
            ))}
          </div>
          <NodeV4Thumbnail
            url={posterUrl}
            alt={videoData.name}
            kind={videoData.url ? 'video' : 'image'}
          />
          {videoData.prompt ? (
            <p className="max-h-24 overflow-auto text-2xs text-muted-foreground">
              {videoData.prompt}
            </p>
          ) : null}
        </div>
      }
    />
  )
}
