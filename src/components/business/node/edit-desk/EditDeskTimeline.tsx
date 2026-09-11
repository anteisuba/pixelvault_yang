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

import { useCallback, useRef, useState, type ReactNode } from 'react'
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
  EDIT_DESK_CLIP_FRAME_MAX,
  EDIT_DESK_LAYOUT,
  EDIT_DESK_LIBRARY_DRAG_MIME,
  EDIT_DESK_NODE_DRAG_MIME,
  EDIT_DESK_TRANSITION_DRAG_MIME,
  EDIT_TEXT_CLIP_HEIGHT_PX,
  EDIT_TEXT_CLIP_MIN_DURATION_SEC,
  EDIT_TEXT_LANE_HEIGHT_PX,
  EDIT_TIMELINE_TICK_SECONDS,
  EDIT_TOOLS,
  EDIT_TOOL_IDS,
  EDIT_TRACKS,
  EDIT_TRACK_IDS,
  EDIT_TRANSITIONS,
  EDIT_TRANSITION_IDS,
  TIMELINE_PLAN_CARD,
  TIMELINE_PLAN_GHOST_BORDER_PX,
  type EditToolId,
  type EditTrackId,
  type EditTransitionId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  currentUrlOf,
  formatEditDurationShort,
  pxToSeconds,
  secondsToPx,
} from '@/lib/edit-project'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditClip, EditTextClip } from '@/types/node-workflow'

import { AudioWaveform } from '../nodes/v4/audio/AudioWaveform'
import {
  parseEditDeskLibraryAsset,
  type EditDeskLibraryAsset,
} from './EditDeskAssetRail'
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
  /**
   * 时间线自己答不了的那几颗工具（文字 / 语音 / 配乐）交回台面。
   *
   * ⚠ 分割 / 转场 / 删除**就在这里做完**：它们只动时间线；语音 / 配乐要切左栏
   * 的页并高亮一条轨，那是台面的事（左栏与轨道高亮都住在它那儿）。
   */
  onTool(tool: EditToolId): void
  /**
   * 素材库那一格落进轨 —— **先建卡再进轨**（`EDIT_DESK_LIBRARY_DRAG_MIME` 头注）。
   * 所以它不在 `desk` 上：建卡是图的动作，时间线自己碰不到。
   */
  onDropLibraryAsset(
    asset: EditDeskLibraryAsset,
    track: EditTrackId,
    index: number,
  ): void
  /** 高亮哪条轨（工具条「语音」/「配乐」按下之后）。`null` = 不高亮。 */
  readonly highlightTrack?: EditTrackId | null
  /**
   * 「一句话排片」栏 —— **收在时间线块内的最底下**（S9 修 S8 遗留）。
   *
   * ⚠ 它必须住在这个块里而不是块外：排片改的就是时间线，把它摆成块外的一条会
   * 让人以为那是整个剪辑台的输入框（S8 那一版用负 margin 往上蹭，在 1440 以下
   * 直接压住 M 轨）。
   */
  readonly footer?: ReactNode
  /**
   * 浮在时间线块右上角的东西 —— 眼下只有排片提案卡（S10）。
   *
   * ⚠ 它必须浮在**这个块**里（画板 `right:16 / top:12` 就是相对它量的）：摆到块外
   * 就与轨道脱开，用户读不出「这张卡说的是下面这几段」。
   */
  readonly overlay?: ReactNode
  /**
   * **只看不剪**（手机档，node-canvas-v2 §7.x）：工具条与磁吸开关整条不渲染。
   * ⛔ 不是置灰 —— 手机上剪辑本来就做不了，一排灰键只会让人反复去点。
   */
  readonly readOnly?: boolean
}

export function EditDeskTimeline({
  desk,
  onTool,
  onDropLibraryAsset,
  highlightTrack,
  footer,
  overlay,
  readOnly = false,
}: EditDeskTimelineProps) {
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
    onTool(tool)
  }

  return (
    <div
      data-testid="edit-desk-timeline"
      style={{ height: EDIT_DESK_LAYOUT.timelineHeightPx }}
      className="relative flex shrink-0 flex-col border-t border-border bg-card"
    >
      {/* 工具条 + 磁吸开关（只看不剪时整条不出） */}
      {readOnly ? null : (
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
      )}

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
            {/*
              T 轨在 V 之上（spec §6「文字段」）。⚠ 它**不参与磁吸主轨**，所以段是
              绝对定位（left = 起点秒）而不是首尾相接的一排 —— 字幕钉在画面的某一刻，
              画面换了序它不该跟着挪。
            */}
            <TextLane desk={desk} secondsFromEvent={secondsFromEvent} />
            {EDIT_TRACKS.map((track) => (
              <TrackLane
                key={track}
                track={track}
                rows={desk.rows[track]}
                ghostRows={desk.proposalRows?.[track] ?? null}
                desk={desk}
                laneRef={track === EDIT_TRACK_IDS.video ? laneRef : undefined}
                secondsFromEvent={secondsFromEvent}
                onDropLibraryAsset={onDropLibraryAsset}
                highlighted={highlightTrack === track}
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

      {footer ? (
        <div data-testid="edit-desk-timeline-footer" className="px-3 pb-2">
          {footer}
        </div>
      ) : null}

      {overlay ? (
        <div
          className="absolute z-20"
          style={{
            right: TIMELINE_PLAN_CARD.rightPx,
            top: TIMELINE_PLAN_CARD.topPx,
          }}
        >
          {overlay}
        </div>
      ) : null}
    </div>
  )
}

/** T 轨（S8d · 画板 `EditDeskText.dc.html` 的 `.lane` + `.tclip`）。 */
function TextLane({
  desk,
  secondsFromEvent,
}: {
  readonly desk: EditDesk
  secondsFromEvent(clientX: number): number
}) {
  const t = useTranslations('StudioNode.editDesk')

  return (
    <div
      className="flex items-center gap-2"
      style={{ height: EDIT_TEXT_LANE_HEIGHT_PX }}
    >
      <span
        className="shrink-0 text-right text-3xs uppercase text-muted-foreground"
        style={{ width: EDIT_DESK_LAYOUT.trackLabelWidthPx }}
      >
        {t('tracks.text')}
      </span>
      <div
        data-testid="edit-desk-track-text"
        onPointerDown={(event) =>
          desk.setPlayhead(secondsFromEvent(event.clientX))
        }
        className="relative min-w-0 flex-1"
        style={{ height: EDIT_TEXT_CLIP_HEIGHT_PX }}
      >
        {desk.project.tracks.text.length === 0 ? (
          <span className="absolute inset-y-0 left-2 flex items-center text-3xs text-muted-foreground">
            {t('tracks.textEmpty')}
          </span>
        ) : null}
        {desk.project.tracks.text.map((clip) => (
          <TextClipView
            key={clip.id}
            clip={clip}
            desk={desk}
            secondsFromEvent={secondsFromEvent}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 一段字幕。四种手势与 V 段同源：点 = 选中 · 拖体 = 挪位置 · 拖两端 = 改入出点 ·
 * ⌫ / S 在台面上（键盘不归时间线管）。
 *
 * ⚠ 与 V 段一样**落地时才发 op**（`pointerup`）：拖的过程只动本地预览，⛔ 不把
 * 撤销栈冲成 60 步。
 */
function TextClipView({
  clip,
  desk,
  secondsFromEvent,
}: {
  readonly clip: EditTextClip
  readonly desk: EditDesk
  secondsFromEvent(clientX: number): number
}) {
  const selected = desk.textSelectionId === clip.id
  const [preview, setPreview] = useState<{
    startSec: number
    durationSec: number
  } | null>(null)
  const shown = preview ?? {
    startSec: clip.startSec,
    durationSec: clip.durationSec,
  }

  const startDrag =
    (mode: 'move' | 'in' | 'out') =>
    (event: React.PointerEvent<HTMLElement>) => {
      event.stopPropagation()
      event.preventDefault()
      desk.selectText(clip.id)
      const originSec = secondsFromEvent(event.clientX)
      const origin = {
        startSec: clip.startSec,
        durationSec: clip.durationSec,
      }
      const target: HTMLElement = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const nextOf = (
        clientX: number,
      ): { startSec: number; durationSec: number } => {
        const delta = secondsFromEvent(clientX) - originSec
        if (mode === 'move') {
          return {
            startSec: Math.max(0, origin.startSec + delta),
            durationSec: origin.durationSec,
          }
        }
        if (mode === 'in') {
          // 拖左端 = 起点动、尾巴不动（所以长度反向变）。
          const startSec = Math.max(
            0,
            Math.min(
              origin.startSec + delta,
              origin.startSec +
                origin.durationSec -
                EDIT_TEXT_CLIP_MIN_DURATION_SEC,
            ),
          )
          return {
            startSec,
            durationSec: origin.startSec + origin.durationSec - startSec,
          }
        }
        return {
          startSec: origin.startSec,
          durationSec: Math.max(
            EDIT_TEXT_CLIP_MIN_DURATION_SEC,
            origin.durationSec + delta,
          ),
        }
      }

      const move = (moveEvent: PointerEvent) => {
        setPreview(nextOf(moveEvent.clientX))
      }
      const up = (upEvent: PointerEvent) => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        const next = nextOf(upEvent.clientX)
        setPreview(null)
        desk.updateTextClip(clip.id, next)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    }

  const firstLine = clip.text.split('\n')[0] ?? ''

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-testid={`edit-desk-text-clip-${clip.id}`}
      onPointerDown={startDrag('move')}
      onKeyDown={(event) => {
        if (event.key === 'Enter') desk.selectText(clip.id)
      }}
      style={{
        left: secondsToPx(shown.startSec),
        width: Math.max(
          secondsToPx(shown.durationSec),
          EDIT_DESK_LAYOUT.handleWidthPx * 4,
        ),
        height: EDIT_TEXT_CLIP_HEIGHT_PX,
      }}
      className={cn(
        'absolute top-0 flex items-center gap-1.5 overflow-hidden rounded-lg border-[1.5px] border-foreground bg-card px-2.5 text-2xs text-foreground',
        selected && 'outline outline-[1.5px] outline-primary',
      )}
    >
      <span className="shrink-0 font-semibold">T</span>
      <span className="truncate">{firstLine}</span>
      {selected ? (
        <>
          <span
            data-testid={`edit-desk-text-handle-in-${clip.id}`}
            onPointerDown={startDrag('in')}
            style={{ width: EDIT_DESK_LAYOUT.handleWidthPx }}
            className="absolute bottom-0 left-0 top-0 cursor-ew-resize bg-primary"
          />
          <span
            data-testid={`edit-desk-text-handle-out-${clip.id}`}
            onPointerDown={startDrag('out')}
            style={{ width: EDIT_DESK_LAYOUT.handleWidthPx }}
            className="absolute bottom-0 right-0 top-0 cursor-ew-resize bg-primary"
          />
        </>
      ) : null}
    </div>
  )
}

function TrackLane({
  track,
  rows,
  ghostRows,
  desk,
  laneRef,
  secondsFromEvent,
  onDropLibraryAsset,
  highlighted,
}: {
  readonly track: EditTrackId
  readonly rows: readonly EditTimelineRow[]
  /** 提案的幽灵段（S10）。`null` = 没有提案。 */
  readonly ghostRows: readonly EditTimelineRow[] | null
  readonly desk: EditDesk
  readonly laneRef?: React.RefObject<HTMLDivElement | null>
  secondsFromEvent(clientX: number): number
  onDropLibraryAsset(
    asset: EditDeskLibraryAsset,
    track: EditTrackId,
    index: number,
  ): void
  readonly highlighted: boolean
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
          const types = event.dataTransfer.types
          if (
            !types.includes(EDIT_DESK_NODE_DRAG_MIME) &&
            !types.includes(EDIT_DESK_LIBRARY_DRAG_MIME)
          ) {
            return
          }
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          setDropping(false)
          const index = desk.insertIndexAt(
            track,
            secondsFromEvent(event.clientX),
          )
          // 素材库那一条**还没有卡**：交回台面先建卡（⛔ 段不指向素材库记录）。
          const asset = parseEditDeskLibraryAsset(
            event.dataTransfer.getData(EDIT_DESK_LIBRARY_DRAG_MIME),
          )
          if (asset) {
            event.preventDefault()
            onDropLibraryAsset(asset, track, index)
            return
          }
          const nodeId =
            event.dataTransfer.getData(EDIT_DESK_NODE_DRAG_MIME) ||
            event.dataTransfer.getData('text/plain')
          if (!nodeId) return
          event.preventDefault()
          desk.dropNode(nodeId, track, index)
        }}
        onPointerDown={(event) => {
          // 空白处按下 = 移播放头（点段的那一路 stopPropagation 了）。
          desk.setPlayhead(secondsFromEvent(event.clientX))
        }}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1 rounded-md',
          dropping && 'bg-muted',
          // 「语音」/「配乐」按下之后这条轨点亮 —— 用户接着要往它上面拖东西。
          highlighted && 'outline outline-[1.5px] outline-primary',
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
            dimmed={Boolean(ghostRows)}
            showTransitionAfter={isVideo && index < rows.length - 1}
          />
        ))}
        {/*
          幽灵段（S10 · 画板 `.clip.ghost`）：虚线 + 斜纹，摆在现有段之后。
          ⚠ 它们**不可点、不可拖**：还没采用的东西不该能被裁 —— 一旦能改，
          「采用 / 撤销」这对按钮就说不清自己在采用什么。
        */}
        {(ghostRows ?? []).map((row, index) => (
          <GhostClipView
            key={`ghost-${row.clip.id}`}
            row={row}
            isVideo={isVideo}
            focused={isVideo && desk.proposalClipIndex === index}
            showTransitionAfter={
              isVideo && index < (ghostRows?.length ?? 0) - 1
            }
          />
        ))}
      </div>
    </div>
  )
}

/** 提案里的一段。⛔ 无手柄、无来源徽标、无事件 —— 它还不存在。 */
function GhostClipView({
  row,
  isVideo,
  focused,
  showTransitionAfter,
}: {
  readonly row: EditTimelineRow
  readonly isVideo: boolean
  readonly focused: boolean
  readonly showTransitionAfter: boolean
}) {
  const t = useTranslations('StudioNode.editDesk')
  const clip = row.clip
  const widthPx = Math.max(
    secondsToPx(row.durationSec),
    EDIT_DESK_LAYOUT.handleWidthPx * 3,
  )
  const sourceName = readSourceName(row)

  return (
    <>
      <div
        aria-hidden
        data-testid={`edit-desk-ghost-${clip.id}`}
        style={{
          width: widthPx,
          height: isVideo
            ? EDIT_DESK_LAYOUT.clipHeightPx
            : EDIT_DESK_LAYOUT.waveHeightPx,
          borderWidth: TIMELINE_PLAN_GHOST_BORDER_PX,
        }}
        className={cn(
          'canvas-ghost-clip relative shrink-0 overflow-hidden rounded-md border-dashed border-foreground',
          focused && 'outline outline-[1.5px] outline-primary',
        )}
      >
        <span className="canvas-glass absolute bottom-1 left-1.5 inline-flex max-w-[calc(100%-12px)] items-center gap-1 truncate rounded-full py-px pl-1 pr-1.5 text-3xs leading-[13px]">
          <span className="truncate">
            {t('clipTag', {
              name: sourceName,
              duration: formatEditDurationShort(row.durationSec),
            })}
          </span>
        </span>
      </div>
      {showTransitionAfter ? (
        <span
          aria-hidden
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

function ClipView({
  row,
  track,
  desk,
  isVideo,
  dimmed,
  showTransitionAfter,
}: {
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  readonly desk: EditDesk
  readonly isVideo: boolean
  /** 提案期间现有段变灰（画板：幽灵段是主角，现有段退到背景）。 */
  readonly dimmed: boolean
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
          dimmed && 'opacity-40',
        )}
      >
        <ClipCanvas row={row} isVideo={isVideo} widthPx={widthPx} />

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
        <TransitionMark
          clip={clip}
          onSet={(transition) =>
            desk.updateClip(track, clip.id, { transitionOut: transition })
          }
        />
      ) : null}
    </>
  )
}

/**
 * 两段之间那颗菱形 —— 既是**读数**（实心 = 有转场）也是**落点**：从左栏转场页拖
 * 一个预设过来落在这里 = 设**前一段**的 `transitionOut`。
 *
 * ⚠ 命中区靠一层 `-inset-2` 的透明覆盖放大，⛔ 不把菱形本身画大：12px 是画板量
 * 的数，改它两段之间的缝就跟着变宽。
 */
function TransitionMark({
  clip,
  onSet,
}: {
  readonly clip: EditClip
  onSet(transition: EditTransitionId): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  const [over, setOver] = useState(false)
  const current = clip.transitionOut ?? EDIT_TRANSITION_IDS.none

  return (
    <span
      data-testid={`edit-desk-transition-${clip.id}`}
      data-transition={current}
      aria-label={t('inspector.transition')}
      onDragOver={(event) => {
        if (
          !event.dataTransfer.types.includes(EDIT_DESK_TRANSITION_DRAG_MIME)
        ) {
          return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        const raw = event.dataTransfer.getData(EDIT_DESK_TRANSITION_DRAG_MIME)
        const transition = EDIT_TRANSITIONS.find(
          (candidate) => candidate === raw,
        )
        if (!transition) return
        event.preventDefault()
        event.stopPropagation()
        onSet(transition)
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        width: EDIT_DESK_LAYOUT.transitionMarkPx,
        height: EDIT_DESK_LAYOUT.transitionMarkPx,
      }}
      className={cn(
        'relative -mx-0.5 shrink-0 rotate-45 rounded-[2px]',
        'after:absolute after:-inset-2 after:content-[""]',
        current === EDIT_TRANSITION_IDS.none
          ? 'border-[1.5px] border-foreground'
          : 'bg-foreground',
        over && 'outline outline-[1.5px] outline-offset-2 outline-primary',
      )}
    />
  )
}

/**
 * 段里的**内容**（画板 `.clip` 里那排 `.fr` / A 轨的 `.wave`）。
 *
 * 视频段 = 一排等宽缩略帧：**同一张封面帧铺满**，条与条之间一根白缝 —— 这就是
 * 剪辑软件里「一段胶片」的读法。⛔ 不逐条抽真帧：那要 N 次 seek，拖手柄时页面
 * 直接停住，而「这是哪一镜」一张封面已经答完了（`EDIT_DESK_CLIP_FRAME_MAX` 头注）。
 * 音频段 = 一条波形（复用音频卡那一只）。
 */
function ClipCanvas({
  row,
  isVideo,
  widthPx,
}: {
  readonly row: EditTimelineRow
  readonly isVideo: boolean
  readonly widthPx: number
}) {
  const node = row.source.node
  const data = node?.data
  const url = node ? currentUrlOf(node) : undefined
  const poster = useVideoPoster(
    isVideo ? url : undefined,
    data && data.kind === NODE_MEDIA_KIND_IDS.video
      ? data.videoThumbnailUrl
      : undefined,
  )

  if (!isVideo) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center px-2"
      >
        <AudioWaveform
          seed={url ?? row.clip.sourceNodeId}
          barCount={Math.max(
            4,
            Math.floor(widthPx / EDIT_DESK_LAYOUT.waveBarPitchPx),
          )}
          height={EDIT_DESK_LAYOUT.waveHeightPx - 8}
          className="w-full"
        />
      </div>
    )
  }

  if (!poster) return null

  const frameWidthPx = Math.round((EDIT_DESK_LAYOUT.clipHeightPx * 16) / 9)
  const count = Math.min(
    EDIT_DESK_CLIP_FRAME_MAX,
    Math.max(1, Math.round(widthPx / frameWidthPx)),
  )

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className="min-w-0 flex-1 border-r border-background/35 bg-cover bg-center last:border-r-0"
          style={{ backgroundImage: `url(${poster})` }}
        />
      ))}
    </div>
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
