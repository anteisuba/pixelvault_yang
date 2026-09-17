'use client'

/**
 * 镜头卡上的**参考条**（画板 `MobileCanvas.dc.html` 方向 A 的 `.strip`）。
 *
 * 44px 缩略横滑（图 · 视频 · 语音，细分隔线分组），末尾一个虚线加号。
 * **参考条就是连线** —— 加 = 建卡 + 连槽，长按 = 断边；手机上不拖线。
 *
 * ── 两条纪律 ──────────────────────────────────────────────────────────
 * ① **序号不在这里数**：`readVideoRail` 发号（`@图1` 读的是同一份号）。
 * ② **纯呈现**：不发 op、不认识节点。加 / 删 / 从画布选三条都由调用方给
 *    （`useVideoRailBinding` 的 `railProps`，与桌面参考轨同一批回调）。
 */

import Image from 'next/image'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Film, ImageIcon, Plus } from '@/components/icons'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NODE_MOBILE_RAIL } from '@/constants/node-studio'
import {
  VIDEO_RAIL_GROUPS,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailEntry,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { cn } from '@/lib/utils'

export interface MobileRefStripProps {
  readonly items: readonly VideoRailEntry[]
  /** 长按移除（断边）。 */
  onRemove(edgeId: string): void
  /** 加号：先选组，再选来路。 */
  candidatesOf(group: VideoRailGroupId): readonly { id: string; name: string }[]
  onPickFromCanvas(group: VideoRailGroupId, sourceNodeId: string): void
  onUpload(group: VideoRailGroupId): void
  onLibrary(group: VideoRailGroupId): void
  readonly disabled?: boolean
}

/** 语音格上压的字数 —— 两个字，再多在 44px 里就挤成一团。 */
const VOICE_INITIALS = 2

function WaveformGlyph() {
  return (
    <span
      aria-hidden
      className="flex h-3 shrink-0 items-end gap-0.5 text-foreground"
    >
      <i className="block h-1.5 w-0.5 rounded-full bg-current" />
      <i className="block h-3 w-0.5 rounded-full bg-current" />
      <i className="block h-2 w-0.5 rounded-full bg-current" />
    </span>
  )
}

export function MobileRefStrip({
  items,
  onRemove,
  candidatesOf,
  onPickFromCanvas,
  onUpload,
  onLibrary,
  disabled = false,
}: MobileRefStripProps) {
  const tVideo = useTranslations('StudioNode.v4.video')
  const tRail = useTranslations('StudioNode.mobileRail')
  const longPress = useRef<number | null>(null)

  /**
   * 长按 = 移除。⚠ `pointerup` / `pointercancel` / `pointerleave` **三个都要**
   * 清计时器：只清 up 的话，手指滑出这一格再抬起，边就被静默断掉了。
   */
  const armLongPress = (edgeId: string) => {
    longPress.current = window.setTimeout(() => {
      longPress.current = null
      onRemove(edgeId)
    }, NODE_MOBILE_RAIL.longPressMs)
  }
  const disarmLongPress = () => {
    if (longPress.current !== null) window.clearTimeout(longPress.current)
    longPress.current = null
  }

  return (
    <div
      data-mobile-ref-strip
      // 条内横滑**不带动列表**：`touch-pan-x` 把纵向手势留给外层。
      className="flex touch-pan-x items-center gap-2 overflow-x-auto px-3 pb-3 pt-2.5"
    >
      {VIDEO_RAIL_GROUPS.map((group, groupIndex) => {
        const groupItems = items.filter((item) => item.group === group)
        if (groupItems.length === 0) return null
        return (
          <div key={group} className="flex shrink-0 items-center gap-2">
            {groupIndex > 0 ? (
              <span aria-hidden className="block h-7 w-px shrink-0 bg-border" />
            ) : null}
            {groupItems.map((item) => (
              <button
                key={item.edgeId}
                type="button"
                disabled={disabled}
                data-mobile-ref-item={item.group}
                data-mobile-ref-index={item.index}
                aria-label={tVideo('rail.itemLabel', {
                  group: tVideo(`rail.group.${item.group}`),
                  index: item.index,
                  name: item.sourceName,
                })}
                onPointerDown={() => armLongPress(item.edgeId)}
                onPointerUp={disarmLongPress}
                onPointerCancel={disarmLongPress}
                onPointerLeave={disarmLongPress}
                onContextMenu={(event) => event.preventDefault()}
                style={{
                  width: NODE_MOBILE_RAIL.stripThumbSize,
                  height: NODE_MOBILE_RAIL.stripThumbSize,
                }}
                className={cn(
                  'relative shrink-0 rounded-node-thumb bg-surface-fill',
                  'transition-transform duration-fast ease-standard active:scale-95',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-60',
                )}
              >
                {item.group === VIDEO_RAIL_GROUP_IDS.voice ? (
                  <span className="flex size-full flex-col items-center justify-center gap-0.5">
                    <WaveformGlyph />
                    <span className="block max-w-full truncate text-3xs leading-3 text-muted-foreground">
                      {item.sourceName.slice(0, VOICE_INITIALS)}
                    </span>
                  </span>
                ) : item.thumbnailUrl ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt=""
                    width={NODE_MOBILE_RAIL.stripThumbSize}
                    height={NODE_MOBILE_RAIL.stripThumbSize}
                    unoptimized
                    className="size-full rounded-node-thumb object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    {item.group === VIDEO_RAIL_GROUP_IDS.video ? (
                      <Film aria-hidden className="size-4" />
                    ) : (
                      <ImageIcon aria-hidden className="size-4" />
                    )}
                  </span>
                )}
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold text-primary-foreground tabular-nums"
                >
                  {item.index}
                </span>
                {item.slot === NODE_SLOT_IDS.firstFrame ||
                item.slot === NODE_SLOT_IDS.lastFrame ? (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 rounded-bl-node-thumb rounded-tr-md bg-foreground/70 px-1 text-3xs text-background"
                  >
                    {tVideo(`rail.roleBadge.${item.slot}`)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )
      })}

      {/* 末尾加号：先选组，再选来路（画布上的卡 / 相册与文件 / 素材库）。
          ⛔ 满了不藏 —— 上限由抽屉里的参考轨读数说清楚（Hard Rule 8）。 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            data-mobile-ref-add
            aria-label={tRail('addReference')}
            style={{
              width: NODE_MOBILE_RAIL.stripThumbSize,
              height: NODE_MOBILE_RAIL.stripThumbSize,
            }}
            className="flex shrink-0 items-center justify-center rounded-node-thumb border border-dashed border-border text-muted-foreground transition-colors duration-fast ease-standard active:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {VIDEO_RAIL_GROUPS.map((group, index) => (
            <div key={group}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <div className="px-2 py-1.5 text-3xs tracking-node-sec text-muted-foreground">
                {tVideo(`rail.group.${group}`)}
              </div>
              {candidatesOf(group)
                .slice(0, 5)
                .map((candidate) => (
                  <DropdownMenuItem
                    key={candidate.id}
                    data-mobile-ref-candidate={candidate.id}
                    onSelect={() => onPickFromCanvas(group, candidate.id)}
                  >
                    {candidate.name}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuItem
                data-mobile-ref-upload={group}
                onSelect={() => onUpload(group)}
              >
                {tRail('fromDevice')}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-mobile-ref-library={group}
                onSelect={() => onLibrary(group)}
              >
                {tVideo('rail.library')}
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
