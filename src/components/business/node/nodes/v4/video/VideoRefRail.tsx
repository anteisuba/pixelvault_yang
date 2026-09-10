'use client'

/**
 * 视频节点的**参考轨**（spec §5，画板 `VideoRefs.dc.html` 方向 A 定稿）。
 *
 * 提示词栏首行 = 三组（图 · 视频 · 语音）以细分隔线分开，每项 48px 编号缩略
 * （图角标写 首 / 尾），每组末尾一个虚线加号。展开态的画中框在播放器与说明之间
 * 摆**同一个组件**，⛔ 不做第二份。
 *
 * ── 两条纪律 ──────────────────────────────────────────────────────────
 * ① **序号不在这里数**：`readVideoRail` 发号，@ 引用读的是同一份号（`@图1`）。
 *    组件里再数一遍就会与正文对不上。
 * ② **纯呈现**：不认识节点、不发 op、不查模型表。上限与「这个模型没有参考变体」
 *    由调用方算好传进来（`videoRailCapacity`）。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Plus, Upload, Library, ImageIcon, Film } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { cn } from '@/lib/utils'
import {
  VIDEO_RAIL_GROUPS,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailEntry,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'

/**
 * 轨上每项 48px（画板 `VideoRefs.dc.html` `.th`，2026-09-10 owner 真机反馈把
 * 32 抬到 48：32px 的缩略认不出画面，「挂了什么」这件事就白摆了）。
 */
const RAIL_THUMB_PX = 48

/** 图组里点一张能改成的三个角色（画板：作首帧 / 作尾帧 / 作参考）。 */
const IMAGE_ROLE_SLOTS = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
  NODE_SLOT_IDS.reference,
] as const

export interface VideoRailCandidate {
  readonly id: string
  readonly name: string
}

export interface VideoRefRailProps {
  readonly items: readonly VideoRailEntry[]
  /** 每组上限；`null` = 上游没公布硬上限（加号不灰）。 */
  readonly capacity: {
    readonly images: number | null
    readonly videos: number | null
    readonly voices: number | null
  }
  /** 这个模型没有参考变体 —— 视频 / 语音两组的加号灰 + hover 说明。 */
  readonly referenceUnavailable?: boolean
  /** 换角色：同一批 `disconnect + connect(slot)`（一条撤销）。 */
  onChangeRole(item: VideoRailEntry, slot: NodeSlotId): void
  onOpen(sourceNodeId: string): void
  onRemove(edgeId: string): void
  /** 「画布上的 X ›」里的候选（已有产物的卡）。 */
  candidatesOf(group: VideoRailGroupId): readonly VideoRailCandidate[]
  onPickFromCanvas(group: VideoRailGroupId, sourceNodeId: string): void
  onUpload(group: VideoRailGroupId): void
  onLibrary(group: VideoRailGroupId): void
  readonly disabled?: boolean
  readonly className?: string
}

function WaveformGlyph() {
  return (
    <span
      aria-hidden
      className="flex h-4 shrink-0 items-end gap-0.5 text-foreground"
    >
      <i className="block h-1.5 w-0.5 rounded-full bg-current" />
      <i className="block h-3.5 w-0.5 rounded-full bg-current" />
      <i className="block h-2.25 w-0.5 rounded-full bg-current" />
      <i className="block h-3 w-0.5 rounded-full bg-current" />
    </span>
  )
}

export function VideoRefRail({
  items,
  capacity,
  referenceUnavailable = false,
  onChangeRole,
  onOpen,
  onRemove,
  candidatesOf,
  onPickFromCanvas,
  onUpload,
  onLibrary,
  disabled = false,
  className,
}: VideoRefRailProps) {
  const t = useTranslations('StudioNode.v4')
  const tVideo = useTranslations('StudioNode.v4.video')

  const limitOf = (group: VideoRailGroupId): number | null =>
    group === VIDEO_RAIL_GROUP_IDS.image
      ? capacity.images
      : group === VIDEO_RAIL_GROUP_IDS.video
        ? capacity.videos
        : capacity.voices

  const blockedOf = (group: VideoRailGroupId): string | null => {
    if (referenceUnavailable && group !== VIDEO_RAIL_GROUP_IDS.image) {
      return tVideo('rail.referenceUnavailable')
    }
    const limit = limitOf(group)
    const current = items.filter((item) => item.group === group).length
    if (limit !== null && current >= limit) {
      return tVideo('rail.full', { limit })
    }
    return null
  }

  return (
    <div
      data-video-ref-rail
      // 轨上双击（连点一张缩略）**不冒泡到卡片** —— 卡片的双击是展开。
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {VIDEO_RAIL_GROUPS.map((group, groupIndex) => {
        const groupItems = items.filter((item) => item.group === group)
        const blocked = blockedOf(group)
        const candidates = candidatesOf(group)
        return (
          <div
            key={group}
            data-video-rail-group={group}
            className="flex flex-wrap items-center gap-1"
          >
            {groupIndex > 0 ? (
              <span
                aria-hidden
                className="mx-1 block h-7.5 w-px shrink-0 bg-border"
              />
            ) : null}

            {groupItems.map((item) => (
              <DropdownMenu key={item.edgeId}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    data-video-rail-item={item.group}
                    data-video-rail-index={item.index}
                    data-video-rail-slot={item.slot}
                    aria-label={tVideo('rail.itemLabel', {
                      group: tVideo(`rail.group.${item.group}`),
                      index: item.index,
                      name: item.sourceName,
                    })}
                    onKeyDown={(event) => {
                      if (event.key !== 'Backspace' && event.key !== 'Delete') {
                        return
                      }
                      event.preventDefault()
                      onRemove(item.edgeId)
                    }}
                    className={cn(
                      'nodrag nopan relative size-12 shrink-0 rounded-node-thumb bg-surface-fill',
                      'transition-colors duration-fast ease-standard hover:bg-surface-fill-hover',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      'disabled:pointer-events-none disabled:opacity-60',
                    )}
                  >
                    {item.group === VIDEO_RAIL_GROUP_IDS.voice ? (
                      <span className="flex size-full items-center justify-center">
                        <WaveformGlyph />
                      </span>
                    ) : item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
                        alt=""
                        width={RAIL_THUMB_PX}
                        height={RAIL_THUMB_PX}
                        unoptimized
                        className="size-full rounded-node-thumb object-cover"
                      />
                    ) : item.group === VIDEO_RAIL_GROUP_IDS.video ? (
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <Film aria-hidden className="size-5" />
                      </span>
                    ) : (
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageIcon aria-hidden className="size-5" />
                      </span>
                    )}
                    <span
                      aria-hidden
                      data-video-rail-badge
                      className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold text-primary-foreground tabular-nums"
                    >
                      {item.index}
                    </span>
                    {item.slot === NODE_SLOT_IDS.firstFrame ||
                    item.slot === NODE_SLOT_IDS.lastFrame ? (
                      <span
                        aria-hidden
                        data-video-rail-role={item.slot}
                        className="absolute bottom-0 left-0 rounded-tr-md rounded-bl-node-thumb bg-foreground/70 px-1.25 text-3xs text-background"
                      >
                        {tVideo(`rail.roleBadge.${item.slot}`)}
                      </span>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-42">
                  {item.group === VIDEO_RAIL_GROUP_IDS.image
                    ? IMAGE_ROLE_SLOTS.map((slot) => (
                        <DropdownMenuItem
                          key={slot}
                          data-video-rail-role-action={slot}
                          onSelect={() => {
                            if (slot === item.slot) return
                            onChangeRole(item, slot)
                          }}
                        >
                          {tVideo(`rail.setRole.${slot}`)}
                          {slot === item.slot ? (
                            <span
                              aria-hidden
                              className="ms-auto size-1.5 rounded-full bg-status-applied"
                            />
                          ) : null}
                        </DropdownMenuItem>
                      ))
                    : null}
                  {item.group === VIDEO_RAIL_GROUP_IDS.image ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  <DropdownMenuItem
                    data-video-rail-open
                    onSelect={() => onOpen(item.sourceNodeId)}
                  >
                    {tVideo('rail.open')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-video-rail-remove
                    variant="destructive"
                    onSelect={() => onRemove(item.edgeId)}
                  >
                    {tVideo('rail.remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}

            {/* 每组末尾的虚线加号。满了 / 模型没有参考变体时**灰掉不藏**
                （Hard Rule 8），理由写在 title 上。 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-video-rail-add={group}
                  data-video-rail-add-blocked={blocked ? 'true' : 'false'}
                  disabled={disabled || blocked !== null}
                  title={blocked ?? undefined}
                  aria-label={tVideo('rail.addLabel', {
                    group: tVideo(`rail.group.${group}`),
                  })}
                  className={cn(
                    'nodrag nopan flex size-12 shrink-0 items-center justify-center rounded-node-thumb border border-dashed border-border text-muted-foreground',
                    'transition-colors duration-fast ease-standard hover:border-foreground/40 hover:text-foreground',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <Plus aria-hidden className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger data-video-rail-canvas={group}>
                    {tVideo(`rail.fromCanvas.${group}`)}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {candidates.length === 0 ? (
                      <DropdownMenuItem disabled>
                        {t('chrome.emptyHint')}
                      </DropdownMenuItem>
                    ) : (
                      candidates.map((candidate) => (
                        <DropdownMenuItem
                          key={candidate.id}
                          data-video-rail-candidate={candidate.id}
                          onSelect={() => onPickFromCanvas(group, candidate.id)}
                        >
                          {candidate.name}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  data-video-rail-upload={group}
                  onSelect={() => onUpload(group)}
                >
                  <Upload aria-hidden className="size-4" />
                  {tVideo('rail.upload')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-video-rail-library={group}
                  onSelect={() => onLibrary(group)}
                >
                  <Library aria-hidden className="size-4" />
                  {tVideo('rail.library')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      })}
    </div>
  )
}
