'use client'

/**
 * 时间线（画板 `EditDesk.dc.html` 下半 300 高）：
 * **工具六颗 · 主轨道磁吸开关 · 标尺 · V / A / M 三轨 · 播放头**。
 *
 * ── 段是什么 ────────────────────────────────────────────────────────────
 * 一条 52 高的缩略帧条，两端各一根拉手柄（裁剪），左下角来源 chip，右上角
 * 「上游已更新」徽标。段与段之间那颗菱形是**段尾转场**——实心 = 有转场，
 * 空心 = 无。⛔ 转场不是轨道上的独立对象（数据上它是段的属性）。
 *
 * ── 交互只有四种手势 ────────────────────────────────────────────────────
 * 点段 = 选中 · 拖手柄 = 裁剪 · 拖段体 = 排序 · 点空白 / 标尺 = 移播放头。
 * 键盘（空格 / S / ⌫ / I / O / ⌘Z）不在这里，它们是整个剪辑台的事（`EditDesk`）。
 *
 * ⚠ 裁剪与排序**落地时才发 op**（`onPointerUp`），拖的过程只动本地预览：拖一次
 * 手柄发 60 条 op 会把撤销栈冲成 60 步。
 */

import { useCallback, useRef, useState } from 'react'
import {
  Music,
  Scissors,
  Shuffle,
  Trash2,
  Type,
  Mic,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  EDIT_DESK_LAYOUT,
  EDIT_DESK_NODE_DRAG_MIME,
  EDIT_TIMELINE_TICK_SECONDS,
  EDIT_TOOLS,
  EDIT_TOOL_IDS,
  EDIT_TRACKS,
  EDIT_TRACK_IDS,
  EDIT_TRANSITION_IDS,
  type EditToolId,
  type EditTrackId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  formatEditDurationShort,
  pxToSeconds,
  secondsToPx,
} from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditClip } from '@/types/node-workflow'

import { ShellIconButton } from '../workbench-v4/shell/ShellIconButton'
import type { EditDesk } from '@/hooks/node/use-edit-desk'

const TOOL_ICONS: Record<EditToolId, LucideIcon> = {
  [EDIT_TOOL_IDS.split]: Scissors,
  [EDIT_TOOL_IDS.transition]: Shuffle,
  [EDIT_TOOL_IDS.text]: Type,
  [EDIT_TOOL_IDS.voice]: Mic,
  [EDIT_TOOL_IDS.music]: Music,
  [EDIT_TOOL_IDS.remove]: Trash2,
}

export interface EditDeskTimelineProps {
  readonly desk: EditDesk
  /** 工具条上那几颗还没接来源的（文字 / 语音 / 配乐）点了说一句。 */
  onToolTodo(tool: EditToolId): void
}

export function EditDeskTimeline({ desk, onToolTodo }: EditDeskTimelineProps) {
  const t = useTranslations('StudioNode.editDesk')
  const laneRef = useRef<HTMLDivElement | null>(null)

  const tickCount =
    Math.max(1, Math.ceil(desk.durationSec / EDIT_TIMELINE_TICK_SECONDS) + 1) +
    1

  const secondsFromEvent = useCallback((clientX: number): number => {
    const rect = laneRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.max(0, pxToSeconds(clientX - rect.left))
  }, [])

  const onToolClick = (tool: EditToolId) => {
    if (tool === EDIT_TOOL_IDS.split) {
      desk.splitAtPlayhead()
      return
    }
    if (tool === EDIT_TOOL_IDS.remove) {
      desk.removeSelected()
      return
    }
    if (tool === EDIT_TOOL_IDS.transition) {
      const selected = desk.selectedClip
      if (!selected || !desk.selection) return
      // 三档循环：无 → 叠化 → 黑场 → 无。工具条那颗是**快捷**，右栏才是全貌。
      const current = selected.transitionOut ?? EDIT_TRANSITION_IDS.none
      const next =
        current === EDIT_TRANSITION_IDS.none
          ? EDIT_TRANSITION_IDS.crossfade
          : current === EDIT_TRANSITION_IDS.crossfade
            ? EDIT_TRANSITION_IDS.black
            : EDIT_TRANSITION_IDS.none
      desk.updateClip(desk.selection.track, selected.id, {
        transitionOut: next,
      })
      return
    }
    onToolTodo(tool)
  }

  return (
    <div
      data-testid="edit-desk-timeline"
      style={{ height: EDIT_DESK_LAYOUT.timelineHeightPx }}
      className="flex shrink-0 flex-col border-t border-border bg-card"
    >
      {/* 工具条 + 磁吸开关 */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="inline-flex gap-0.5">
          {EDIT_TOOLS.map((tool) => (
            <ShellIconButton
              key={tool}
              icon={TOOL_ICONS[tool]}
              label={t(`tools.${tool}`)}
              testId={`edit-desk-tool-${tool}`}
              onClick={() => onToolClick(tool)}
            />
          ))}
        </div>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t('magnetic')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={desk.project.settings.magnetic}
            data-testid="edit-desk-magnetic"
            onClick={() =>
              desk.setSettings({ magnetic: !desk.project.settings.magnetic })
            }
            className={cn(
              'relative h-5 w-[30px] rounded-full transition-colors duration-fast motion-reduce:transition-none',
              desk.project.settings.magnetic
                ? 'bg-primary'
                : 'bg-surface-fill-track',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-4 rounded-full bg-background transition-[left] duration-fast motion-reduce:transition-none',
                desk.project.settings.magnetic ? 'left-[12px]' : 'left-0.5',
              )}
            />
          </button>
        </label>
      </div>

      {/* 标尺 + 三轨 + 播放头 */}
      <div className="relative flex-1 overflow-x-auto overflow-y-hidden px-3 pb-2 pt-5">
        <div
          className="relative min-w-full"
          style={{
            width:
              secondsToPx(tickCount * EDIT_TIMELINE_TICK_SECONDS) +
              EDIT_DESK_LAYOUT.trackLabelWidthPx,
          }}
        >
          <div
            className="flex"
            style={{ marginLeft: EDIT_DESK_LAYOUT.trackLabelWidthPx + 8 }}
          >
            {Array.from({ length: tickCount }).map((_, index) => (
              <div
                key={index}
                className="relative h-2 border-l border-border"
                style={{
                  width: secondsToPx(EDIT_TIMELINE_TICK_SECONDS),
                  flex: '0 0 auto',
                }}
              >
                <span className="absolute -top-4 left-1 text-3xs text-muted-foreground">
                  {index === 0
                    ? '0'
                    : formatEditDurationShort(
                        index * EDIT_TIMELINE_TICK_SECONDS,
                      )}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {EDIT_TRACKS.map((track) => (
              <TrackLane
                key={track}
                track={track}
                rows={desk.rows[track]}
                desk={desk}
                laneRef={track === EDIT_TRACK_IDS.video ? laneRef : undefined}
                secondsFromEvent={secondsFromEvent}
              />
            ))}
          </div>

          {/* 播放头 —— 三轨共用一条，⛔ 每轨一条会在缩放时对不齐 */}
          <div
            data-testid="edit-desk-playhead"
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-0 z-10 bg-primary"
            style={{
              width: EDIT_DESK_LAYOUT.playheadWidthPx,
              left:
                EDIT_DESK_LAYOUT.trackLabelWidthPx +
                8 +
                secondsToPx(desk.playheadSec),
            }}
          />
        </div>
      </div>
    </div>
  )
}

function TrackLane({
  track,
  rows,
  desk,
  laneRef,
  secondsFromEvent,
}: {
  readonly track: EditTrackId
  readonly rows: readonly EditTimelineRow[]
  readonly desk: EditDesk
  readonly laneRef?: React.RefObject<HTMLDivElement | null>
  secondsFromEvent(clientX: number): number
}) {
  const t = useTranslations('StudioNode.editDesk')
  const [dropping, setDropping] = useState(false)
  const isVideo = track === EDIT_TRACK_IDS.video

  return (
    <div className="flex items-center gap-2">
      <span
        className="shrink-0 text-right text-3xs uppercase text-muted-foreground"
        style={{ width: EDIT_DESK_LAYOUT.trackLabelWidthPx }}
      >
        {t(`tracks.${track}`)}
      </span>
      <div
        ref={laneRef}
        data-testid={`edit-desk-track-${track}`}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(EDIT_DESK_NODE_DRAG_MIME)) {
            return
          }
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          setDropping(false)
          const nodeId =
            event.dataTransfer.getData(EDIT_DESK_NODE_DRAG_MIME) ||
            event.dataTransfer.getData('text/plain')
          if (!nodeId) return
          event.preventDefault()
          desk.dropNode(
            nodeId,
            track,
            desk.insertIndexAt(track, secondsFromEvent(event.clientX)),
          )
        }}
        onPointerDown={(event) => {
          // 空白处按下 = 移播放头（点段的那一路 stopPropagation 了）。
          desk.setPlayhead(secondsFromEvent(event.clientX))
        }}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1 rounded-md',
          dropping && 'bg-muted',
        )}
        style={{
          minHeight: isVideo
            ? EDIT_DESK_LAYOUT.clipHeightPx
            : EDIT_DESK_LAYOUT.waveHeightPx,
        }}
      >
        {rows.length === 0 ? (
          <span className="px-2 text-3xs text-muted-foreground">
            {t('tracks.empty')}
          </span>
        ) : null}
        {rows.map((row, index) => (
          <ClipView
            key={row.clip.id}
            row={row}
            track={track}
            desk={desk}
            isVideo={isVideo}
            showTransitionAfter={isVideo && index < rows.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

function ClipView({
  row,
  track,
  desk,
  isVideo,
  showTransitionAfter,
}: {
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  readonly desk: EditDesk
  readonly isVideo: boolean
  readonly showTransitionAfter: boolean
}) {
  const t = useTranslations('StudioNode.editDesk')
  const clip = row.clip
  const selected = desk.selection?.clipId === clip.id
  /** 拖手柄时的本地预览（⛔ 不落 op，见文件头）。 */
  const [preview, setPreview] = useState<{ in: number; out: number } | null>(
    null,
  )
  const shown = preview ?? { in: clip.in, out: clip.out }
  const widthPx = Math.max(
    secondsToPx((shown.out - shown.in) / (clip.speed || 1)),
    EDIT_DESK_LAYOUT.handleWidthPx * 3,
  )

  const sourceName = readSourceName(row)

  const startTrim =
    (edge: 'in' | 'out') => (event: React.PointerEvent<HTMLElement>) => {
      event.stopPropagation()
      event.preventDefault()
      const originX = event.clientX
      const origin = { in: clip.in, out: clip.out }
      const target: HTMLElement = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const move = (moveEvent: PointerEvent) => {
        const delta =
          pxToSeconds(moveEvent.clientX - originX) * (clip.speed || 1)
        setPreview(
          edge === 'in'
            ? { in: Math.max(0, origin.in + delta), out: origin.out }
            : { in: origin.in, out: Math.max(0, origin.out + delta) },
        )
      }
      const up = (upEvent: PointerEvent) => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        const delta = pxToSeconds(upEvent.clientX - originX) * (clip.speed || 1)
        setPreview(null)
        desk.updateClip(
          track,
          clip.id,
          edge === 'in'
            ? { in: Math.max(0, origin.in + delta) }
            : { out: Math.max(0, origin.out + delta) },
        )
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        data-testid={`edit-desk-clip-${clip.id}`}
        data-clip-index={row.index}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CLIP_DRAG_MIME, clip.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(CLIP_DRAG_MIME)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => {
          const draggedId = event.dataTransfer.getData(CLIP_DRAG_MIME)
          if (!draggedId || draggedId === clip.id) return
          event.preventDefault()
          event.stopPropagation()
          desk.moveClip(track, draggedId, row.index)
        }}
        onPointerDown={(event) => {
          event.stopPropagation()
          desk.select({ track, clipId: clip.id })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') desk.select({ track, clipId: clip.id })
        }}
        style={{
          width: widthPx,
          height: isVideo
            ? EDIT_DESK_LAYOUT.clipHeightPx
            : EDIT_DESK_LAYOUT.waveHeightPx,
        }}
        className={cn(
          'relative shrink-0 overflow-hidden rounded-md',
          isVideo ? 'bg-surface-fill-track' : 'bg-surface-fill',
          selected && 'outline outline-[1.5px] outline-primary',
        )}
      >
        {selected && isVideo ? (
          <>
            <span
              data-testid={`edit-desk-handle-in-${clip.id}`}
              role="slider"
              aria-label={t('inspector.inPoint')}
              aria-valuenow={Math.round(shown.in * 10) / 10}
              tabIndex={0}
              onPointerDown={startTrim('in')}
              style={{ width: EDIT_DESK_LAYOUT.handleWidthPx }}
              className="absolute bottom-0 left-0 top-0 cursor-ew-resize rounded-l-md bg-primary"
            />
            <span
              data-testid={`edit-desk-handle-out-${clip.id}`}
              role="slider"
              aria-label={t('inspector.outPoint')}
              aria-valuenow={Math.round(shown.out * 10) / 10}
              tabIndex={0}
              onPointerDown={startTrim('out')}
              style={{ width: EDIT_DESK_LAYOUT.handleWidthPx }}
              className="absolute bottom-0 right-0 top-0 cursor-ew-resize rounded-r-md bg-primary"
            />
          </>
        ) : null}

        {row.source.stale ? (
          <button
            type="button"
            data-testid={`edit-desk-stale-${clip.id}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              desk.refreshClipSource(track, clip.id)
            }}
            className="absolute right-1.5 top-1 rounded-full bg-status-warning px-1.5 text-3xs leading-[13px] text-white"
          >
            {t('staleBadge')}
          </button>
        ) : null}

        {isVideo ? (
          <span className="canvas-glass absolute bottom-1 left-1.5 inline-flex max-w-[calc(100%-12px)] items-center gap-1 truncate rounded-full py-px pl-1 pr-1.5 text-3xs leading-[13px]">
            <span className="size-3 shrink-0 rounded-[3px] bg-foreground/15" />
            <span className="truncate">
              {t('clipTag', {
                name: sourceName,
                duration: formatEditDurationShort(row.durationSec),
              })}
            </span>
          </span>
        ) : (
          <span className="absolute inset-y-0 left-2 flex items-center truncate text-3xs text-muted-foreground">
            {sourceName}
          </span>
        )}
      </div>

      {showTransitionAfter ? (
        <span
          aria-hidden
          data-testid={`edit-desk-transition-${clip.id}`}
          style={{
            width: EDIT_DESK_LAYOUT.transitionMarkPx,
            height: EDIT_DESK_LAYOUT.transitionMarkPx,
          }}
          className={cn(
            '-mx-0.5 shrink-0 rotate-45 rounded-[2px]',
            (clip.transitionOut ?? EDIT_TRANSITION_IDS.none) ===
              EDIT_TRANSITION_IDS.none
              ? 'border-[1.5px] border-foreground'
              : 'bg-foreground',
          )}
        />
      ) : null}
    </>
  )
}

/** 段之间拖排序的载荷。⚠ 与素材拖投分开：一个是「加一段」，一个是「换个位置」。 */
const CLIP_DRAG_MIME = 'application/x-pixelvault-edit-clip'

function readSourceName(row: EditTimelineRow): string {
  const data = row.source.node?.data
  if (!data) return row.clip.sourceNodeId
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return data.label ?? data.name
  return data.name
}

export type { EditClip }
