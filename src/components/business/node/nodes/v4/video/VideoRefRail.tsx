'use client'

/**
 * 视频节点的**参考轨**（spec §5，画板 `VideoRefs.dc.html` 方向 A 定稿）。
 *
 * 提示词栏首行 = 图 / 视频 / 语音横向排列，每项 48px 编号缩略
 * （图角标写 首 / 尾，来源名悬停可见）。展开态的
 * 画中框在播放器与说明之间摆**同一个组件**，⛔ 不做第二份。
 *
 * ── 三条纪律 ──────────────────────────────────────────────────────────
 * ① **序号不在这里数**：`readVideoRail` 发号，@ 引用读的是同一份号（`@图1`）。
 *    组件里再数一遍就会与正文对不上。
 * ② **纯呈现**：不认识节点、不发 op、不查模型表。上限与「这个模型没有参考变体」
 *    由调用方算好传进来（`videoRailCapacity`），上传进度也由调用方喂（`pending`）。
 * ③ 来源名保留在 title 与辅助名称里，画面上只留缩略与编号。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ImageIcon, Film, AlertTriangle } from '@/components/icons'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { motionTransition } from '@/constants/motion'
import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { cn } from '@/lib/utils'
import {
  VIDEO_RAIL_GROUPS,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailEntry,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'

import { useBrokenThumbs } from '../chrome/NodeMediaMissing'
import {
  FADE_ONLY,
  GROW_FROM_EDGE,
  type ChromeMotion,
} from '../chrome/chrome-motion'

/**
 * 轨上每项 48px（画板 `VideoRefs.dc.html` `.th`，2026-09-10 owner 真机反馈把
 * 32 抬到 48：32px 的缩略认不出画面，「挂了什么」这件事就白摆了）。
 */
const RAIL_THUMB_PX = 48
const EXPANDED_THUMB_PX = 44

/** 图组里点一张能改成的三个角色（画板：作首帧 / 作尾帧 / 作参考）。 */
const IMAGE_ROLE_SLOTS = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
  NODE_SLOT_IDS.reference,
] as const

export interface VideoRailCandidate {
  readonly id: string
  readonly name: string
  readonly thumbnailUrl?: string | undefined
}

/**
 * 正在上传、还没落成卡的那一格（spec §1.9 的「先有位置再有内容」搬到轨上，
 * 2026-09-10 owner 真机反馈第七条）。
 *
 * ⚠ 它**不是**节点：没有 edgeId、没有序号（序号只有落成边之后才由
 * `readVideoRail` 发）。占位项排在本组已有项之后。
 */
export interface VideoRailPendingItem {
  readonly id: string
  readonly group: VideoRailGroupId
  /** 文件名 —— 占位期唯一能写的名字。 */
  readonly name: string
  /** 0–100；上游报不出真实字节进度时停在 0（这时只有转圈）。 */
  readonly progress: number
  /** 有值 = 这一格失败了：变红、可重试 / 移除。 */
  readonly error?: string | null
}

export interface VideoRefRailProps {
  readonly items: readonly VideoRailEntry[]
  /** 正在上传的占位项（可选）。 */
  readonly pending?: readonly VideoRailPendingItem[]
  /** 每组上限；添加菜单据此判断是否可挂。 */
  readonly capacity: {
    readonly images: number | null
    readonly videos: number | null
    readonly voices: number | null
  }
  /** 这个模型没有参考变体 —— 视频 / 语音在添加菜单禁用。 */
  readonly referenceUnavailable?: boolean
  /** 换角色：同一批 `disconnect + connect(slot)`（一条撤销）。 */
  onChangeRole(item: VideoRailEntry, slot: NodeSlotId): void
  onOpen(sourceNodeId: string): void
  onRemove(edgeId: string): void
  /** 「画布上的」候选（已有产物的卡）。 */
  candidatesOf(group: VideoRailGroupId): readonly VideoRailCandidate[]
  onPickFromCanvas(group: VideoRailGroupId, sourceNodeId: string): void
  onUpload(group: VideoRailGroupId): void
  onLibrary(group: VideoRailGroupId): void
  /** 失败占位项上的两个动作；不给就只画红格。 */
  onRetryPending?(id: string): void
  onRemovePending?(id: string): void
  readonly animateOnMount?: boolean
  readonly expanded?: boolean
  readonly disabled?: boolean
  readonly className?: string
}

function WaveformGlyph() {
  return (
    <span
      aria-hidden
      className="flex h-3.5 shrink-0 items-end gap-0.5 text-foreground"
    >
      <i className="block h-1.5 w-0.5 rounded-full bg-current" />
      <i className="block h-3 w-0.5 rounded-full bg-current" />
      <i className="block h-2 w-0.5 rounded-full bg-current" />
      <i className="block h-2.5 w-0.5 rounded-full bg-current" />
    </span>
  )
}

function RailCell({
  children,
  enter,
  expanded,
}: {
  readonly children: React.ReactNode
  readonly enter?: ChromeMotion
  readonly expanded?: boolean
}) {
  return (
    <motion.div
      className={cn(expanded ? 'size-11' : 'size-12', 'shrink-0')}
      initial={enter?.initial ?? false}
      animate={enter?.animate}
    >
      {children}
    </motion.div>
  )
}

export function VideoRefRail({
  items,
  pending = [],
  onChangeRole,
  onOpen,
  onRemove,
  onRetryPending,
  onRemovePending,
  animateOnMount = false,
  expanded = false,
  disabled = false,
  className,
}: VideoRefRailProps) {
  const tVideo = useTranslations('StudioNode.v4.video')
  const reducedMotion = useReducedMotion()
  const enter = reducedMotion ? FADE_ONLY : GROW_FROM_EDGE
  const hoverTransition = motionTransition('fast', reducedMotion)
  const progressTransition = motionTransition('base', reducedMotion)
  // 素材删了：缩略图退回「没封面」的占位，⛔ 不画裂图（owner 09-28）。
  const thumbs = useBrokenThumbs()

  return (
    <div
      data-video-ref-rail
      // 轨上双击（连点一张缩略）**不冒泡到卡片** —— 卡片的双击是展开。
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'nodrag nopan nowheel -m-1 flex min-w-0 max-w-full items-start gap-2 overflow-x-auto p-1',
        className,
      )}
    >
      {VIDEO_RAIL_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group)
        const groupPending = pending.filter((item) => item.group === group)
        return (
          <div key={group} data-video-rail-group={group} className="contents">
            <AnimatePresence initial={animateOnMount}>
              {groupItems.map((item) => (
                <RailCell key={item.edgeId} enter={enter} expanded={expanded}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <motion.button
                        type="button"
                        disabled={disabled}
                        data-video-rail-item={item.group}
                        data-video-rail-index={item.index}
                        data-video-rail-slot={item.slot}
                        title={item.sourceName}
                        aria-label={tVideo('rail.itemLabel', {
                          group: tVideo(`rail.group.${item.group}`),
                          index: item.index,
                          name: item.sourceName,
                        })}
                        onKeyDown={(event) => {
                          if (
                            event.key !== 'Backspace' &&
                            event.key !== 'Delete'
                          ) {
                            return
                          }
                          event.preventDefault()
                          onRemove(item.edgeId)
                        }}
                        animate={{ backgroundColor: 'var(--surface-fill)' }}
                        whileHover={{
                          backgroundColor: 'var(--surface-fill-hover)',
                        }}
                        transition={hoverTransition}
                        className={cn(
                          'nodrag nopan relative shrink-0 bg-surface-fill',
                          expanded
                            ? 'size-11 rounded-lg'
                            : 'size-12 rounded-node-thumb',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          'disabled:pointer-events-none disabled:opacity-60',
                        )}
                      >
                        {item.group === VIDEO_RAIL_GROUP_IDS.voice ? (
                          <span className="flex size-full items-center justify-center">
                            <WaveformGlyph />
                          </span>
                        ) : thumbs.usable(item.thumbnailUrl) ? (
                          <Image
                            src={item.thumbnailUrl!}
                            alt=""
                            width={expanded ? EXPANDED_THUMB_PX : RAIL_THUMB_PX}
                            height={
                              expanded ? EXPANDED_THUMB_PX : RAIL_THUMB_PX
                            }
                            unoptimized
                            onError={() =>
                              thumbs.markBroken(item.thumbnailUrl!)
                            }
                            className={cn(
                              'size-full object-cover',
                              expanded ? 'rounded-lg' : 'rounded-node-thumb',
                            )}
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
                          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-medium text-primary-foreground tabular-nums"
                        >
                          {tVideo(`rail.badge.${item.group}`, {
                            index: item.index,
                          })}
                        </span>
                        {item.slot === NODE_SLOT_IDS.firstFrame ||
                        item.slot === NODE_SLOT_IDS.lastFrame ? (
                          <span
                            aria-hidden
                            data-video-rail-role={item.slot}
                            className={cn(
                              'absolute bottom-0 left-0 rounded-tr-md bg-foreground/70 px-1.25 text-3xs text-background',
                              expanded
                                ? 'rounded-bl-lg'
                                : 'rounded-bl-node-thumb',
                            )}
                          >
                            {tVideo(`rail.roleBadge.${item.slot}`)}
                          </span>
                        ) : null}
                      </motion.button>
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
                </RailCell>
              ))}
            </AnimatePresence>

            {/* 上传中的占位项：先有位置，内容随后换上（owner 真机反馈第七条）。
                失败的那一格变红并挂上「重试 / 移除」，⛔ 不静默消失。 */}
            {groupPending.map((item) =>
              item.error ? (
                <RailCell key={item.id} expanded={expanded}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        data-video-rail-pending={item.group}
                        data-video-rail-pending-state="error"
                        title={item.error}
                        aria-label={tVideo('rail.uploadFailed', {
                          name: item.name,
                        })}
                        className={cn(
                          'nodrag nopan flex shrink-0 items-center justify-center border border-dashed border-destructive text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                          expanded
                            ? 'size-11 rounded-lg'
                            : 'size-12 rounded-node-thumb',
                        )}
                      >
                        <AlertTriangle aria-hidden className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-42">
                      <DropdownMenuItem
                        data-video-rail-pending-retry
                        onSelect={() => onRetryPending?.(item.id)}
                      >
                        {tVideo('rail.retry')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-video-rail-pending-remove
                        variant="destructive"
                        onSelect={() => onRemovePending?.(item.id)}
                      >
                        {tVideo('rail.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </RailCell>
              ) : (
                <RailCell key={item.id} expanded={expanded}>
                  <span
                    data-video-rail-pending={item.group}
                    data-video-rail-pending-state="uploading"
                    role="progressbar"
                    aria-valuenow={Math.round(item.progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={tVideo('rail.uploading', { name: item.name })}
                    className={cn(
                      'relative flex shrink-0 items-center justify-center border border-dashed border-border text-muted-foreground',
                      expanded
                        ? 'size-11 rounded-lg'
                        : 'size-12 rounded-node-thumb',
                    )}
                  >
                    <Spinner aria-hidden className="size-4" />
                    {/* 真实字节进度只有图片路由报得出来；报不出时这条线停在 0，
                        转圈仍在动 —— ⛔ 不编一个假进度。 */}
                    <span className="absolute inset-x-1.5 bottom-1.5 block h-0.5 overflow-hidden rounded-full bg-surface-fill-track">
                      <motion.span
                        initial={false}
                        animate={{ width: `${Math.round(item.progress)}%` }}
                        transition={progressTransition}
                        className="block h-full rounded-full bg-primary"
                      />
                    </span>
                  </span>
                </RailCell>
              ),
            )}
          </div>
        )
      })}
    </div>
  )
}
