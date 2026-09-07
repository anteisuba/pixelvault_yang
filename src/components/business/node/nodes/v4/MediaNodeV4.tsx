'use client'

/**
 * 音频节点（node-canvas-v2 §2.2）。
 *
 * 收起 = 波形位 + 时长；展开 = 播放器 + 归属角色 + 编排区。
 * ⛔ 不再走 `NodeDetailPanel` 那张覆盖面板。
 *
 * ⚠ 图片节点已于 2026-09-07 21:53 (JST) 拆到 `ImageNodeV4.tsx` —— 两类的展开态从
 * C3c-② 起各自长出一整套子面板（图片走审核/证据/关系带，音频走音色库/情绪参数），
 * 再共用一个文件只会让两边互相挡路。共享的只剩 `NodeV4SlotRail`。
 */

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { AudioPlayer } from '@/components/ui/audio-player'
import { NODE_V4_CARD } from '@/constants/node-studio'
import { resolveV4VoiceStatus } from '@/lib/node-v4-voice'
import type { NodeV4AudioData } from '@/types/node-workflow'

import { AudioNodeV4Voice } from './AudioNodeV4Voice'
import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4GenerateDesk } from './NodeV4GenerateDesk'
import { NodeV4SlotRail } from './NodeV4SlotRail'
import { NodeV4Shell } from './NodeV4Shell'

export function AudioNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const audioData = data as unknown as NodeV4AudioData
  const found = canvas.nodes.find((item) => item.id === id)
  if (!found) return null
  const expanded = canvas.expandedNodeId === id
  // 陈旧的 `ready` 一律降回 idle（判据在 `node-v4-voice`，卡面 / 槽架 / 送出预览
  // 读同一份）。⛔ 不在这里重算一次 —— legacy 就是这么长出三份的。
  const node = {
    ...found,
    data: { ...found.data, status: resolveV4VoiceStatus(audioData) },
  }

  return (
    <NodeV4Shell
      node={node}
      selected={selected}
      width={
        expanded ? NODE_V4_CARD.expandedWidth : NODE_V4_CARD.collapsedWidth
      }
      slotRail={expanded ? <NodeV4SlotRail node={node} /> : undefined}
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
          {/* 音色四态槽 / 声纹 / 声音库 / 归属 / 情绪·语速·音量 —— legacy
              `VoiceNode` 卡面与 `VoiceDetailBody` 详情两块在这里合成一块。 */}
          <AudioNodeV4Voice node={found} data={audioData} />
          <NodeV4GenerateDesk node={found} />
        </div>
      }
    />
  )
}
