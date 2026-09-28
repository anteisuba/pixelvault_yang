'use client'

/**
 * 时间线卡（画板「剪辑台 A · 全部状态」：舞台下面第二张白卡，占工作台「输入框」的位置）：
 * **工具 · 选中段的属性 · 缩放 · 主轨道磁吸**一行，下面 **轨道名一列 + T / V / A / M
 * 四道轨槽 + 标尺 + 播放头**。
 *
 * ── 段是什么 ────────────────────────────────────────────────────────────
 * 画面段 = 胶片条式封面 + 镜头名 + 右上时长；配音 / 配乐段 = 浅底胶囊 + 淡色波形 +
 * 名字（配乐多一条音量线）；字幕段 = 白底 + 黑色「T」角标。选中 = 黑环 + 一圈浅晕，
 * 两端出现黑色手柄（裁剪）。段与段之间那颗菱形是**段尾转场**——实心 = 有转场，
 * 空心 = 无。⛔ 转场不是轨道上的独立对象（数据上它是段的属性）。
 *
 * ── 交互只有四种手势 ────────────────────────────────────────────────────
 * 点段 = 选中 · 拖手柄 = 裁剪（上方实时读数）· 拖段体 = 排序 · 点空白 / 标尺 = 移
 * 播放头。键盘（空格 / S / ⌫ / I / O / ⌘Z）不在这里，它们是整个剪辑台的事（`EditDesk`）。
 * 缩放：工具行右端「− 滑杆 + · 铺满」，或 ⌘ / Ctrl + 滚轮（触控板捏合同一条事件），
 * 以播放头为中心；轨道名那一列不动。
 *
 * ⚠ 裁剪与排序**落地时才发 op**（`onPointerUp`），拖的过程只动本地预览：拖一次
 * 手柄发 60 条 op 会把撤销栈冲成 60 步。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Film,
  Mic,
  Music,
  Scissors,
  Shuffle,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from '@/components/icons'
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
  EDIT_TIMELINE_FIT,
  EDIT_TIMELINE_PX_PER_SECOND,
  EDIT_TIMELINE_TICK_MIN_PX,
  EDIT_TIMELINE_TICK_STEPS,
  EDIT_TIMELINE_ZOOM,
  EDIT_TOOLS,
  EDIT_TOOL_IDS,
  EDIT_TRACKS,
  EDIT_TRACK_IDS,
  EDIT_TRANSITIONS,
  EDIT_TRANSITION_IDS,
  type EditToolId,
  type EditTrackId,
  type EditTransitionId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { currentUrlOf, formatEditClock } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditClip, EditTextClip } from '@/types/node-workflow'

import { useVideoPoster } from '@/hooks/node/use-video-poster'
import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { Slider } from '@/components/ui/slider'
import {
  studioOutlineChipClass,
  studioOutlineChipSetClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

import { AudioWaveform } from '../nodes/v4/audio/AudioWaveform'
import { ShellIconButton } from '../workbench-v4/shell/ShellIconButton'
import {
  parseEditDeskLibraryAsset,
  type EditDeskLibraryAsset,
} from './EditDeskAssetRail'
import { EDIT_CLIP_FLASH_ATTRIBUTE } from './edit-desk-flash'

const TOOL_ICONS: Record<EditToolId, LucideIcon> = {
  [EDIT_TOOL_IDS.split]: Scissors,
  [EDIT_TOOL_IDS.transition]: Shuffle,
  [EDIT_TOOL_IDS.text]: Type,
  [EDIT_TOOL_IDS.voice]: Mic,
  [EDIT_TOOL_IDS.music]: Music,
  [EDIT_TOOL_IDS.remove]: Trash2,
}

const TRACK_ICONS: Record<EditTrackId, LucideIcon> = {
  [EDIT_TRACK_IDS.video]: Film,
  [EDIT_TRACK_IDS.audio]: Mic,
  [EDIT_TRACK_IDS.music]: Music,
}

/** 画面轨 / 声音轨的轨高 = 段高 + 上下各让一格。 */
const VIDEO_LANE_HEIGHT_PX =
  EDIT_DESK_LAYOUT.clipHeightPx + EDIT_DESK_LAYOUT.laneInsetPx * 2
const SOUND_LANE_HEIGHT_PX =
  EDIT_DESK_LAYOUT.waveHeightPx + EDIT_DESK_LAYOUT.laneInsetPx * 2

function laneHeightOf(track: EditTrackId): number {
  return track === EDIT_TRACK_IDS.video
    ? VIDEO_LANE_HEIGHT_PX
    : SOUND_LANE_HEIGHT_PX
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
   * **只看不剪**（手机档，node-canvas-v2 §7.x）：工具行整条不渲染。
   * ⛔ 不是置灰 —— 手机上剪辑本来就做不了，一排灰键只会让人反复去点。
   */
  readonly readOnly?: boolean
  /**
   * 选中段的属性行（工具行中间那一格，⛔ 不再有右侧属性栏）。由台面给 ——
   * 「回节点」「到预览里改字」都要碰台面的状态。
   */
  readonly props?: ReactNode
  /** 开始拖播放头（标尺 / 播放头上的时间读数 / 轨槽空白处）—— 台面借它停播。 */
  onScrubStart?(): void
}

/**
 * 时间线的缩放：每秒多少像素。
 *
 * ⚠ 由 `EditDeskTimeline` 按时间线区的宽度 × 缩放倍数现算、经 context 往下给：段宽、
 *   裁剪手势、标尺、播放头读的是**同一个**数，⛔ 各算各的会在缩放时对不齐。
 * 量不到宽度时（首帧 / 测试环境）用 `EDIT_TIMELINE_PX_PER_SECOND` 兜底。
 */
interface TimelineScale {
  readonly pxPerSecond: number
  toPx(seconds: number): number
  toSeconds(px: number): number
}

function makeTimelineScale(pxPerSecond: number): TimelineScale {
  return {
    pxPerSecond,
    toPx: (seconds) => seconds * pxPerSecond,
    toSeconds: (px) => px / pxPerSecond,
  }
}

const TimelineScaleContext = createContext<TimelineScale>(
  makeTimelineScale(EDIT_TIMELINE_PX_PER_SECOND),
)

function useTimelineScale(): TimelineScale {
  return useContext(TimelineScaleContext)
}

/** 时间线最右一刻：四条轨里最晚结束的那一段（字幕段有自己的绝对起点）。 */
function timelineEndSec(desk: EditDesk): number {
  let end = desk.durationSec
  for (const track of EDIT_TRACKS) {
    for (const row of desk.rows[track]) {
      end = Math.max(end, row.startSec + row.durationSec)
    }
  }
  for (const clip of desk.project.tracks.text) {
    end = Math.max(end, clip.startSec + clip.durationSec)
  }
  return end
}

function clampZoom(zoom: number): number {
  return Math.min(
    EDIT_TIMELINE_ZOOM.max,
    Math.max(EDIT_TIMELINE_ZOOM.min, zoom),
  )
}

export function EditDeskTimeline({
  desk,
  onTool,
  onDropLibraryAsset,
  highlightTrack,
  readOnly = false,
  props,
  onScrubStart,
}: EditDeskTimelineProps) {
  const t = useTranslations('StudioNode.editDesk')
  /** 轨道画布（随缩放变宽的那一层）—— 秒 ↔ 像素的原点。 */
  const canvasRef = useRef<HTMLDivElement | null>(null)

  /** 可横向滚的那一块的内宽 —— 「铺满」按它算。0 = 还没量到。 */
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [viewportPx, setViewportPx] = useState(0)
  useEffect(() => {
    const element = scrollRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      setViewportPx(entry?.contentRect.width ?? 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const [zoom, setZoomState] = useState<number>(EDIT_TIMELINE_ZOOM.min)

  const spanSec = Math.max(
    EDIT_TIMELINE_FIT.minSpanSec,
    timelineEndSec(desk) * EDIT_TIMELINE_FIT.tailRatio,
  )
  const fitPxPerSecond =
    viewportPx > 0
      ? Math.min(
          EDIT_TIMELINE_FIT.maxPxPerSecond,
          Math.max(EDIT_TIMELINE_FIT.minPxPerSecond, viewportPx / spanSec),
        )
      : EDIT_TIMELINE_PX_PER_SECOND
  const pxPerSecond =
    zoom <= EDIT_TIMELINE_ZOOM.min
      ? fitPxPerSecond
      : Math.min(EDIT_TIMELINE_ZOOM.maxPxPerSecond, fitPxPerSecond * zoom)
  const scale = useMemo(() => makeTimelineScale(pxPerSecond), [pxPerSecond])

  /**
   * 以播放头为中心缩放：换倍数之前记下播放头在视口里的横坐标，换完把滚动条挪回去，
   * 让它停在原处（播放头在视口外时就把它放到正中）。⚠ 记在 ref 里、在布局后落位 ——
   * 新宽度只有下一次渲染才有。
   */
  const anchorRef = useRef<number | null>(null)
  const playheadSec = desk.playheadSec
  const setZoom = useCallback(
    (next: number) => {
      const scroller = scrollRef.current
      if (scroller) {
        const at = scale.toPx(playheadSec) - scroller.scrollLeft
        anchorRef.current =
          at >= 0 && at <= scroller.clientWidth ? at : scroller.clientWidth / 2
      }
      setZoomState(clampZoom(next))
    },
    [scale, playheadSec],
  )
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const anchor = anchorRef.current
    if (!scroller || anchor === null) return
    anchorRef.current = null
    scroller.scrollLeft = Math.max(0, scale.toPx(playheadSec) - anchor)
  }, [scale, playheadSec])

  // ⌘ / Ctrl + 滚轮（触控板捏合也走这一条）= 缩放；⚠ 要非被动监听才拦得住浏览器缩放。
  const setZoomRef = useRef(setZoom)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    setZoomRef.current = setZoom
    zoomRef.current = zoom
  })
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return undefined
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setZoomRef.current(zoomRef.current * Math.exp(-event.deltaY * 0.01))
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [])

  const tickSec =
    EDIT_TIMELINE_TICK_STEPS.find(
      (step) => scale.toPx(step) >= EDIT_TIMELINE_TICK_MIN_PX,
    ) ?? EDIT_TIMELINE_TICK_STEPS[EDIT_TIMELINE_TICK_STEPS.length - 1]
  const minorSec = scale.toPx(tickSec / 5) >= 12 ? tickSec / 5 : tickSec / 2

  const secondsFromEvent = useCallback(
    (clientX: number): number => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return 0
      return Math.max(0, scale.toSeconds(clientX - rect.left))
    },
    [scale],
  )

  /**
   * 拖播放头（owner 2026-09-28「卡手，不能拖动」）：按下就把播放头放到这一刻，按住
   * 往两边拖就跟着走，松手停下。⚠ 一帧只落一次（`requestAnimationFrame` 合并）——
   * 每个 pointermove 都改一次播放头会把整张台面（连同预览的 seek）重画几十遍，
   * 那正是「卡手」的来源。
   */
  const setPlayhead = desk.setPlayhead
  const startScrub = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      onScrubStart?.()
      const target = event.currentTarget
      target.setPointerCapture?.(event.pointerId)
      let lastX = event.clientX
      let frame = 0
      setPlayhead(secondsFromEvent(lastX))
      const move = (moveEvent: PointerEvent) => {
        lastX = moveEvent.clientX
        if (frame) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          setPlayhead(secondsFromEvent(lastX))
        })
      }
      const up = () => {
        if (frame) window.cancelAnimationFrame(frame)
        setPlayhead(secondsFromEvent(lastX))
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        target.removeEventListener('pointercancel', up)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
      target.addEventListener('pointercancel', up)
    },
    [onScrubStart, secondsFromEvent, setPlayhead],
  )

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
      // 三档循环：无 → 叠化 → 黑场 → 无。工具条那颗是**快捷**，属性行才是全貌。
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

  const magnetic = desk.project.settings.magnetic

  return (
    <div
      data-testid="edit-desk-timeline"
      className="@container/composer relative flex shrink-0 flex-col gap-2.5 rounded-2xl bg-card px-4 pb-3.5 pt-2.5 shadow-float"
    >
      {readOnly ? null : (
        <div className="flex h-9 min-w-0 items-center gap-2">
          <div className="inline-flex shrink-0 gap-0.5">
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
          <span className="h-4.5 w-px shrink-0 bg-border" aria-hidden />
          {props ?? <div className="flex-1" />}
          <div
            role="group"
            aria-label={t('zoom.label')}
            className="flex shrink-0 items-center gap-0.5"
          >
            <ShellIconButton
              icon={ZoomOut}
              label={t('zoom.out')}
              testId="edit-desk-zoom-out"
              disabled={zoom <= EDIT_TIMELINE_ZOOM.min}
              onClick={() => setZoom(zoom - EDIT_TIMELINE_ZOOM.step)}
            />
            <Slider
              data-testid="edit-desk-zoom"
              aria-label={t('zoom.label')}
              className="mx-1 w-16 @max-7xl/composer:hidden"
              min={EDIT_TIMELINE_ZOOM.min}
              max={EDIT_TIMELINE_ZOOM.max}
              step={EDIT_TIMELINE_ZOOM.step}
              value={[zoom]}
              onValueChange={([next]) => {
                if (next !== undefined) setZoom(next)
              }}
            />
            <ShellIconButton
              icon={ZoomIn}
              label={t('zoom.in')}
              testId="edit-desk-zoom-in"
              disabled={zoom >= EDIT_TIMELINE_ZOOM.max}
              onClick={() => setZoom(zoom + EDIT_TIMELINE_ZOOM.step)}
            />
            <button
              type="button"
              data-testid="edit-desk-zoom-fit"
              aria-pressed={zoom <= EDIT_TIMELINE_ZOOM.min}
              onClick={() => setZoom(EDIT_TIMELINE_ZOOM.min)}
              className={cn(
                studioOutlineChipClass,
                'ml-1 h-7 px-2.5 text-xs @max-4xl/composer:hidden',
                zoom <= EDIT_TIMELINE_ZOOM.min && studioOutlineChipSetClass,
              )}
            >
              {t('zoom.fit')}
            </button>
          </div>
          <span className="h-4.5 w-px shrink-0 bg-border" aria-hidden />
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span>{t('magnetic')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={magnetic}
              data-testid="edit-desk-magnetic"
              onClick={() => desk.setSettings({ magnetic: !magnetic })}
              className={cn(
                'relative h-5 w-8.5 shrink-0 rounded-full transition-colors duration-fast motion-reduce:transition-none',
                magnetic ? 'bg-primary' : 'bg-surface-fill-track',
              )}
            >
              <span
                className={cn(
                  'absolute left-0.5 top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform duration-spring-slot ease-spring-slot motion-reduce:transition-none',
                  magnetic && 'translate-x-3.5',
                )}
              />
            </button>
          </label>
        </div>
      )}

      <div className="flex min-w-0 gap-2.5">
        {/* 轨道名那一列：⛔ 不跟着横向滚 —— 放大后也要一眼看出哪条是哪条。 */}
        <div
          aria-hidden
          className="flex shrink-0 flex-col gap-1.5"
          style={{ width: EDIT_DESK_LAYOUT.trackHeadWidthPx }}
        >
          <span
            className="shrink-0"
            style={{ height: EDIT_DESK_LAYOUT.rulerHeightPx }}
          />
          <TrackHead
            icon={Type}
            label={t('tracks.text')}
            height={EDIT_TEXT_LANE_HEIGHT_PX}
          />
          {EDIT_TRACKS.map((track) => (
            <TrackHead
              key={track}
              icon={TRACK_ICONS[track]}
              label={t(`tracks.${track}`)}
              height={laneHeightOf(track)}
            />
          ))}
        </div>

        <TimelineScaleContext.Provider value={scale}>
          <div
            ref={scrollRef}
            data-testid="edit-desk-timeline-scroll"
            className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          >
            <div
              ref={canvasRef}
              className="relative flex min-w-full flex-col gap-1.5"
              style={{ width: scale.toPx(spanSec) }}
            >
              <Ruler
                spanSec={spanSec}
                tickSec={tickSec}
                minorSec={minorSec}
                onScrub={startScrub}
              />
              {/*
                T 轨在 V 之上（spec §6「文字段」）。⚠ 它**不参与磁吸主轨**，所以段是
                绝对定位（left = 起点秒）而不是首尾相接的一排 —— 字幕钉在画面的某一刻，
                画面换了序它不该跟着挪。
              */}
              <TextLane
                desk={desk}
                secondsFromEvent={secondsFromEvent}
                onScrub={startScrub}
              />
              {EDIT_TRACKS.map((track) => (
                <TrackLane
                  key={track}
                  track={track}
                  rows={desk.rows[track]}
                  desk={desk}
                  secondsFromEvent={secondsFromEvent}
                  onScrub={startScrub}
                  onDropLibraryAsset={onDropLibraryAsset}
                  highlighted={highlightTrack === track}
                />
              ))}

              {/* 播放头 —— 四轨共用一条，⛔ 每轨一条会在缩放时对不齐 */}
              <div
                data-testid="edit-desk-playhead"
                aria-hidden
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 -translate-x-px bg-primary"
                style={{ left: scale.toPx(desk.playheadSec) }}
              >
                {/* 顶上那枚时间读数就是拖柄。⚠ 贴近开头时整枚往右让，⛔ 半截藏到轨道名底下。 */}
                <span
                  data-testid="edit-desk-playhead-grip"
                  onPointerDown={startScrub}
                  className={cn(
                    'pointer-events-auto absolute top-0 cursor-ew-resize touch-none select-none whitespace-nowrap rounded-md bg-primary px-1.5 font-mono text-3xs leading-5 text-primary-foreground',
                    scale.toPx(desk.playheadSec) < 28
                      ? 'left-0'
                      : 'left-1/2 -translate-x-1/2',
                  )}
                >
                  {formatEditClock(desk.playheadSec, true)}
                </span>
              </div>
            </div>
          </div>
        </TimelineScaleContext.Provider>
      </div>
    </div>
  )
}

function TrackHead({
  icon: Icon,
  label,
  height,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly height: number
}) {
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 pl-1 text-xs text-muted-foreground"
      style={{ height }}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

/** 标尺：大刻度带时间，小刻度按缩放细分；点它 = 移播放头。 */
function Ruler({
  spanSec,
  tickSec,
  minorSec,
  onScrub,
}: {
  readonly spanSec: number
  readonly tickSec: number
  readonly minorSec: number
  onScrub(event: React.PointerEvent<HTMLElement>): void
}) {
  const scale = useTimelineScale()
  const majors: number[] = []
  for (let at = 0; at <= spanSec; at += tickSec) majors.push(at)
  const minors: number[] = []
  for (let at = minorSec; at <= spanSec; at += minorSec) {
    const onMajor = Math.abs(at / tickSec - Math.round(at / tickSec)) < 1e-6
    if (!onMajor) minors.push(at)
  }
  return (
    <div
      data-testid="edit-desk-ruler"
      aria-hidden
      onPointerDown={onScrub}
      className="relative shrink-0 cursor-ew-resize touch-none select-none"
      style={{ height: EDIT_DESK_LAYOUT.rulerHeightPx }}
    >
      {minors.map((at) => (
        <i
          key={`m${at}`}
          className="absolute bottom-0 h-1 w-px bg-foreground/15"
          style={{ left: scale.toPx(at) }}
        />
      ))}
      {majors.map((at) => (
        <span
          key={at}
          className="absolute bottom-0"
          style={{ left: scale.toPx(at) }}
        >
          <i className="absolute bottom-0 left-0 h-2.5 w-px bg-foreground/30" />
          <span className="absolute bottom-2.5 left-1.5 whitespace-nowrap font-mono text-2xs text-muted-foreground">
            {formatEditClock(at)}
          </span>
        </span>
      ))}
    </div>
  )
}

/** 一道轨槽的底（画板 `.ed-bed`）：空着的地方也看得出这是一条轨。 */
function LaneBed({
  dropping,
  highlighted,
}: {
  readonly dropping?: boolean
  readonly highlighted?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 rounded-lg bg-muted transition-colors duration-fast',
        dropping && 'bg-surface-fill',
        // 「语音」/「配乐」按下之后这条轨点亮 —— 用户接着要往它上面拖东西。
        highlighted && 'ring-2 ring-inset ring-primary',
      )}
    />
  )
}

/** T 轨（S8d）。 */
function TextLane({
  desk,
  secondsFromEvent,
  onScrub,
}: {
  readonly desk: EditDesk
  secondsFromEvent(clientX: number): number
  onScrub(event: React.PointerEvent<HTMLElement>): void
}) {
  const t = useTranslations('StudioNode.editDesk')

  return (
    <div
      data-testid="edit-desk-track-text"
      onPointerDown={onScrub}
      className="relative shrink-0"
      style={{ height: EDIT_TEXT_LANE_HEIGHT_PX }}
    >
      <LaneBed />
      {desk.project.tracks.text.length === 0 ? (
        <span className="absolute inset-y-0 left-2.5 flex items-center text-2xs text-muted-foreground">
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
  )
}

/** 选中段两端那对黑色手柄（画板 `.hl` / `.hr`）：中间一根白色握线。 */
function TrimHandle({
  edge,
  testId,
  label,
  value,
  onPointerDown,
}: {
  readonly edge: 'in' | 'out'
  readonly testId: string
  readonly label: string
  readonly value: number
  onPointerDown(event: React.PointerEvent<HTMLElement>): void
}) {
  return (
    <span
      data-testid={testId}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(value * 10) / 10}
      tabIndex={0}
      onPointerDown={onPointerDown}
      style={{ width: EDIT_DESK_LAYOUT.handleWidthPx }}
      className={cn(
        'absolute inset-y-0 z-10 cursor-ew-resize bg-primary',
        edge === 'in' ? 'left-0' : 'right-0',
      )}
    >
      <span className="absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
    </span>
  )
}

/** 拖手柄时手柄上方那枚读数（画板「拖手柄把一段拉长 / 缩短」）。 */
function TrimReadout({
  edge,
  text,
}: {
  readonly edge: 'in' | 'out'
  readonly text: string
}) {
  return (
    <span
      data-testid="edit-desk-trim-readout"
      role="status"
      className={cn(
        'pointer-events-none absolute bottom-full z-30 mb-2 whitespace-nowrap rounded-md bg-primary px-2 py-1 font-mono text-2xs text-primary-foreground shadow-float',
        edge === 'in' ? 'left-0' : 'right-0',
      )}
    >
      {text}
    </span>
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
  const t = useTranslations('StudioNode.editDesk')
  const scale = useTimelineScale()
  const selected = desk.textSelectionId === clip.id
  const [preview, setPreview] = useState<{
    startSec: number
    durationSec: number
    edge: 'move' | 'in' | 'out'
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
        setPreview({ ...nextOf(moveEvent.clientX), edge: mode })
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
  const trimming = preview && preview.edge !== 'move' ? preview : null

  return (
    <div
      className="absolute"
      style={{
        top: (EDIT_TEXT_LANE_HEIGHT_PX - EDIT_TEXT_CLIP_HEIGHT_PX) / 2,
        left: scale.toPx(shown.startSec),
        width: Math.max(
          scale.toPx(shown.durationSec),
          EDIT_DESK_LAYOUT.handleWidthPx * 4,
        ),
        height: EDIT_TEXT_CLIP_HEIGHT_PX,
      }}
    >
      {trimming ? (
        <TrimReadout
          edge={trimming.edge === 'in' ? 'in' : 'out'}
          text={t('trim', {
            edge: t(
              trimming.edge === 'in'
                ? 'inspector.inPoint'
                : 'inspector.outPoint',
            ),
            from: formatEditClock(
              trimming.edge === 'in'
                ? clip.startSec
                : clip.startSec + clip.durationSec,
              true,
            ),
            to: formatEditClock(
              trimming.edge === 'in'
                ? trimming.startSec
                : trimming.startSec + trimming.durationSec,
              true,
            ),
            length: trimming.durationSec.toFixed(1),
          })}
        />
      ) : null}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        data-testid={`edit-desk-text-clip-${clip.id}`}
        {...{ [EDIT_CLIP_FLASH_ATTRIBUTE]: clip.id }}
        onPointerDown={startDrag('move')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') desk.selectText(clip.id)
        }}
        className={cn(
          'relative flex size-full items-center gap-1.5 overflow-hidden rounded-md bg-card px-1.5 text-2xs text-foreground ring-1 ring-inset ring-border transition-shadow duration-fast',
          selected &&
            'px-3.5 ring-2 ring-primary outline outline-3 outline-offset-2 outline-muted',
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center rounded-sm bg-primary text-3xs font-semibold text-primary-foreground">
          T
        </span>
        <span className="truncate">{firstLine}</span>
        {selected ? (
          <>
            <TrimHandle
              edge="in"
              testId={`edit-desk-text-handle-in-${clip.id}`}
              label={t('inspector.inPoint')}
              value={shown.startSec}
              onPointerDown={startDrag('in')}
            />
            <TrimHandle
              edge="out"
              testId={`edit-desk-text-handle-out-${clip.id}`}
              label={t('inspector.outPoint')}
              value={shown.startSec + shown.durationSec}
              onPointerDown={startDrag('out')}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}

function TrackLane({
  track,
  rows,
  desk,
  secondsFromEvent,
  onScrub,
  onDropLibraryAsset,
  highlighted,
}: {
  readonly track: EditTrackId
  readonly rows: readonly EditTimelineRow[]
  readonly desk: EditDesk
  secondsFromEvent(clientX: number): number
  onScrub(event: React.PointerEvent<HTMLElement>): void
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
    <div
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
        const index = desk.insertIndexAt(track, secondsFromEvent(event.clientX))
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
      // 空白处按下 = 移播放头，按住拖 = 拖播放头（点段的那一路 stopPropagation 了）。
      onPointerDown={onScrub}
      className="relative shrink-0"
      style={{ height: laneHeightOf(track) }}
    >
      <LaneBed dropping={dropping} highlighted={highlighted} />
      <div
        className="absolute inset-x-0 flex items-stretch gap-1"
        style={{
          top: EDIT_DESK_LAYOUT.laneInsetPx,
          bottom: EDIT_DESK_LAYOUT.laneInsetPx,
        }}
      >
        {rows.length === 0 ? (
          <span className="flex items-center px-2.5 text-2xs text-muted-foreground">
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
  const scale = useTimelineScale()
  const clip = row.clip
  const selected = desk.selection?.clipId === clip.id
  /** 拖手柄时的本地预览（⛔ 不落 op，见文件头）。 */
  const [preview, setPreview] = useState<{
    in: number
    out: number
    edge: 'in' | 'out'
  } | null>(null)
  const shown = preview ?? { in: clip.in, out: clip.out }
  const speed = clip.speed || 1
  const widthPx = Math.max(
    scale.toPx((shown.out - shown.in) / speed),
    EDIT_DESK_LAYOUT.handleWidthPx * 3,
  )
  const gone = !row.source.exists
  const sourceName = readSourceName(row)

  const startTrim =
    (edge: 'in' | 'out') => (event: React.PointerEvent<HTMLElement>) => {
      event.stopPropagation()
      event.preventDefault()
      const originX = event.clientX
      const origin = { in: clip.in, out: clip.out }
      const target: HTMLElement = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const nextOf = (clientX: number) => {
        const delta = scale.toSeconds(clientX - originX) * speed
        return edge === 'in'
          ? { in: Math.max(0, origin.in + delta), out: origin.out }
          : { in: origin.in, out: Math.max(0, origin.out + delta) }
      }
      const move = (moveEvent: PointerEvent) => {
        setPreview({ ...nextOf(moveEvent.clientX), edge })
      }
      const up = (upEvent: PointerEvent) => {
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        const next = nextOf(upEvent.clientX)
        setPreview(null)
        desk.updateClip(
          track,
          clip.id,
          edge === 'in' ? { in: next.in } : { out: next.out },
        )
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
    }

  return (
    <>
      <div className="relative shrink-0" style={{ width: widthPx }}>
        {preview ? (
          <TrimReadout
            edge={preview.edge}
            text={t('trim', {
              edge: t(
                preview.edge === 'in'
                  ? 'inspector.inPoint'
                  : 'inspector.outPoint',
              ),
              from: formatEditClock(
                preview.edge === 'in' ? clip.in : clip.out,
                true,
              ),
              to: formatEditClock(
                preview.edge === 'in' ? preview.in : preview.out,
                true,
              ),
              length: ((preview.out - preview.in) / speed).toFixed(1),
            })}
          />
        ) : null}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={selected}
          data-testid={`edit-desk-clip-${clip.id}`}
          {...{ [EDIT_CLIP_FLASH_ATTRIBUTE]: clip.id }}
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
          className={cn(
            'relative size-full overflow-hidden rounded-md transition-shadow duration-fast',
            isVideo
              ? gone
                ? 'edit-clip-gone'
                : 'bg-surface-fill-track'
              : 'bg-surface-fill',
            selected &&
              'ring-2 ring-primary outline outline-3 outline-offset-2 outline-muted',
          )}
        >
          <ClipCanvas row={row} isVideo={isVideo} widthPx={widthPx} />

          {isVideo ? (
            gone ? (
              <span className="absolute left-2.5 top-1.5 truncate text-2xs text-status-risk">
                {t('inspector.sourceGone')}
              </span>
            ) : (
              <>
                {/* 压在画面上的读数：固定明暗（ui-defaults §2.4 媒体 chrome 例外）。 */}
                <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-neutral-950/60 via-transparent to-neutral-950/15" />
                <span className="absolute right-1.5 top-1.5 rounded-sm bg-neutral-950/45 px-1 font-mono text-3xs leading-4 text-white">
                  {t('clipDuration', { seconds: row.durationSec.toFixed(1) })}
                </span>
                <span
                  className={cn(
                    'absolute bottom-1.5 right-2 truncate text-2xs font-semibold text-white',
                    selected ? 'left-4' : 'left-2.5',
                  )}
                >
                  {sourceName}
                </span>
              </>
            )
          ) : (
            <>
              {track === EDIT_TRACK_IDS.music ? (
                // 配乐的音量线：1 = 原样，画在中线偏上；2 倍贴顶、0 贴底。
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1 h-px bg-foreground/45"
                  style={{
                    top: `${Math.min(90, Math.max(10, (1 - (clip.gain ?? 1) / 2) * 100))}%`,
                  }}
                />
              ) : null}
              <span
                className={cn(
                  'absolute inset-y-0 flex items-center',
                  selected ? 'left-4' : 'left-2',
                )}
              >
                <span className="truncate rounded-sm bg-card/75 px-1.5 text-2xs font-medium text-foreground">
                  {sourceName}
                </span>
              </span>
            </>
          )}

          {row.source.stale ? (
            <button
              type="button"
              data-testid={`edit-desk-stale-${clip.id}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                desk.refreshClipSource(track, clip.id)
              }}
              className={cn(
                'absolute top-1.5 z-10 rounded-full bg-status-warning px-1.5 text-3xs leading-4 text-white',
                selected ? 'left-4' : 'left-1.5',
              )}
            >
              {t('staleBadge')}
            </button>
          ) : null}

          {selected ? (
            <>
              <TrimHandle
                edge="in"
                testId={`edit-desk-handle-in-${clip.id}`}
                label={t('inspector.inPoint')}
                value={shown.in}
                onPointerDown={startTrim('in')}
              />
              <TrimHandle
                edge="out"
                testId={`edit-desk-handle-out-${clip.id}`}
                label={t('inspector.outPoint')}
                value={shown.out}
                onPointerDown={startTrim('out')}
              />
            </>
          ) : null}
        </div>
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
 * ⚠ 命中区靠一层 `-inset-2` 的透明覆盖放大，⛔ 不把菱形本身画大；它压在两段的缝上
 * （负外边距），白色描边把它和两边的画面分开。
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
        'relative z-10 -mx-2 shrink-0 self-center rotate-45 rounded-xs ring-2 ring-card',
        'after:absolute after:-inset-2 after:content-[""]',
        current === EDIT_TRANSITION_IDS.none
          ? 'border-[1.5px] border-foreground bg-card'
          : 'bg-foreground',
        over && 'outline outline-[1.5px] outline-offset-2 outline-primary',
      )}
    />
  )
}

/**
 * 段里的**内容**。
 *
 * 视频段 = 一排等宽缩略帧：**同一张封面帧铺满**，这就是剪辑软件里「一段胶片」的
 * 读法。⛔ 不逐条抽真帧：那要 N 次 seek，拖手柄时页面直接停住，而「这是哪一镜」一张
 * 封面已经答完了（`EDIT_DESK_CLIP_FRAME_MAX` 头注）。
 * 音频段 = 一条淡色波形（复用音频卡那一只）。
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
        className="pointer-events-none absolute inset-0 flex items-center px-1 opacity-45"
      >
        <AudioWaveform
          seed={url ?? row.clip.sourceNodeId}
          barCount={Math.max(
            4,
            Math.floor(widthPx / EDIT_DESK_LAYOUT.waveBarPitchPx),
          )}
          height={EDIT_DESK_LAYOUT.waveHeightPx - 10}
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
          className="min-w-0 flex-1 bg-cover bg-center"
          style={{ backgroundImage: `url(${poster})` }}
        />
      ))}
    </div>
  )
}

/** 段之间拖排序的载荷。⚠ 与素材拖投分开：一个是「加一段」，一个是「换个位置」。 */
const CLIP_DRAG_MIME = 'application/x-pixelvault-edit-clip'

/**
 * 段上写的名字：来源卡的镜头名。⚠ 卡删了读不到名字，就只写「来源卡已删」（在段上），
 * ⛔ 不回落成那串 id。
 */
function readSourceName(row: EditTimelineRow): string {
  const data = row.source.node?.data
  if (!data) return ''
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return data.label ?? data.name
  return data.name
}

export type { EditClip }
