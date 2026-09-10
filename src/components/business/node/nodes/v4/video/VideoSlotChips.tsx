'use client'

/**
 * 提示词栏**首行**那排小 chip（spec §5，画板 `VideoSelected.dc.html` 第 57 行）：
 * 已经挂上的 首帧 / 尾帧 / 语音，缩略 + 槽名，可点开、可退格删。
 *
 * ⚠ 这是**槽的读数**，不是 @ 引用 —— 所以不用 `MentionChip`（那颗写的是 `@名字`，
 * 画板上这一颗写的是槽名）。卡面上仍然不显示槽（spec §5），槽只在这一行出现。
 *
 * ⚠ 它挂在 `NodePromptBar.leadingRow`（S5d 补的壳级入口）——壳那一层的 `chips` 是
 * **右侧**参数区，两者不是一回事。⛔ 不再作为独立一行贴在栏上方（那是 S5b 缺壳
 * 入口时的权宜，画板上这排 chip 与正文是同一片玻璃）。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { NODE_V4_CHROME } from '@/constants/node-studio'
import type { NodeSlotId } from '@/constants/node-slots'
import { cn } from '@/lib/utils'

/** 一颗已挂 chip。`edgeId` 是退格删要断的那条边。 */
export interface VideoSlotChipItem {
  readonly slot: NodeSlotId
  readonly edgeId: string
  readonly sourceNodeId: string
  readonly sourceName: string
  /** 图 / 视频有缩略；语音没有（画一枚波形小标）。 */
  readonly thumbnailUrl?: string
  readonly waveform?: boolean
}

export interface VideoSlotChipsProps {
  readonly items: readonly VideoSlotChipItem[]
  /** 点开 = 高亮并平移到来源卡（§3.4「点槽内内容不是打开它」）。 */
  onOpen(sourceNodeId: string): void
  /** 退格 / Delete = 断这条边。 */
  onRemove(edgeId: string): void
  readonly className?: string
}

function WaveformGlyph() {
  return (
    <span
      aria-hidden
      className="flex h-3 shrink-0 items-end gap-px text-foreground"
    >
      <i className="block h-1.25 w-0.5 rounded-full bg-current" />
      <i className="block h-2.75 w-0.5 rounded-full bg-current" />
      <i className="block h-1.75 w-0.5 rounded-full bg-current" />
    </span>
  )
}

export function VideoSlotChips({
  items,
  onOpen,
  onRemove,
  className,
}: VideoSlotChipsProps) {
  const t = useTranslations('StudioNode.v4')
  const tVideo = useTranslations('StudioNode.v4.video')
  if (items.length === 0) return null
  const size = NODE_V4_CHROME.mentionThumbSize

  return (
    <div
      data-video-slot-chips
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {items.map((item) => (
        <button
          key={item.edgeId}
          type="button"
          data-video-slot-chip={item.slot}
          aria-label={tVideo('slotChip', {
            slot: t(`slots.${item.slot}`),
            name: item.sourceName,
          })}
          onClick={() => onOpen(item.sourceNodeId)}
          onKeyDown={(event) => {
            if (event.key !== 'Backspace' && event.key !== 'Delete') return
            event.preventDefault()
            onRemove(item.edgeId)
          }}
          className={cn(
            'nodrag nopan inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full bg-surface-fill py-0 pr-2 pl-0.75 text-2xs',
            'transition-colors duration-fast ease-standard hover:bg-surface-fill-hover',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          {item.waveform ? (
            <span className="pl-1">
              <WaveformGlyph />
            </span>
          ) : item.thumbnailUrl ? (
            <Image
              src={item.thumbnailUrl}
              alt=""
              width={size}
              height={size}
              unoptimized
              className="size-5 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="size-5 shrink-0 rounded-sm bg-surface-fill-track"
            />
          )}
          <span className="truncate">{t(`slots.${item.slot}`)}</span>
        </button>
      ))}
    </div>
  )
}
