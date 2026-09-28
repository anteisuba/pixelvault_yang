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
  EDIT_TIMELINE_FEEL,
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
import { clampTrim, currentUrlOf, formatEditClock } from '@/lib/edit-project'
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

/**
 * 拖东西时的吸附（owner 2026-09-28「操作体验不太好」）：离播放头或任何一段的头尾不到
 * `EDIT_TIMELINE_FEEL.snapPx` 就贴上去，同时画一条吸附线。
 * `snap` 返回贴上的那一刻，`null` = 附近没有；`exclude` = 自己那几条边（⛔ 自己吸自己）。
 */
interface TimelineInteraction {
  snap(seconds: number, exclude?: readonly number[]): number | null
  setGuide(seconds: number | null): void
}

const TimelineInteractionContext = createContext<TimelineInteraction>({
  snap: () => null,
  setGuide: () => undefined,
})

function useTimelineInteraction(): TimelineInteraction {
  return useContext(TimelineInteractionContext)
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
    if (!element) return undefined
    // 先同步量一次：ResizeObserver 要等下一帧才回话（后台标签页里一直不回），
    // 那之前时间线会按默认比例画成半截。
    setViewportPx(element.clientWidth)
    if (typeof ResizeObserver === 'undefined') return undefined
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

  /* ── 吸附 ─────────────────────────────────────────────────────────── */
  const textClips = desk.project.tracks.text
  const snapTargets = useMemo(() => {
    const targets = [0, playheadSec]
    for (const track of EDIT_TRACKS) {
      for (const row of desk.rows[track]) {
        targets.push(row.startSec, row.startSec + row.durationSec)
      }
    }
    for (const clip of textClips) {
      targets.push(clip.startSec, clip.startSec + clip.durationSec)
    }
    return targets
  }, [desk.rows, textClips, playheadSec])
  const [guideSec, setGuideSec] = useState<number | null>(null)
  const snap = useCallback(
    (seconds: number, exclude: readonly number[] = []): number | null => {
      let best: number | null = null
      let bestPx: number = EDIT_TIMELINE_FEEL.snapPx
      for (const target of snapTargets) {
        if (exclude.some((own) => Math.abs(own - target) < 1e-6)) continue
        const px = Math.abs(scale.toPx(target) - scale.toPx(seconds))
        if (px <= bestPx) {
          best = target
          bestPx = px
        }
      }
      return best
    },
    [snapTargets, scale],
  )
  const interaction = useMemo<TimelineInteraction>(
    () => ({ snap, setGuide: setGuideSec }),
    [snap],
  )

  /**
   * 拖播放头（owner 2026-09-28「卡手，不能拖动」）：在标尺或播放头的时间读数上按下，
   * 播放头就到这一刻，按住往两边拖就跟着走（贴近段头段尾会吸上去），松手停下。
   * ⚠ 一帧只落一次（`requestAnimationFrame` 合并）—— 每个 pointermove 都改一次播放头
   * 会把整张台面（连同预览的 seek）重画几十遍，那正是「卡手」的来源。
   */
  const setPlayhead = desk.setPlayhead
  const startScrub = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      onScrubStart?.()
      const target = event.currentTarget
      target.setPointerCapture?.(event.pointerId)
      const origin = playheadSec
      let lastX = event.clientX
      let frame = 0
      const land = () => {
        const seconds = secondsFromEvent(lastX)
        const snapped = snap(seconds, [origin])
        setGuideSec(snapped)
        setPlayhead(snapped ?? seconds)
      }
      land()
      const move = (moveEvent: PointerEvent) => {
        lastX = moveEvent.clientX
        if (frame) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          land()
        })
      }
      const up = () => {
        if (frame) window.cancelAnimationFrame(frame)
        land()
        setGuideSec(null)
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        target.removeEventListener('pointercancel', up)
      }
      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
      target.addEventListener('pointercancel', up)
    },
    [onScrubStart, secondsFromEvent, setPlayhead, snap, playheadSec],
  )

  /**
   * 轨道上空白处按下 = **取消选中**，⛔ 不再挪播放头（owner「点哪儿会发生什么」：
   * 点空白挪播放头太容易误触）。挪播放头只在标尺和播放头的时间读数上。
   */
  const { select, selectText } = desk
  const deselect = useCallback(() => {
    select(null)
    selectText(null)
  }, [select, selectText])

  /** 标尺上悬停：一条浅线 + 时间，告诉你点下去播放头会到哪儿。 */
  const [hoverSec, setHoverSec] = useState<number | null>(null)
  const hoverFrame = useRef(0)
  const onRulerHover = useCallback(
    (clientX: number | null) => {
      if (hoverFrame.current) window.cancelAnimationFrame(hoverFrame.current)
      if (clientX === null) {
        hoverFrame.current = 0
        setHoverSec(null)
        return
      }
      hoverFrame.current = window.requestAnimationFrame(() => {
        hoverFrame.current = 0
        setHoverSec(secondsFromEvent(clientX))
      })
    },
    [secondsFromEvent],
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
          <TimelineInteractionContext.Provider value={interaction}>
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
                  onHover={onRulerHover}
                />
                {/*
                T 轨在 V 之上（spec §6「文字段」）。⚠ 它**不参与磁吸主轨**，所以段是
                绝对定位（left = 起点秒）而不是首尾相接的一排 —— 字幕钉在画面的某一刻，
                画面换了序它不该跟着挪。
              */}
                <TextLane desk={desk} onBlankPointerDown={deselect} />
                {EDIT_TRACKS.map((track) => (
                  <TrackLane
                    key={track}
                    track={track}
                    rows={desk.rows[track]}
                    desk={desk}
                    secondsFromEvent={secondsFromEvent}
                    onBlankPointerDown={deselect}
                    onDropLibraryAsset={onDropLibraryAsset}
                    highlighted={highlightTrack === track}
                  />
                ))}

                {/* 吸附线：拖的那条边贴上了谁。 */}
                {guideSec !== null ? (
                  <span
                    data-testid="edit-desk-snap-guide"
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-primary/60"
                    style={{ left: scale.toPx(guideSec) }}
                  />
                ) : null}
                {/* 标尺悬停线：点下去播放头会到哪儿。 */}
                {hoverSec !== null && guideSec === null ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-foreground/20"
                    style={{ left: scale.toPx(hoverSec) }}
                  >
                    <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-muted-foreground px-1.5 font-mono text-3xs leading-5 text-background">
                      {formatEditClock(hoverSec, true)}
                    </span>
                  </span>
                ) : null}

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
          </TimelineInteractionContext.Provider>
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
  onHover,
}: {
  readonly spanSec: number
  readonly tickSec: number
  readonly minorSec: number
  onScrub(event: React.PointerEvent<HTMLElement>): void
  onHover(clientX: number | null): void
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
      onPointerMove={(event) => onHover(event.clientX)}
      onPointerLeave={() => onHover(null)}
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
  onBlankPointerDown,
}: {
  readonly desk: EditDesk
  onBlankPointerDown(): void
}) {
  const t = useTranslations('StudioNode.editDesk')

  return (
    <div
      data-testid="edit-desk-track-text"
      onPointerDown={onBlankPointerDown}
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
        <TextClipView key={clip.id} clip={clip} desk={desk} />
      ))}
    </div>
  )
}

/**
 * 段两端的裁剪区（owner 2026-09-28「拉长 / 缩短一段」）：**没选中也能直接拖** —— 鼠标
 * 移到段的两端，那根黑手柄（中间一根白色握线）就浮出来、光标变成左右箭头；选中的段
 * 两端一直亮着。命中区统一 `EDIT_TIMELINE_FEEL.edgeHitPx` 宽。⚠ 悬停和选中是**同一根
 * 手柄**：画面缩略图大多偏暗，一根细黑线落上去看不见，白握线才是看得见的那一笔。
 */
function TrimHandle({
  edge,
  testId,
  label,
  value,
  selected,
  onPointerDown,
}: {
  readonly edge: 'in' | 'out'
  readonly testId: string
  readonly label: string
  readonly value: number
  readonly selected: boolean
  onPointerDown(event: React.PointerEvent<HTMLElement>): void
}) {
  return (
    <span
      data-testid={testId}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(value * 10) / 10}
      tabIndex={selected ? 0 : -1}
      onPointerDown={onPointerDown}
      style={{ width: EDIT_TIMELINE_FEEL.edgeHitPx }}
      className={cn(
        'group/handle absolute inset-y-0 z-10 cursor-ew-resize touch-none',
        edge === 'in' ? 'left-0' : 'right-0',
      )}
    >
      <span
        style={{ width: EDIT_DESK_LAYOUT.handleWidthPx }}
        className={cn(
          'absolute inset-y-0 bg-primary transition-opacity duration-fast motion-reduce:transition-none',
          edge === 'in' ? 'left-0' : 'right-0',
          selected ? 'opacity-100' : 'opacity-0 group-hover/handle:opacity-100',
        )}
      >
        <span className="absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
      </span>
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
 * 按下之后跟着指针走的一次拖动（字幕挪位 / 裁剪 / 段换位共用）：
 * 过了 `dragThresholdPx` 才算拖（没过 = 只是点选），一帧只落一次预览，松手落定，
 * 拖的途中按 Esc = 放弃。⚠ Esc 在捕获阶段拦下并 `preventDefault`：台面挂在 window
 * 上的 Esc 是「退出剪辑台」。
 */
function followPointer(
  event: React.PointerEvent<HTMLElement>,
  handlers: {
    onMove(deltaPx: number): void
    onEnd(deltaPx: number, dragged: boolean): void
    onCancel(): void
  },
): void {
  const target = event.currentTarget
  target.setPointerCapture?.(event.pointerId)
  const startX = event.clientX
  let lastX = startX
  let dragged = false
  let frame = 0
  const cleanup = () => {
    if (frame) window.cancelAnimationFrame(frame)
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', onKey, true)
  }
  const move = (moveEvent: PointerEvent) => {
    lastX = moveEvent.clientX
    if (!dragged) {
      if (Math.abs(lastX - startX) < EDIT_TIMELINE_FEEL.dragThresholdPx) return
      dragged = true
    }
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      handlers.onMove(lastX - startX)
    })
  }
  const up = () => {
    cleanup()
    handlers.onEnd(lastX - startX, dragged)
  }
  const cancel = () => {
    cleanup()
    handlers.onCancel()
  }
  const onKey = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key !== 'Escape' || !dragged) return
    keyEvent.preventDefault()
    keyEvent.stopPropagation()
    cancel()
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', onKey, true)
}

/**
 * 一段字幕。点 = 选中 · 按住拖 = 挪位置 · 拖两端 = 改入出点；拖的时候段头段尾贴近
 * 播放头或别的段就吸上去。⌫ / S 在台面上（键盘不归时间线管）。
 *
 * ⚠ 与 V 段一样**落地时才发 op**（`pointerup`）：拖的过程只动本地预览，⛔ 不把
 * 撤销栈冲成 60 步。
 */
function TextClipView({
  clip,
  desk,
}: {
  readonly clip: EditTextClip
  readonly desk: EditDesk
}) {
  const t = useTranslations('StudioNode.editDesk')
  const scale = useTimelineScale()
  const { snap, setGuide } = useTimelineInteraction()
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
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      desk.selectText(clip.id)
      const origin = {
        startSec: clip.startSec,
        durationSec: clip.durationSec,
      }
      const own = [origin.startSec, origin.startSec + origin.durationSec]

      const nextOf = (
        deltaPx: number,
      ): { startSec: number; durationSec: number; guide: number | null } => {
        const delta = scale.toSeconds(deltaPx)
        if (mode === 'move') {
          const start = Math.max(0, origin.startSec + delta)
          const byStart = snap(start, own)
          if (byStart !== null) {
            return {
              startSec: byStart,
              durationSec: origin.durationSec,
              guide: byStart,
            }
          }
          const byEnd = snap(start + origin.durationSec, own)
          if (byEnd !== null) {
            return {
              startSec: Math.max(0, byEnd - origin.durationSec),
              durationSec: origin.durationSec,
              guide: byEnd,
            }
          }
          return {
            startSec: start,
            durationSec: origin.durationSec,
            guide: null,
          }
        }
        const end = origin.startSec + origin.durationSec
        if (mode === 'in') {
          // 拖左端 = 起点动、尾巴不动（所以长度反向变）。
          const raw = origin.startSec + delta
          const snapped = snap(raw, own)
          const startSec = Math.max(
            0,
            Math.min(snapped ?? raw, end - EDIT_TEXT_CLIP_MIN_DURATION_SEC),
          )
          return { startSec, durationSec: end - startSec, guide: snapped }
        }
        const raw = end + delta
        const snapped = snap(raw, own)
        return {
          startSec: origin.startSec,
          durationSec: Math.max(
            EDIT_TEXT_CLIP_MIN_DURATION_SEC,
            (snapped ?? raw) - origin.startSec,
          ),
          guide: snapped,
        }
      }

      followPointer(event, {
        onMove: (deltaPx) => {
          const next = nextOf(deltaPx)
          setGuide(next.guide)
          setPreview({
            startSec: next.startSec,
            durationSec: next.durationSec,
            edge: mode,
          })
        },
        onEnd: (deltaPx, dragged) => {
          setGuide(null)
          setPreview(null)
          if (!dragged) return
          const next = nextOf(deltaPx)
          desk.updateTextClip(clip.id, {
            startSec: next.startSec,
            durationSec: next.durationSec,
          })
        },
        onCancel: () => {
          setGuide(null)
          setPreview(null)
        },
      })
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
          'relative flex size-full cursor-grab touch-none select-none items-center gap-1.5 overflow-hidden rounded-md bg-card px-2.5 text-2xs text-foreground ring-1 ring-inset ring-border transition-shadow duration-fast hover:ring-foreground/30',
          selected &&
            'px-3.5 ring-2 ring-primary outline outline-3 outline-offset-2 outline-muted hover:ring-primary',
          preview?.edge === 'move' && 'cursor-grabbing shadow-overlay',
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center rounded-sm bg-primary text-3xs font-semibold text-primary-foreground">
          T
        </span>
        <span className="truncate">{firstLine}</span>
        <TrimHandle
          edge="in"
          testId={`edit-desk-text-handle-in-${clip.id}`}
          label={t('inspector.inPoint')}
          value={shown.startSec}
          selected={selected}
          onPointerDown={startDrag('in')}
        />
        <TrimHandle
          edge="out"
          testId={`edit-desk-text-handle-out-${clip.id}`}
          label={t('inspector.outPoint')}
          value={shown.startSec + shown.durationSec}
          selected={selected}
          onPointerDown={startDrag('out')}
        />
      </div>
    </div>
  )
}

/** 一次按住段拖动换位的现场（段之间实时让位）。 */
interface LaneDrag {
  readonly id: string
  readonly from: number
  readonly to: number
  readonly deltaPx: number
  readonly widthPx: number
}

/** 同一条轨上段与段之间的缝（`gap-1`）。 */
const CLIP_GAP_PX = 4

function TrackLane({
  track,
  rows,
  desk,
  secondsFromEvent,
  onBlankPointerDown,
  onDropLibraryAsset,
  highlighted,
}: {
  readonly track: EditTrackId
  readonly rows: readonly EditTimelineRow[]
  readonly desk: EditDesk
  secondsFromEvent(clientX: number): number
  onBlankPointerDown(): void
  onDropLibraryAsset(
    asset: EditDeskLibraryAsset,
    track: EditTrackId,
    index: number,
  ): void
  readonly highlighted: boolean
}) {
  const t = useTranslations('StudioNode.editDesk')
  const scale = useTimelineScale()
  const [dropping, setDropping] = useState(false)
  const [drag, setDrag] = useState<LaneDrag | null>(null)
  const isVideo = track === EDIT_TRACK_IDS.video

  /**
   * 按住段拖 = 换位置（owner 2026-09-28「拖段换位置」）：段跟着指针走、别的段实时
   * 让开，松手才发一条 `edit_move_clip`。⛔ 不再用浏览器原生拖放 —— 那是拖一张半
   * 透明截图、松手才换位，看不见会落在哪。
   */
  const beginMove = (
    event: React.PointerEvent<HTMLElement>,
    row: EditTimelineRow,
    widthPx: number,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    desk.select({ track, clipId: row.clip.id })
    const centers = rows.map((candidate) =>
      scale.toPx(candidate.startSec + candidate.durationSec / 2),
    )
    const targetOf = (deltaPx: number) => {
      const center = (centers[row.index] ?? 0) + deltaPx
      return rows.filter(
        (candidate, index) =>
          index !== row.index && (centers[index] ?? 0) < center,
      ).length
    }
    followPointer(event, {
      onMove: (deltaPx) =>
        setDrag({
          id: row.clip.id,
          from: row.index,
          to: targetOf(deltaPx),
          deltaPx,
          widthPx,
        }),
      onEnd: (deltaPx, dragged) => {
        setDrag(null)
        if (!dragged) return
        const to = targetOf(deltaPx)
        if (to !== row.index) desk.moveClip(track, row.clip.id, to)
      },
      onCancel: () => setDrag(null),
    })
  }

  const offsetOf = (index: number): number => {
    if (!drag) return 0
    if (index === drag.from) return drag.deltaPx
    const shift = drag.widthPx + CLIP_GAP_PX
    if (drag.from < drag.to && index > drag.from && index <= drag.to) {
      return -shift
    }
    if (drag.to < drag.from && index >= drag.to && index < drag.from) {
      return shift
    }
    return 0
  }

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
      // 空白处按下 = 取消选中（点段的那一路 stopPropagation 了）。
      onPointerDown={onBlankPointerDown}
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
            offsetPx={offsetOf(index)}
            lifted={drag?.id === row.clip.id}
            reordering={drag !== null}
            onBodyPointerDown={beginMove}
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
  offsetPx,
  lifted,
  reordering,
  onBodyPointerDown,
}: {
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  readonly desk: EditDesk
  readonly isVideo: boolean
  readonly showTransitionAfter: boolean
  /** 换位途中这一段该挪多少（被拖的那段 = 跟手，别的段 = 让位）。 */
  readonly offsetPx: number
  readonly lifted: boolean
  readonly reordering: boolean
  onBodyPointerDown(
    event: React.PointerEvent<HTMLElement>,
    row: EditTimelineRow,
    widthPx: number,
  ): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  const scale = useTimelineScale()
  const { snap, setGuide } = useTimelineInteraction()
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
  const sourceData = row.source.node?.data
  const sourceDurationSec =
    sourceData &&
    (sourceData.kind === NODE_MEDIA_KIND_IDS.video ||
      sourceData.kind === NODE_MEDIA_KIND_IDS.audio)
      ? sourceData.durationSec
      : undefined

  /**
   * 裁剪：拖左端改入点、拖右端改出点。磁吸主轨上这一段的起点不动，变的是**它的尾巴**
   * （后面的段跟着补位），所以两种拖法吸附的都是尾巴那条边。
   */
  const startTrim =
    (edge: 'in' | 'out') => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      desk.select({ track, clipId: clip.id })
      const origin = { in: clip.in, out: clip.out }
      const ownEnd = row.startSec + row.durationSec

      const nextOf = (deltaPx: number) => {
        const delta = scale.toSeconds(deltaPx) * speed
        const raw =
          edge === 'in'
            ? { in: origin.in + delta, out: origin.out }
            : { in: origin.in, out: origin.out + delta }
        const rawEnd = row.startSec + (raw.out - raw.in) / speed
        const snappedEnd = snap(rawEnd, [row.startSec, ownEnd])
        const patched =
          snappedEnd === null
            ? raw
            : edge === 'in'
              ? {
                  in: origin.out - (snappedEnd - row.startSec) * speed,
                  out: origin.out,
                }
              : {
                  in: origin.in,
                  out: origin.in + (snappedEnd - row.startSec) * speed,
                }
        const clamped = clampTrim(
          clip,
          edge === 'in' ? { in: patched.in } : { out: patched.out },
          sourceDurationSec,
        )
        return { ...clamped, guide: snappedEnd }
      }

      followPointer(event, {
        onMove: (deltaPx) => {
          const next = nextOf(deltaPx)
          setGuide(next.guide)
          setPreview({ in: next.in, out: next.out, edge })
        },
        onEnd: (deltaPx, dragged) => {
          setGuide(null)
          setPreview(null)
          if (!dragged) return
          const next = nextOf(deltaPx)
          desk.updateClip(
            track,
            clip.id,
            edge === 'in' ? { in: next.in } : { out: next.out },
          )
        },
        onCancel: () => {
          setGuide(null)
          setPreview(null)
        },
      })
    }

  return (
    <>
      <div
        className={cn(
          'relative shrink-0',
          lifted
            ? 'z-30'
            : reordering &&
                'transition-transform duration-base ease-standard motion-reduce:transition-none',
        )}
        style={{
          width: widthPx,
          transform: offsetPx ? `translateX(${offsetPx}px)` : undefined,
        }}
      >
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
          onPointerDown={(event) => onBodyPointerDown(event, row, widthPx)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') desk.select({ track, clipId: clip.id })
          }}
          className={cn(
            'relative size-full cursor-grab touch-none select-none overflow-hidden rounded-md transition-shadow duration-fast hover:ring-1 hover:ring-foreground/30',
            isVideo
              ? gone
                ? 'edit-clip-gone'
                : 'bg-surface-fill-track'
              : 'bg-surface-fill',
            selected &&
              'ring-2 ring-primary outline outline-3 outline-offset-2 outline-muted hover:ring-2 hover:ring-primary',
            lifted && 'scale-102 cursor-grabbing shadow-overlay',
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
                  {t('clipDuration', {
                    seconds: ((shown.out - shown.in) / speed).toFixed(1),
                  })}
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

          <TrimHandle
            edge="in"
            testId={`edit-desk-handle-in-${clip.id}`}
            label={t('inspector.inPoint')}
            value={shown.in}
            selected={selected}
            onPointerDown={startTrim('in')}
          />
          <TrimHandle
            edge="out"
            testId={`edit-desk-handle-out-${clip.id}`}
            label={t('inspector.outPoint')}
            value={shown.out}
            selected={selected}
            onPointerDown={startTrim('out')}
          />
        </div>
      </div>

      {showTransitionAfter ? (
        <TransitionMark
          clip={clip}
          hidden={reordering}
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
  hidden,
  onSet,
}: {
  readonly clip: EditClip
  /** 段在换位途中：菱形先藏起来（它夹在两段的缝上，跟着让位会对不上）。 */
  readonly hidden: boolean
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
        hidden && 'opacity-0',
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
