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
import { NODE_V4_CARD } from '@/constants/node-studio'
import { cn } from '@/lib/utils'
import type { NodeV4, NodeV4SlotBinding } from '@/types/node-workflow'

import { useNodeV4Canvas } from './NodeV4Context'

export interface NodeV4SlotCardProps {
  readonly nodeId: string
  readonly slot: NodeSlotId
  readonly binding?: NodeV4SlotBinding
  /**
   * `horizontal` = 展开态那条横轨里的一格（定宽 `slotCardWidth` + snap）；
   * `vertical` = 收起态左缘那一列（形态不动）。
   */
  readonly layout?: 'vertical' | 'horizontal'
}

export function NodeV4SlotCard({
  nodeId,
  slot,
  binding,
  layout = 'vertical',
}: NodeV4SlotCardProps) {
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
  const horizontal = layout === 'horizontal'
  const sizeStyle = horizontal
    ? { width: NODE_V4_CARD.slotCardWidth }
    : undefined
  if (syncedCurrent !== currentIndex) {
    setSyncedCurrent(currentIndex)
    setPreviewIndex(currentIndex)
  }

  if (versions.length === 0) {
    return (
      <div
        data-slot-id={slot}
        data-slot-empty="true"
        style={sizeStyle}
        className={cn(
          'flex h-20 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-surface-fill text-2xs text-muted-foreground corner-squircle',
          !horizontal && 'w-24',
        )}
      >
        <SlotSwatch slot={slot} />
        {t(`slots.${slot}`)}
        <span className="text-3xs">{t('slotEmpty')}</span>
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
      data-blocked={version?.blocked ? 'true' : 'false'}
      style={sizeStyle}
      className={cn(
        // 槽卡进入走 `spring-slot`；⛔ 移除不用弹簧（弹着消失像 bug），
        // 那一档在轨上由 `AnimatePresence` 之外的 CSS 过渡处理。
        'group/slot shrink-0 snap-start rounded-xl border bg-card p-1.5 corner-squircle',
        'transition-[border-color,box-shadow] duration-(--duration-fast) ease-standard',
        !horizontal && 'w-24',
        version?.blocked && 'border-destructive',
      )}
    >
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <SlotSwatch slot={slot} />
        <span className="truncate">{t(`slots.${slot}`)}</span>
        {/* 角色小标（C1 契约修正 2）：只有分角色的槽（`video.shot.text`）才有
            `role`，三档去向不同——剧本进正文、风格进约束段、角色进角色段。不标
            出来，用户看不出哪段会被当画面描述念出来。 */}
        {version?.role ? (
          <span
            data-text-role={version.role}
            className="ml-auto shrink-0 rounded-xs border px-1"
          >
            {t(`textRoles.${version.role}`)}
          </span>
        ) : null}
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
        <div className="mt-1.5 flex items-center justify-between text-3xs">
          <button
            type="button"
            aria-label={t('versionPrev')}
            disabled={previewIndex === 0}
            onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}
            className="flex size-5 items-center justify-center rounded-full hover:bg-surface-fill-hover disabled:opacity-30"
          >
            <ChevronLeft className="size-3" />
          </button>
          <span data-version-counter className="font-mono tabular-nums">
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
            className="flex size-5 items-center justify-center rounded-full hover:bg-surface-fill-hover disabled:opacity-30"
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
            // blocked 时**禁用而不是隐藏**：位置一跳，用户就以为这一版没了。
            'mt-1.5 w-full rounded-lg bg-surface-fill px-1 py-1 text-3xs hover:bg-surface-fill-hover',
            version.blocked && 'cursor-not-allowed opacity-50',
          )}
        >
          {t('setCurrent')}
        </button>
      ) : null}

      {version?.blocked ? (
        // 卡内只留 10px 短标，完整理由是轨下的脚注（`NodeV4SlotRail` 的调用方
        // 渲染）——长句塞进 100px 的格子里只会把卡撑成一段红色文字墙。
        <p data-blocked-note className="mt-1 text-3xs text-destructive">
          {t('blocked')}
        </p>
      ) : null}

      {version ? (
        // 「断开」进 hover 动作（owner 2026-09-08）：常驻一行文字按钮会跟
        // 「设为当前」抢整宽。触屏没有 hover，`coarse:` 下常显。
        <button
          type="button"
          aria-label={t('slotDisconnect')}
          onClick={() => canvas.onDisconnectSlot(nodeId, slot, version.id)}
          className="mt-1 w-full rounded-lg text-3xs text-muted-foreground opacity-0 transition-opacity duration-(--duration-fast) ease-standard group-hover/slot:opacity-100 focus-visible:opacity-100 hover:text-destructive coarse:opacity-100"
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
