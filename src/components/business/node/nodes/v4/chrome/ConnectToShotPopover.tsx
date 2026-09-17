'use client'

/**
 * 「**连到镜头**」弹层（spec §1.13，画板 `ConnectToShot.dc.html`）。
 *
 * 音频 / 图片 / 文本三类卡工具条上原来那颗「生镜头」改成了它：顶行「新建镜头」
 * （还是原来那一批：右侧落一张视频卡并连线），下面按镜头带顺序列出画布上**已有**
 * 的视频卡（缩略 · 名 · 时长），点一张就连过去。
 *
 * ── 目标槽按来源定（spec §1.13）───────────────────────────────────────
 * · 音频 → `voice`（音轨）· 文本 → `text`（镜头说明）· 图片 → 行内再选 首帧 / 尾帧。
 * · 目标槽**已有内容**时那一行写「替换」，⛔ 不静默覆盖。
 *
 * **纯呈现 + 受控**：不认识节点、不查图、不发 op。镜头列表、已占情况、连不连得上
 * 全由调用方算好递进来 —— 与 `NodeToolbar` / `NodePromptBar` 同一条分工。
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Plus, Search } from '@/components/icons'

import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { NODE_V4_CONNECT_TO_SHOT } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { cn } from '@/lib/utils'

/** 这颗键长在哪一类卡上 —— 它决定连过去落哪个槽。 */
export type ConnectToShotSourceKind =
  | typeof NODE_MEDIA_KIND_IDS.audio
  | typeof NODE_MEDIA_KIND_IDS.image
  | typeof NODE_MEDIA_KIND_IDS.text

/** 图片卡那一行的两个落点。 */
export const CONNECT_TO_SHOT_FRAME_SLOTS = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
] as const

/** 列表里的一行 = 画布上的一张视频卡。 */
export interface ConnectToShotTarget {
  readonly id: string
  /** 显示名（镜头号已经拼好，例 `S01 · 车站外`）。 */
  readonly name: string
  /** 时长读数（`7s`）。不知道就不给 —— ⛔ 不写 `0s`。 */
  readonly durationLabel?: string | undefined
  /** 封面或首帧静帧。 */
  readonly thumbnailUrl?: string | undefined
  /** 这张镜头**已经占住**的槽（决定哪一行写「替换」）。 */
  readonly occupiedSlots: readonly NodeSlotId[]
}

export interface ConnectToShotPopoverProps {
  /** 谁要连过去（只用来打 `data-` 做实测锚点，⛔ 组件不据此查图）。 */
  readonly sourceNodeId: string
  readonly sourceKind: ConnectToShotSourceKind
  readonly targets: readonly ConnectToShotTarget[]
  /** 顶行「新建镜头」—— 原来那一批（建卡 + 连线）原样保留。 */
  onNew(): void
  onConnect(targetId: string, slot: NodeSlotId): void
}

/** 非图片来源的固定落槽。 */
function defaultSlotOf(kind: ConnectToShotSourceKind): NodeSlotId {
  return kind === NODE_MEDIA_KIND_IDS.audio
    ? NODE_SLOT_IDS.voice
    : NODE_SLOT_IDS.text
}

export function ConnectToShotPopover({
  sourceNodeId,
  sourceKind,
  targets,
  onNew,
  onConnect,
}: ConnectToShotPopoverProps) {
  const t = useTranslations('StudioNode.v4.connectToShot')
  const tSlots = useTranslations('StudioNode.v4.slots')
  const [search, setSearch] = useState('')
  /** 图片卡：每一行各自选 首帧 / 尾帧（默认首帧，画板上那一段是行内的）。 */
  const [frameByTarget, setFrameByTarget] = useState<
    Readonly<Record<string, NodeSlotId>>
  >({})

  const picksFrame = sourceKind === NODE_MEDIA_KIND_IDS.image
  const keyword = search.trim().toLowerCase()
  const visible =
    keyword.length === 0
      ? targets
      : targets.filter((item) => item.name.toLowerCase().includes(keyword))

  const slotOf = (target: ConnectToShotTarget): NodeSlotId =>
    picksFrame
      ? (frameByTarget[target.id] ?? NODE_SLOT_IDS.firstFrame)
      : defaultSlotOf(sourceKind)

  return (
    <div
      data-connect-to-shot={sourceNodeId}
      data-source-kind={sourceKind}
      style={{
        width: picksFrame
          ? NODE_V4_CONNECT_TO_SHOT.widthWithFrameChoice
          : NODE_V4_CONNECT_TO_SHOT.width,
      }}
      className="flex flex-col gap-0.5"
    >
      <div className="flex h-8.5 items-center gap-2 px-2.5">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          data-connect-to-shot-search
          aria-label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-2xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>

      <button
        type="button"
        data-connect-to-shot-new
        onClick={onNew}
        className="flex h-8.5 items-center gap-2.5 rounded-lg px-2.5 text-2sm text-foreground transition-colors duration-fast hover:bg-surface-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Plus aria-hidden className="size-4 shrink-0" />
        {t('new')}
        <span className="ml-auto text-3xs text-muted-foreground">
          {t('newHint')}
        </span>
      </button>

      <span aria-hidden className="mx-1.5 my-1 h-px bg-border" />

      <span className="px-2.5 py-1 text-3xs text-muted-foreground">
        {t('listLabel')}
      </span>

      {visible.length === 0 ? (
        <p
          data-connect-to-shot-empty
          className="px-2.5 py-4 text-2xs text-muted-foreground"
        >
          {targets.length === 0 ? t('empty') : t('noMatch')}
        </p>
      ) : (
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {visible.map((target) => {
            const slot = slotOf(target)
            const occupied = target.occupiedSlots.includes(slot)
            return (
              <div
                key={target.id}
                data-connect-to-shot-row={target.id}
                data-slot={slot}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-fast hover:bg-surface-fill"
              >
                <button
                  type="button"
                  data-connect-to-shot-connect={target.id}
                  aria-label={t(occupied ? 'replaceIn' : 'connectInto', {
                    name: target.name,
                    slot: tSlots(slot),
                  })}
                  onClick={() => onConnect(target.id, slot)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {target.thumbnailUrl ? (
                    <Image
                      src={target.thumbnailUrl}
                      alt=""
                      width={NODE_V4_CONNECT_TO_SHOT.thumbWidth}
                      height={NODE_V4_CONNECT_TO_SHOT.thumbHeight}
                      unoptimized
                      style={{
                        width: NODE_V4_CONNECT_TO_SHOT.thumbWidth,
                        height: NODE_V4_CONNECT_TO_SHOT.thumbHeight,
                      }}
                      className="shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: NODE_V4_CONNECT_TO_SHOT.thumbWidth,
                        height: NODE_V4_CONNECT_TO_SHOT.thumbHeight,
                      }}
                      className="shrink-0 rounded-md bg-surface-fill-track"
                    />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-2xs text-foreground">
                      {target.name}
                    </span>
                    <span className="truncate text-3xs tabular-nums text-muted-foreground">
                      {target.durationLabel ?? t('durationUnknown')}
                    </span>
                  </span>
                </button>
                {occupied ? (
                  <span
                    data-connect-to-shot-occupied={slot}
                    className="shrink-0 text-3xs text-muted-foreground"
                  >
                    {t('occupied', { slot: tSlots(slot) })}
                  </span>
                ) : null}
                {picksFrame ? (
                  <span
                    data-connect-to-shot-frame={target.id}
                    className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-fill p-0.75"
                  >
                    {CONNECT_TO_SHOT_FRAME_SLOTS.map((frame) => (
                      <button
                        key={frame}
                        type="button"
                        data-frame-slot={frame}
                        data-active={frame === slot ? 'true' : undefined}
                        aria-pressed={frame === slot}
                        onClick={() =>
                          setFrameByTarget((current) => ({
                            ...current,
                            [target.id]: frame,
                          }))
                        }
                        className={cn(
                          'rounded-md px-2 py-1 text-3xs transition-colors duration-fast',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          frame === slot
                            ? 'bg-card font-semibold text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {tSlots(frame)}
                      </button>
                    ))}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
