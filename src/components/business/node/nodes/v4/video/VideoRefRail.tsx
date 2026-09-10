'use client'

/**
 * 视频节点的**参考轨**（spec §5，画板 `VideoRefs.dc.html` 方向 A 定稿）。
 *
 * 提示词栏首行 = 三组（图 · 视频 · 语音）以细分隔线分开，每项 48px 编号缩略
 * （图角标写 首 / 尾）**加一行 11px 的来源卡名**，每组末尾一个虚线加号。展开态的
 * 画中框在播放器与说明之间摆**同一个组件**，⛔ 不做第二份。
 *
 * ── 三条纪律 ──────────────────────────────────────────────────────────
 * ① **序号不在这里数**：`readVideoRail` 发号，@ 引用读的是同一份号（`@图1`）。
 *    组件里再数一遍就会与正文对不上。
 * ② **纯呈现**：不认识节点、不发 op、不查模型表。上限与「这个模型没有参考变体」
 *    由调用方算好传进来（`videoRailCapacity`），上传进度也由调用方喂（`pending`）。
 * ③ **名字是这一排的第二个读数**（2026-09-10 owner 真机反馈第二条）：只有缩略时
 *    四张灰图分不出谁是谁，语音那一格更是三条一模一样的波形。名字 11px、超长省略、
 *    hover 读全名；语音格另在波形下压两个字，缩略层面就分得开。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  Plus,
  Upload,
  Library,
  ImageIcon,
  Film,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

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

/** 语音格上压的字数 —— 两个字，再多在 48px 里就挤成一团。 */
const VOICE_INITIALS = 2

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

/**
 * 正在上传、还没落成卡的那一格（spec §1.9 的「先有位置再有内容」搬到轨上，
 * 2026-09-10 owner 真机反馈第七条）。
 *
 * ⚠ 它**不是**节点：没有 edgeId、没有序号（序号只有落成边之后才由
 * `readVideoRail` 发）。占位项排在本组已有项之后、加号之前。
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
  /** 失败占位项上的两个动作；不给就只画红格。 */
  onRetryPending?(id: string): void
  onRemovePending?(id: string): void
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

/** 一格 = 48 缩略 + 一行名字。名字那行**永远占位**，⛔ 不让加号比缩略高半行。 */
function RailCell({
  name,
  children,
}: {
  readonly name?: string
  readonly children: React.ReactNode
}) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
      {children}
      <span
        data-video-rail-name
        title={name}
        className="block w-full truncate text-center text-2xs leading-4 text-muted-foreground"
      >
        {name ?? ' '}
      </span>
    </div>
  )
}

export function VideoRefRail({
  items,
  pending = [],
  capacity,
  referenceUnavailable = false,
  onChangeRole,
  onOpen,
  onRemove,
  candidatesOf,
  onPickFromCanvas,
  onUpload,
  onLibrary,
  onRetryPending,
  onRemovePending,
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
    // ⚠ 占位项算进已挂数：不算的话上限满了还能再拖一个进来，落成卡那一刻才失败。
    const current =
      items.filter((item) => item.group === group).length +
      pending.filter((item) => item.group === group && !item.error).length
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
      className={cn('flex flex-wrap items-start gap-3', className)}
    >
      {VIDEO_RAIL_GROUPS.map((group, groupIndex) => {
        const groupItems = items.filter((item) => item.group === group)
        const groupPending = pending.filter((item) => item.group === group)
        const blocked = blockedOf(group)
        const candidates = candidatesOf(group)
        return (
          <div
            key={group}
            data-video-rail-group={group}
            className="flex flex-wrap items-start gap-2"
          >
            {groupIndex > 0 ? (
              <span
                aria-hidden
                className="mr-1 block h-16 w-px shrink-0 bg-border"
              />
            ) : null}

            {groupItems.map((item) => (
              <RailCell key={item.edgeId} name={item.sourceName}>
                <DropdownMenu>
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
                        if (
                          event.key !== 'Backspace' &&
                          event.key !== 'Delete'
                        ) {
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
                        // 语音：波形 + 名字首两字。三条语音的波形一模一样，
                        // 缩略层面必须有一处能分开（owner 真机反馈第二条）。
                        <span className="flex size-full flex-col items-center justify-center gap-0.5">
                          <WaveformGlyph />
                          <span
                            data-video-rail-voice-initials
                            className="block max-w-full truncate text-3xs leading-3 text-muted-foreground"
                          >
                            {item.sourceName.slice(0, VOICE_INITIALS)}
                          </span>
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
              </RailCell>
            ))}

            {/* 上传中的占位项：先有位置，内容随后换上（owner 真机反馈第七条）。
                失败的那一格变红并挂上「重试 / 移除」，⛔ 不静默消失。 */}
            {groupPending.map((item) =>
              item.error ? (
                <RailCell key={item.id} name={item.name}>
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
                        className="nodrag nopan flex size-12 shrink-0 items-center justify-center rounded-node-thumb border border-dashed border-destructive text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                <RailCell key={item.id} name={item.name}>
                  <span
                    data-video-rail-pending={item.group}
                    data-video-rail-pending-state="uploading"
                    role="progressbar"
                    aria-valuenow={Math.round(item.progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={tVideo('rail.uploading', { name: item.name })}
                    className="relative flex size-12 shrink-0 items-center justify-center rounded-node-thumb border border-dashed border-border text-muted-foreground"
                  >
                    <Loader2
                      aria-hidden
                      className="size-4 animate-spin motion-reduce:animate-none"
                    />
                    {/* 真实字节进度只有图片路由报得出来；报不出时这条线停在 0，
                        转圈仍在动 —— ⛔ 不编一个假进度。 */}
                    <span className="absolute inset-x-1.5 bottom-1.5 block h-0.5 overflow-hidden rounded-full bg-surface-fill-track">
                      <span
                        className="block h-full rounded-full bg-primary transition-[width] duration-base ease-standard motion-reduce:transition-none"
                        style={{ width: `${Math.round(item.progress)}%` }}
                      />
                    </span>
                  </span>
                </RailCell>
              ),
            )}

            {/* 每组末尾的虚线加号。满了 / 模型没有参考变体时**灰掉不藏**
                （Hard Rule 8），理由写在 title 上。 */}
            <RailCell>
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
                            onSelect={() =>
                              onPickFromCanvas(group, candidate.id)
                            }
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
            </RailCell>
          </div>
        )
      })}
    </div>
  )
}
