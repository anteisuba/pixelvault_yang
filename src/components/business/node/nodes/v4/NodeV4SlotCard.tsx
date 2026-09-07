'use client'

/**
 * 槽位卡（node-canvas-v2 §1.4 版本轮播 · §3.4 连上后显示在槽内）。
 *
 * 已连 → 上游缩略 + `‹ n/N ›` 轮播 + 停用打叉；空槽 → 虚线 + 槽名。
 *
 * ⚠ **翻着看不改 `cur`**：左右角标只换预览，要点一下「设为当前」才算改——翻页
 * 产生 undo 条目会让「我就看一眼」变成一次可撤销的修改。
 */

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { NodeSlotId } from '@/constants/node-slots'
import { cn } from '@/lib/utils'
import type { NodeV4, NodeV4SlotBinding } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'

export interface NodeV4SlotCardProps {
  readonly nodeId: string
  readonly slot: NodeSlotId
  readonly binding?: NodeV4SlotBinding
}

export function NodeV4SlotCard({ nodeId, slot, binding }: NodeV4SlotCardProps) {
  const t = useTranslations('StudioNode.v4')
  const canvas = useNodeV4Canvas()
  const versions = binding?.versions ?? []
  const currentIndex = Math.max(
    versions.findIndex((version) => version.id === binding?.cur),
    0,
  )
  const [previewIndex, setPreviewIndex] = useState(currentIndex)
  // 当前版换了（助手改了 / 新连了一版）→ 预览跳回当前版。渲染期同步，
  // ⛔ 不放 effect 里。
  const [syncedCurrent, setSyncedCurrent] = useState(currentIndex)
  if (syncedCurrent !== currentIndex) {
    setSyncedCurrent(currentIndex)
    setPreviewIndex(currentIndex)
  }

  if (versions.length === 0) {
    return (
      <div
        data-slot-id={slot}
        data-slot-empty="true"
        className="flex h-20 w-24 flex-col items-center justify-center rounded-md border border-dashed text-2xs text-muted-foreground"
      >
        <SlotSwatch slot={slot} />
        {t(`slots.${slot}`)}
      </div>
    )
  }

  const version = versions[Math.min(previewIndex, versions.length - 1)]
  const source: NodeV4 | undefined = canvas.nodes.find(
    (node) => node.id === version?.sourceNodeId,
  )
  const isCurrent = version?.id === binding?.cur

  return (
    <div
      data-slot-id={slot}
      data-slot-empty="false"
      data-version-current={isCurrent ? 'true' : 'false'}
      className="w-24 rounded-md border p-1"
    >
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <SlotSwatch slot={slot} />
        <span className="truncate">{t(`slots.${slot}`)}</span>
      </div>

      <button
        type="button"
        onClick={() => version && canvas.onFocusNode(version.sourceNodeId)}
        title={source?.data.name}
        aria-label={source?.data.name ?? t(`slots.${slot}`)}
        className="relative mt-1 block h-12 w-full overflow-hidden rounded"
      >
        <SlotMedia source={source} label={source?.data.name ?? ''} />
        {version?.blocked ? (
          <span
            data-blocked="true"
            title={version.blockedReason}
            className="absolute inset-0 flex items-center justify-center bg-background/60"
          >
            <X className="size-6 text-destructive" />
          </span>
        ) : null}
      </button>

      {versions.length > 1 ? (
        <div className="mt-1 flex items-center justify-between text-2xs">
          <button
            type="button"
            aria-label={t('versionPrev')}
            disabled={previewIndex === 0}
            onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}
            className="disabled:opacity-30"
          >
            <ChevronLeft className="size-3" />
          </button>
          <span data-version-counter>
            {previewIndex + 1}/{versions.length}
          </span>
          <button
            type="button"
            aria-label={t('versionNext')}
            disabled={previewIndex >= versions.length - 1}
            onClick={() =>
              setPreviewIndex((index) =>
                Math.min(versions.length - 1, index + 1),
              )
            }
            className="disabled:opacity-30"
          >
            <ChevronRight className="size-3" />
          </button>
        </div>
      ) : null}

      {!isCurrent && version ? (
        <button
          type="button"
          disabled={version.blocked}
          title={version.blocked ? version.blockedReason : undefined}
          onClick={() => canvas.onSelectSlotVersion(nodeId, slot, version.id)}
          className={cn(
            'mt-1 w-full rounded border px-1 py-0.5 text-2xs',
            version.blocked && 'cursor-not-allowed opacity-50',
          )}
        >
          {t('setCurrent')}
        </button>
      ) : null}

      {version ? (
        <button
          type="button"
          aria-label={t('slotDisconnect')}
          onClick={() => canvas.onDisconnectSlot(nodeId, slot, version.id)}
          className="mt-1 w-full text-2xs text-muted-foreground hover:text-destructive"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

/**
 * 槽名前的 6px 方色标 —— 四族色允许的第二个落点（§2.5）。
 * 色档与端口点同源（`NodeV4Shell` 的 `PORT_CLASS`），对比度实测见那里的注释：
 * 浅色 600 档 3.19–5.70、暗色 400 档 6.59–10.74，均过 3:1。
 */
function SlotSwatch({ slot }: { slot: NodeSlotId }) {
  const family =
    slot === 'voice' || slot === 'timbre'
      ? 'bg-amber-600 dark:bg-amber-400'
      : slot === 'text' || slot === 'source'
        ? 'bg-sky-600 dark:bg-sky-400'
        : slot === 'clip'
          ? 'bg-violet-600 dark:bg-violet-400'
          : 'bg-emerald-600 dark:bg-emerald-400'
  return <span className={cn('size-1.5 shrink-0 rounded-xs', family)} />
}

function SlotMedia({ source, label }: { source?: NodeV4; label: string }) {
  if (!source) {
    return <div className="h-full w-full bg-muted" />
  }
  if (source.data.kind === 'text') {
    return (
      <span className="flex h-full w-full items-center px-1 text-left text-2xs">
        {source.data.body.slice(0, 12)}…
      </span>
    )
  }
  if (source.data.kind === 'audio') {
    return (
      <span className="flex h-full w-full items-center justify-center bg-muted text-2xs">
        {source.data.durationSec
          ? `${Math.round(source.data.durationSec)}s`
          : '♪'}
      </span>
    )
  }
  if (!source.data.url) {
    return <div className="h-full w-full bg-muted" />
  }
  if (source.data.kind === 'video') {
    return (
      <video
        src={source.data.url}
        className="dark h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source.data.url}
      alt={label}
      className="dark h-full w-full object-cover"
      draggable={false}
    />
  )
}
