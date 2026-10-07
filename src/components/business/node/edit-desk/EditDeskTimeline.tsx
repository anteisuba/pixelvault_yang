'use client'

/**
 * 时间线（v2 暗场 · 关键切片 `JtN1ur…` 台面，第 3 片）：顶上一条**走带行**（播放 · 时间码 ·
 * 声音 · 选中段的属性 · 缩放），下面 **全片条 · 标尺 · 字幕 · 主线 · 台词 · 配乐**。
 * ⛔ 没有工具键那一排：加字幕在左列「文字」页，分割 / 删除在选中段那一行（也走 S / ⌫），
 * 转场在段与段之间的菱形上；主线永远磁吸，⛔ 没有磁吸开关。
 *
 * ── 段长什么样（owner 2026-10-08 选 B「调色台 · 全暗中性」：⛔ 不给轨上色）──────────
 * 主线 = 一排缩略帧 + 左上「n 镜头名」；台词 = 描边胶囊；字幕 = 浅底胶囊 + 「T」；
 * 配乐 = 淡底 + 波形。台词和字幕挂在主线某一段的某一帧上，**连接线**画在轨与轨的缝里
 * （字幕往下、台词往上连主线）；挂点那一帧被裁掉了 = 半透明（断挂，导出时跳过）。
 * 选中 = 白环；拖台词 / 字幕时，松手会挂上的那一段描一圈虚线（换挂点）。
 *
 * ── 位置只有一份算法（`buildTimelineLayout`）──────────────────────────────
 * 拖的途中画的是「假如现在松手」的那一份时间线：换位 / 裁剪时后面的段与挂件实时跟上，
 * 换挂点在拖的途中就看得见。松手发的 op 与预览改的是同一组字段，所以落表后一个像素都
 * 不跳；**磁性动效**（`transition-magnetic`）只在别的东西改了时间线时才真的滑 ——
 * 删段、撤销、助手、MCP。每秒像素变了的那一帧（缩放、助手开合）不动画。
 *
 * ── 交互只有四种手势 ────────────────────────────────────────────────────
 * 点段 = 选中 · 拖手柄 = 裁剪（上方实时读数）· 拖段体 = 换位（台词 / 字幕 = 挪位置，按
 * 落点重新挂）· 标尺 / 播放头读数 = 拖播放头。点轨道空白 = 取消选中。键盘不在这里。
 * 缩放：走带行右端，或 ⌘ / Ctrl + 滚轮；放大到装不下时标尺上方淡入全片条。
 *
 * ⚠ 裁剪与换位**落地时才发 op**（`pointerup`）：拖一次手柄发 60 条 op 会把撤销栈冲成
 * 60 步。
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
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Pause,
  Play,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  EDIT_ATTACH_EPSILON_SEC,
  EDIT_DESK_CLIP_FRAME_MAX,
  EDIT_DESK_LAYOUT,
  EDIT_DESK_LIBRARY_DRAG_MIME,
  EDIT_DESK_NODE_DRAG_MIME,
  EDIT_DESK_TRANSITION_DRAG_MIME,
  EDIT_TEXT_CLIP_MIN_DURATION_SEC,
  EDIT_TIMELINE_FEEL,
  EDIT_TIMELINE_FILMSTRIP,
  EDIT_TIMELINE_FIT,
  EDIT_TIMELINE_GEOMETRY,
  EDIT_TIMELINE_LANE_TOP,
  EDIT_TIMELINE_PX_PER_SECOND,
  EDIT_TIMELINE_TICK_MIN_PX,
  EDIT_TIMELINE_TICK_STEPS,
  EDIT_TIMELINE_ZOOM,
  EDIT_TRACKS,
  EDIT_TRACK_IDS,
  EDIT_TRANSITIONS,
  EDIT_TRANSITION_IDS,
  type EditTrackId,
} from '@/constants/edit-desk'
import { DURATION } from '@/constants/motion'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { RENDER_CROSSFADE_SEC } from '@/constants/render-video'
import {
  clampTrim,
  formatEditClock,
  isAttachmentCut,
  isPositionedTrack,
} from '@/lib/edit-project'
import {
  buildTimelineLayout,
  type TimelineDragPreview,
  type TimelineLayout,
  type TimelineSpan,
} from '@/lib/edit-timeline-layout'
import { cn } from '@/lib/utils'
import { getVideoFrameUrl } from '@/lib/video-poster'
import type { EditTimelineRow } from '@/lib/edit-project'
import type {
  EditAttachment,
  EditClip,
  EditTextClip,
} from '@/types/node-workflow'

import { useVideoPoster } from '@/hooks/node/use-video-poster'
import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { Slider } from '@/components/ui/slider'

import { AudioWaveform } from '../nodes/v4/audio/AudioWaveform'
import { EditDeskIconButton } from './EditDeskIconButton'
import {
  parseEditDeskLibraryAsset,
  type EditDeskLibraryAsset,
} from './EditDeskAssetRail'
import { EditClipVersionsPopover, readClipTakes } from './EditDeskVersions'
import { EDIT_CLIP_FLASH_ATTRIBUTE, flashEditClips } from './edit-desk-flash'

const G = EDIT_TIMELINE_GEOMETRY
const LANE_TOP = EDIT_TIMELINE_LANE_TOP

/** 三条段轨各自的 `top` 与高。 */
const TRACK_LANE: Record<EditTrackId, { top: number; height: number }> = {
  [EDIT_TRACK_IDS.video]: { top: LANE_TOP.video, height: G.videoPx },
  [EDIT_TRACK_IDS.audio]: { top: LANE_TOP.audio, height: G.audioPx },
  [EDIT_TRACK_IDS.music]: { top: LANE_TOP.music, height: G.musicPx },
}

export interface EditDeskTimelineProps {
  readonly desk: EditDesk
  /** 走带行：播放态与声音（与空格键、预览共用台面那一份）。 */
  readonly playing: boolean
  onPlayingChange(playing: boolean): void
  readonly muted: boolean
  onMutedChange(muted: boolean): void
  /**
   * 素材库那一格落进轨 —— **先建卡再进轨**（`EDIT_DESK_LIBRARY_DRAG_MIME` 头注）。
   * 所以它不在 `desk` 上：建卡是图的动作，时间线自己碰不到。
   */
  onDropLibraryAsset(
    asset: EditDeskLibraryAsset,
    track: EditTrackId,
    index: number,
    /** 松手那一刻（时间线秒）：按起点摆的轨（台词）落在这里。 */
    startSec: number,
  ): void
  /**
   * **只看不剪**（手机档，node-canvas-v2 §7.x）：走带行只留播放 · 时间码 · 声音，
   * 轨道整块 `inert`（连键盘焦点一起挡掉）。⛔ 不是置灰 —— 手机上剪辑本来就做不了，
   * 一排灰键只会让人反复去点。
   */
  readonly readOnly?: boolean
  /**
   * 选中段的属性（走带行中间那一格，⛔ 不再有右侧属性栏）。由台面给 ——
   * 「回节点」「到预览里改字」都要碰台面的状态。
   */
  readonly props?: ReactNode
  /** 开始拖播放头（标尺 / 播放头上的时间读数）—— 台面借它停播。 */
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

/** 换位时被拖的那一段：从哪一秒起拖、指针已经挪了多少像素。 */
interface TimelineLift {
  readonly id: string
  readonly originSec: number
  readonly deltaPx: number
}

/**
 * 时间线上所有段共用的拖动现场。
 *
 * `snap`：离播放头或任何一段的头尾不到 `EDIT_TIMELINE_FEEL.snapPx` 就贴上去（同时画一条
 * 吸附线），`exclude` = 自己那几条边（⛔ 自己吸自己）。
 * `layout`：此刻画在哪（拖的途中就是预览那一份）。`liftShiftPx`：换位时被拖的那一段
 * （连同挂在它上面的台词、字幕）跟手多偏出去的像素。
 */
interface TimelineInteraction {
  readonly layout: TimelineLayout
  readonly preview: TimelineDragPreview | null
  readonly lift: TimelineLift | null
  readonly liftShiftPx: number
  /** 拖台词 / 字幕时，松手会挂上的那一段。 */
  readonly hostId: string | null
  /** 刚换了挂点、连接线亮着的那一件。 */
  readonly glowId: string | null
  /** 这一帧的位置变化走不走磁性动效。 */
  readonly animate: boolean
  snap(seconds: number, exclude?: readonly number[]): number | null
  setGuide(seconds: number | null): void
  setDrag(
    drag: {
      readonly preview: TimelineDragPreview
      readonly lift?: TimelineLift
    } | null,
  ): void
  /**
   * 台词 / 字幕落下之后：挂点换了 = 连接线亮一下 + 新宿主闪一下（关键切片「换挂点」）。
   */
  landAttachment(
    itemId: string,
    before: EditAttachment | undefined,
    after: EditAttachment | undefined,
  ): void
}

const TimelineInteractionContext = createContext<TimelineInteraction | null>(
  null,
)

function useTimelineInteraction(): TimelineInteraction {
  const value = useContext(TimelineInteractionContext)
  if (!value) throw new Error('timeline interaction outside the timeline')
  return value
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
  playing,
  onPlayingChange,
  muted,
  onMutedChange,
  onDropLibraryAsset,
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
  const canvasPx = scale.toPx(spanSec)

  /**
   * 每秒像素变了的那一帧不走磁性动效：缩放、助手开合（时间线变窄）时所有段一起换位置，
   * 滑着过去读起来是「时间线在动」而不是「段在动」。⚠ 比的是上一次**提交**的那个数。
   */
  const committedPpsRef = useRef(pxPerSecond)
  const [ppsStable, setPpsStable] = useState(true)
  useLayoutEffect(() => {
    const stable = committedPpsRef.current === pxPerSecond
    committedPpsRef.current = pxPerSecond
    setPpsStable(stable)
  }, [pxPerSecond])

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

  /** 滚到哪了（全片条上那个白框跟着它）。 */
  const [scrollLeft, setScrollLeft] = useState(0)
  const scrollFrame = useRef(0)
  const onScroll = useCallback(() => {
    if (scrollFrame.current) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = 0
      setScrollLeft(scrollRef.current?.scrollLeft ?? 0)
    })
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

  /* ── 拖动现场 → 布局 ─────────────────────────────────────────────────── */
  const [drag, setDrag] = useState<{
    readonly preview: TimelineDragPreview
    readonly lift?: TimelineLift
  } | null>(null)
  const preview = drag?.preview ?? null
  const lift = drag?.lift ?? null
  const layout = useMemo(
    () => buildTimelineLayout(desk.project, preview),
    [desk.project, preview],
  )
  const committedLayout = useMemo(
    () => (preview ? buildTimelineLayout(desk.project) : layout),
    [desk.project, preview, layout],
  )
  const liftShiftPx = lift
    ? scale.toPx(lift.originSec) +
      lift.deltaPx -
      scale.toPx(layout.clips.get(lift.id)?.startSec ?? lift.originSec)
    : 0
  const hostId =
    preview?.kind === 'shift'
      ? (layout.clips.get(preview.clipId)?.attach?.clipId ?? null)
      : preview?.kind === 'text' && preview.reattach
        ? (layout.texts.get(preview.clipId)?.attach?.clipId ?? null)
        : null

  const [glowId, setGlowId] = useState<string | null>(null)
  const glowTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(glowTimer.current), [])
  const landAttachment = useCallback(
    (
      itemId: string,
      before: EditAttachment | undefined,
      after: EditAttachment | undefined,
    ) => {
      if (!after || before?.clipId === after.clipId) return
      setGlowId(itemId)
      window.clearTimeout(glowTimer.current)
      glowTimer.current = window.setTimeout(() => setGlowId(null), G.linkGlowMs)
      flashEditClips([after.clipId])
    },
    [],
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
    () => ({
      layout,
      preview,
      lift,
      liftShiftPx,
      hostId,
      glowId,
      // 拖的途中只有换位时邻段在滑；裁剪、挪台词 / 字幕时一切跟手。
      animate: preview ? preview.kind === 'move' : ppsStable,
      snap,
      setGuide: setGuideSec,
      setDrag,
      landAttachment,
    }),
    [
      layout,
      preview,
      lift,
      liftShiftPx,
      hostId,
      glowId,
      ppsStable,
      snap,
      landAttachment,
    ],
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
   * 轨道上空白处按下 = **取消选中**，⛔ 不挪播放头（owner「点哪儿会发生什么」：
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

  const canPlay = desk.durationSec > 0
  const overflowing = viewportPx > 0 && canvasPx > viewportPx + 1

  /** 段来源（镜头名 / 卡还在不在 / 上游有没有新版本）按段 id 取。 */
  const rowById = useMemo(() => {
    const map = new Map<string, EditTimelineRow>()
    for (const track of EDIT_TRACKS) {
      for (const row of desk.rows[track]) map.set(row.clip.id, row)
    }
    return map
  }, [desk.rows])

  return (
    <div
      data-testid="edit-desk-timeline"
      className="@container/composer relative flex shrink-0 flex-col gap-3 bg-background px-4 pb-3.5 pt-2.5"
    >
      {/* 走带行：播放 · 时间码 · 声音 ｜ 选中段的属性 ｜ 缩放。 */}
      <div className="flex h-9.5 min-w-0 items-center gap-3">
        <button
          type="button"
          data-testid="edit-desk-play"
          aria-label={playing ? t('pause') : t('play')}
          onClick={() => onPlayingChange(!playing)}
          disabled={!canPlay}
          className="grid size-8.5 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-colors duration-fast hover:bg-accent disabled:opacity-50"
        >
          {playing ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
        </button>
        <span
          data-testid="edit-desk-clock"
          className="shrink-0 font-mono text-2sm tabular-nums text-foreground/80"
        >
          {formatEditClock(desk.playheadSec, true)}
          <span className="text-muted-foreground/70">
            {' / '}
            {formatEditClock(desk.durationSec, true)}
          </span>
        </span>
        <EditDeskIconButton
          icon={muted ? VolumeX : Volume2}
          label={muted ? t('unmute') : t('mute')}
          active={muted}
          testId="edit-desk-mute"
          onClick={() => onMutedChange(!muted)}
        />
        {readOnly ? null : (
          <>
            <span className="h-4.5 w-px shrink-0 bg-border" aria-hidden />
            {props ?? <div className="flex-1" />}
            <div
              role="group"
              aria-label={t('zoom.label')}
              className="flex shrink-0 items-center gap-0.5"
            >
              <EditDeskIconButton
                icon={ZoomOut}
                label={t('zoom.out')}
                testId="edit-desk-zoom-out"
                disabled={zoom <= EDIT_TIMELINE_ZOOM.min}
                onClick={() => setZoom(zoom - EDIT_TIMELINE_ZOOM.step)}
              />
              <Slider
                data-testid="edit-desk-zoom"
                aria-label={t('zoom.label')}
                className="mx-1 w-20 @max-7xl/composer:hidden"
                min={EDIT_TIMELINE_ZOOM.min}
                max={EDIT_TIMELINE_ZOOM.max}
                step={EDIT_TIMELINE_ZOOM.step}
                value={[zoom]}
                onValueChange={([next]) => {
                  if (next !== undefined) setZoom(next)
                }}
              />
              <EditDeskIconButton
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
                className="ml-1 h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground aria-pressed:text-foreground @max-4xl/composer:hidden"
              >
                {t('zoom.fit')}
              </button>
            </div>
          </>
        )}
      </div>

      <div
        className="flex min-w-0 flex-col"
        {...(readOnly ? { inert: true } : {})}
        data-edit-desk-readonly={readOnly ? 'true' : 'false'}
      >
        {/* 全片条那一格一直留着：放大到装不下时才淡入，⛔ 出现时把时间线往下推。 */}
        <div
          className="relative min-w-0"
          style={{
            height: G.overviewPx,
            marginBottom: G.overviewGapPx,
            marginLeft: G.headWidthPx + 10,
          }}
        >
          <AnimatePresence>
            {overflowing ? (
              <OverviewStrip
                key="overview"
                rows={desk.rows[EDIT_TRACK_IDS.video]}
                layout={layout}
                spanSec={spanSec}
                canvasPx={canvasPx}
                viewportPx={viewportPx}
                scrollLeft={scrollLeft}
                playheadSec={desk.playheadSec}
                onScrollTo={(left) => {
                  const scroller = scrollRef.current
                  if (!scroller) return
                  scroller.scrollLeft = left
                  setScrollLeft(scroller.scrollLeft)
                }}
              />
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 gap-2.5">
          {/* 轨道名那一列：⛔ 不跟着横向滚 —— 放大后也要一眼看出哪条是哪条。 */}
          <div
            aria-hidden
            className="relative shrink-0"
            style={{ width: G.headWidthPx, height: LANE_TOP.bottom }}
          >
            <TrackHead
              label={t('tracks.text')}
              top={LANE_TOP.text}
              height={G.textPx}
            />
            {EDIT_TRACKS.map((track) => (
              <TrackHead
                key={track}
                label={t(`tracks.${track}`)}
                top={TRACK_LANE[track].top}
                height={TRACK_LANE[track].height}
              />
            ))}
          </div>

          <TimelineScaleContext.Provider value={scale}>
            <TimelineInteractionContext.Provider value={interaction}>
              <div
                ref={scrollRef}
                data-testid="edit-desk-timeline-scroll"
                onScroll={onScroll}
                className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
              >
                <div
                  ref={canvasRef}
                  className="relative min-w-full"
                  style={{ width: canvasPx, height: LANE_TOP.bottom }}
                >
                  <Ruler
                    spanSec={spanSec}
                    tickSec={tickSec}
                    minorSec={minorSec}
                    onScrub={startScrub}
                    onHover={onRulerHover}
                  />

                  <TextLane
                    desk={desk}
                    committed={committedLayout}
                    onBlankPointerDown={deselect}
                  />
                  {EDIT_TRACKS.map((track) => (
                    <TrackLane
                      key={track}
                      track={track}
                      desk={desk}
                      rowById={rowById}
                      committed={committedLayout}
                      secondsFromEvent={secondsFromEvent}
                      onBlankPointerDown={deselect}
                      onDropLibraryAsset={onDropLibraryAsset}
                    />
                  ))}
                  <Seams desk={desk} />
                  <LinkLines />

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
    </div>
  )
}

function TrackHead({
  label,
  top,
  height,
}: {
  readonly label: string
  readonly top: number
  readonly height: number
}) {
  return (
    <span
      className="absolute inset-x-0 flex items-center truncate pl-1 text-2xs text-muted-foreground"
      style={{ top, height }}
    >
      {label}
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
      className="absolute inset-x-0 top-0 cursor-ew-resize touch-none select-none border-b border-border"
      style={{ height: G.rulerPx }}
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
          <i className="absolute bottom-0 left-0 h-2 w-px bg-muted-foreground/50" />
          <span className="absolute bottom-1.5 left-1 whitespace-nowrap font-mono text-3xs text-muted-foreground/70">
            {formatEditClock(at)}
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * 全片条（v2 关键切片「借自 B」）：放大到装不下时，标尺上方一条整条片子的缩略，白框是
 * 你正在看的那一段；按下哪里就去哪里，拖白框就跟着滚。缩回铺满时淡出（220ms 上移 4px）。
 */
function OverviewStrip({
  rows,
  layout,
  spanSec,
  canvasPx,
  viewportPx,
  scrollLeft,
  playheadSec,
  onScrollTo,
}: {
  readonly rows: readonly EditTimelineRow[]
  readonly layout: TimelineLayout
  readonly spanSec: number
  readonly canvasPx: number
  readonly viewportPx: number
  readonly scrollLeft: number
  readonly playheadSec: number
  onScrollTo(scrollLeft: number): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  const reduceMotion = useReducedMotion()
  const stripRef = useRef<HTMLDivElement | null>(null)
  /** 时间线秒 / 滚动像素 → 全片条上的百分比。 */
  const pct = (seconds: number) =>
    `${Math.max(0, Math.min(100, (seconds / spanSec) * 100))}%`
  const windowLeft = (scrollLeft / canvasPx) * 100
  const windowWidth = Math.min(100, (viewportPx / canvasPx) * 100)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const strip = stripRef.current
    if (!strip) return
    const rect = strip.getBoundingClientRect()
    if (rect.width <= 0) return
    event.preventDefault()
    const ratio = canvasPx / rect.width
    const at = (event.clientX - rect.left) * ratio
    // 按在白框外 = 跳过去（白框居中）；按在白框里 = 抓住它拖。
    const inside = at >= scrollLeft && at <= scrollLeft + viewportPx
    const startLeft = inside ? scrollLeft : at - viewportPx / 2
    onScrollTo(startLeft)
    const startX = event.clientX
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    const move = (moveEvent: PointerEvent) =>
      onScrollTo(startLeft + (moveEvent.clientX - startX) * ratio)
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  return (
    <motion.div
      ref={stripRef}
      data-testid="edit-desk-overview"
      role="scrollbar"
      aria-label={t('overview')}
      aria-orientation="horizontal"
      aria-controls="edit-desk-timeline-scroll"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(windowLeft)}
      initial={{ opacity: 0, y: 4 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: reduceMotion ? 0 : DURATION.base },
      }}
      exit={{
        opacity: 0,
        y: 4,
        transition: { duration: reduceMotion ? 0 : DURATION.base },
      }}
      onPointerDown={onPointerDown}
      className="absolute inset-0 cursor-pointer touch-none overflow-hidden rounded-md bg-card ring-1 ring-inset ring-border"
    >
      {rows.map((row) => {
        const span = layout.clips.get(row.clip.id)
        if (!span) return null
        return (
          <OverviewClip
            key={row.clip.id}
            row={row}
            left={pct(span.startSec)}
            width={pct(span.durationSec)}
          />
        )
      })}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 rounded-md bg-foreground/7 ring-2 ring-inset ring-foreground/60"
        style={{ left: `${windowLeft}%`, width: `${windowWidth}%` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-px bg-primary"
        style={{ left: pct(playheadSec) }}
      />
    </motion.div>
  )
}

function OverviewClip({
  row,
  left,
  width,
}: {
  readonly row: EditTimelineRow
  readonly left: string
  readonly width: string
}) {
  const poster = useVideoPoster(
    row.source.url,
    row.source.version?.thumbnailUrl,
  )
  return (
    <span
      aria-hidden
      className="absolute inset-y-0.75 overflow-hidden rounded-xs bg-muted bg-cover bg-center opacity-75"
      style={{
        left,
        width,
        ...(poster ? { backgroundImage: `url(${poster})` } : {}),
      }}
    />
  )
}

/** 一条轨的底：放置区（拖进来）+ 空白处按下 = 取消选中 + 空着时一句提示。 */
function LaneBed({
  testId,
  top,
  height,
  empty,
  hint,
  bed,
  onPointerDown,
  onDragOver,
  onDragLeave,
  onDrop,
  dropping,
}: {
  readonly testId: string
  readonly top: number
  readonly height: number
  readonly empty: boolean
  readonly hint: string
  /** 主线有一层很淡的底（关键切片 `.lane-main`），别的轨没有。 */
  readonly bed?: boolean
  readonly dropping?: boolean
  onPointerDown(): void
  onDragOver?(event: React.DragEvent<HTMLDivElement>): void
  onDragLeave?(): void
  onDrop?(event: React.DragEvent<HTMLDivElement>): void
}) {
  return (
    <div
      data-testid={testId}
      onPointerDown={onPointerDown}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'absolute inset-x-0 rounded-lg transition-colors duration-fast',
        bed && 'bg-foreground/2',
        dropping && 'bg-surface-fill',
      )}
      style={{ top, height }}
    >
      {empty ? (
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-2xs text-muted-foreground/70">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

/** 字幕轨（S8d）：段是绝对定位的胶囊，挂在主线某一帧上（连接线往下连）。 */
function TextLane({
  desk,
  committed,
  onBlankPointerDown,
}: {
  readonly desk: EditDesk
  readonly committed: TimelineLayout
  onBlankPointerDown(): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  const { layout } = useTimelineInteraction()
  const reduceMotion = useReducedMotion()
  return (
    <>
      <LaneBed
        testId="edit-desk-track-text"
        top={LANE_TOP.text}
        height={G.textPx}
        empty={desk.project.tracks.text.length === 0}
        hint={t('tracks.textEmpty')}
        onPointerDown={onBlankPointerDown}
      />
      <AnimatePresence initial={false}>
        {desk.project.tracks.text.map((clip) => {
          const span = layout.texts.get(clip.id)
          if (!span) return null
          return (
            <TextClipView
              key={clip.id}
              clip={clip}
              span={span}
              committed={committed.texts.get(clip.id)}
              desk={desk}
              reduceMotion={Boolean(reduceMotion)}
            />
          )
        })}
      </AnimatePresence>
    </>
  )
}

/**
 * 段两端的裁剪区（owner 2026-09-28「拉长 / 缩短一段」）：**没选中也能直接拖** —— 鼠标
 * 移到段的两端，那根白手柄（中间一根黑色握线）就浮出来、光标变成左右箭头；选中的段
 * 两端一直亮着。命中区统一 `EDIT_TIMELINE_FEEL.edgeHitPx` 宽。
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
        'pointer-events-none absolute bottom-full z-30 mb-1.5 whitespace-nowrap rounded-md bg-primary px-2 font-mono text-2xs leading-5 text-primary-foreground shadow-float',
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

/** 挂件跟着谁动：换位时被拖的那一段上挂着的台词、字幕一起跟手。 */
function useFollowsLift(attach: EditAttachment | undefined): boolean {
  const { lift } = useTimelineInteraction()
  return Boolean(lift && attach?.clipId === lift.id)
}

/** 段删掉时缩小淡出（关键切片动效表「删镜头 260ms」），随后后面的段合拢。 */
function exitMotion(reduceMotion: boolean) {
  return {
    opacity: 0,
    scale: 0.92,
    transition: { duration: reduceMotion ? 0 : DURATION.base },
  }
}

/**
 * 一段字幕。点 = 选中 · 按住拖 = 挪位置（按落点重新挂）· 拖两端 = 改入出点；拖的时候
 * 段头段尾贴近播放头或别的段就吸上去。⌫ / S 在台面上（键盘不归时间线管）。
 */
function TextClipView({
  clip,
  span,
  committed,
  desk,
  reduceMotion,
}: {
  readonly clip: EditTextClip
  readonly span: TimelineSpan
  /** 落表那一份（拖动预览开始前），裁剪读数与换挂点比较读它。 */
  readonly committed: TimelineSpan | undefined
  readonly desk: EditDesk
  readonly reduceMotion: boolean
}) {
  const t = useTranslations('StudioNode.editDesk')
  const scale = useTimelineScale()
  const {
    layout,
    preview,
    animate,
    liftShiftPx,
    snap,
    setGuide,
    setDrag,
    landAttachment,
  } = useTimelineInteraction()
  const selected = desk.textSelectionId === clip.id
  const own = preview?.kind === 'text' && preview.clipId === clip.id
  const follows = useFollowsLift(span.attach)
  const cut = isAttachmentCut(layout.project, span.attach)

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
      const ownEdges = [origin.startSec, origin.startSec + origin.durationSec]

      const nextOf = (
        deltaPx: number,
      ): { startSec: number; durationSec: number; guide: number | null } => {
        const delta = scale.toSeconds(deltaPx)
        if (mode === 'move') {
          const start = Math.max(0, origin.startSec + delta)
          const byStart = snap(start, ownEdges)
          if (byStart !== null) {
            return {
              startSec: byStart,
              durationSec: origin.durationSec,
              guide: byStart,
            }
          }
          const byEnd = snap(start + origin.durationSec, ownEdges)
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
          const snapped = snap(raw, ownEdges)
          const startSec = Math.max(
            0,
            Math.min(snapped ?? raw, end - EDIT_TEXT_CLIP_MIN_DURATION_SEC),
          )
          return { startSec, durationSec: end - startSec, guide: snapped }
        }
        const raw = end + delta
        const snapped = snap(raw, ownEdges)
        return {
          startSec: origin.startSec,
          durationSec: Math.max(
            EDIT_TEXT_CLIP_MIN_DURATION_SEC,
            (snapped ?? raw) - origin.startSec,
          ),
          guide: snapped,
        }
      }
      const previewOf = (next: {
        startSec: number
        durationSec: number
      }): TimelineDragPreview => ({
        kind: 'text',
        clipId: clip.id,
        startSec: next.startSec,
        durationSec: next.durationSec,
        // 起点动了 = 按落点重新挂（与 op 执行器同一条）；只裁尾巴不换挂点。
        reattach: mode !== 'out',
      })

      followPointer(event, {
        onMove: (deltaPx) => {
          const next = nextOf(deltaPx)
          setGuide(next.guide)
          setDrag({ preview: previewOf(next) })
        },
        onEnd: (deltaPx, dragged) => {
          setGuide(null)
          if (!dragged) {
            setDrag(null)
            return
          }
          const next = nextOf(deltaPx)
          const landed = buildTimelineLayout(
            desk.project,
            previewOf(next),
          ).texts.get(clip.id)
          desk.updateTextClip(clip.id, {
            startSec: next.startSec,
            durationSec: next.durationSec,
          })
          setDrag(null)
          landAttachment(clip.id, committed?.attach, landed?.attach)
        },
        onCancel: () => {
          setGuide(null)
          setDrag(null)
        },
      })
    }

  const firstLine = clip.text.split('\n')[0] ?? ''
  const readoutEdge: 'in' | 'out' | null =
    own && preview.durationSec !== clip.durationSec
      ? preview.startSec !== clip.startSec
        ? 'in'
        : 'out'
      : null

  return (
    <motion.div
      className={cn(
        'absolute',
        animate && !own && !follows && 'transition-magnetic',
        own && 'z-30',
      )}
      style={{
        top: LANE_TOP.text,
        left: scale.toPx(span.startSec),
        width: Math.max(
          scale.toPx(span.durationSec),
          EDIT_DESK_LAYOUT.handleWidthPx * 4,
        ),
        height: G.textPx,
        x: follows ? liftShiftPx : 0,
      }}
      exit={exitMotion(reduceMotion)}
    >
      {readoutEdge ? (
        <TrimReadout
          edge={readoutEdge}
          text={t('trim', {
            edge: t(
              readoutEdge === 'in' ? 'inspector.inPoint' : 'inspector.outPoint',
            ),
            from: formatEditClock(
              readoutEdge === 'in'
                ? clip.startSec
                : clip.startSec + clip.durationSec,
              true,
            ),
            to: formatEditClock(
              readoutEdge === 'in'
                ? span.startSec
                : span.startSec + span.durationSec,
              true,
            ),
            length: span.durationSec.toFixed(1),
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
          'relative flex size-full cursor-grab touch-none select-none items-center gap-1.5 overflow-hidden rounded-sm bg-foreground/10 px-2 text-2xs text-foreground/80 ring-1 ring-inset ring-foreground/15 transition-[box-shadow,opacity] duration-fast hover:ring-foreground/40',
          selected && 'ring-2 ring-primary hover:ring-primary',
          own &&
            '-translate-y-1 cursor-grabbing shadow-overlay ring-2 ring-primary',
          // 断挂：挂点那一帧被裁掉了，导出时不出字 —— 半透明留在原处。
          cut && !own && 'opacity-30',
        )}
      >
        <span className="shrink-0 font-mono text-3xs font-semibold text-muted-foreground">
          T
        </span>
        <span className="truncate">{firstLine}</span>
        <TrimHandle
          edge="in"
          testId={`edit-desk-text-handle-in-${clip.id}`}
          label={t('inspector.inPoint')}
          value={span.startSec}
          selected={selected}
          onPointerDown={startDrag('in')}
        />
        <TrimHandle
          edge="out"
          testId={`edit-desk-text-handle-out-${clip.id}`}
          label={t('inspector.outPoint')}
          value={span.startSec + span.durationSec}
          selected={selected}
          onPointerDown={startDrag('out')}
        />
      </div>
    </motion.div>
  )
}

function TrackLane({
  track,
  desk,
  rowById,
  committed,
  secondsFromEvent,
  onBlankPointerDown,
  onDropLibraryAsset,
}: {
  readonly track: EditTrackId
  readonly desk: EditDesk
  readonly rowById: ReadonlyMap<string, EditTimelineRow>
  readonly committed: TimelineLayout
  secondsFromEvent(clientX: number): number
  onBlankPointerDown(): void
  onDropLibraryAsset(
    asset: EditDeskLibraryAsset,
    track: EditTrackId,
    index: number,
    startSec: number,
  ): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  const { layout } = useTimelineInteraction()
  const reduceMotion = useReducedMotion()
  const [dropping, setDropping] = useState(false)
  const lane = TRACK_LANE[track]
  const order = layout.order[track]

  return (
    <>
      <LaneBed
        testId={`edit-desk-track-${track}`}
        top={lane.top}
        height={lane.height}
        bed={track === EDIT_TRACK_IDS.video}
        dropping={dropping}
        empty={desk.rows[track].length === 0}
        hint={t('tracks.empty')}
        onPointerDown={onBlankPointerDown}
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
          const seconds = secondsFromEvent(event.clientX)
          const index = desk.insertIndexAt(track, seconds)
          // 素材库那一条**还没有卡**：交回台面先建卡（⛔ 段不指向素材库记录）。
          const asset = parseEditDeskLibraryAsset(
            event.dataTransfer.getData(EDIT_DESK_LIBRARY_DRAG_MIME),
          )
          if (asset) {
            event.preventDefault()
            onDropLibraryAsset(asset, track, index, seconds)
            return
          }
          const nodeId =
            event.dataTransfer.getData(EDIT_DESK_NODE_DRAG_MIME) ||
            event.dataTransfer.getData('text/plain')
          if (!nodeId) return
          event.preventDefault()
          desk.dropNode(nodeId, track, index, { startSec: seconds })
        }}
      />
      <AnimatePresence initial={false}>
        {order.map((clipId) => {
          const row = rowById.get(clipId)
          const span = layout.clips.get(clipId)
          if (!row || !span) return null
          return (
            <ClipView
              key={clipId}
              row={row}
              track={track}
              span={span}
              committed={committed}
              desk={desk}
              reduceMotion={Boolean(reduceMotion)}
            />
          )
        })}
      </AnimatePresence>
    </>
  )
}

function ClipView({
  row,
  track,
  span,
  committed,
  desk,
  reduceMotion,
}: {
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  /** 此刻画在哪（拖动预览那一份）。 */
  readonly span: TimelineSpan
  /** 落表那一份 —— 换位的中心点、裁剪起点、换挂点比较都读它。 */
  readonly committed: TimelineLayout
  readonly desk: EditDesk
  readonly reduceMotion: boolean
}) {
  const t = useTranslations('StudioNode.editDesk')
  const scale = useTimelineScale()
  const {
    layout,
    preview,
    lift,
    liftShiftPx,
    hostId,
    animate,
    snap,
    setGuide,
    setDrag,
    landAttachment,
  } = useTimelineInteraction()
  const clip = row.clip
  const isVideo = track === EDIT_TRACK_IDS.video
  const isMusic = track === EDIT_TRACK_IDS.music
  /** 台词轨（v2 第 1 片）：段按自己的起点摆，拖 = 改起点，⛔ 不是换顺序。 */
  const positioned = isPositionedTrack(track)
  const lane = TRACK_LANE[track]
  const selected = desk.selection?.clipId === clip.id
  const lifted = lift?.id === clip.id
  const follows = useFollowsLift(span.attach)
  const trimming =
    preview?.kind === 'trim' && preview.clipId === clip.id ? preview : null
  const shifting = preview?.kind === 'shift' && preview.clipId === clip.id
  const own = lifted || trimming !== null || shifting
  const gone = !row.source.exists
  const cut = isAttachmentCut(layout.project, span.attach)
  const speed = clip.speed || 1
  const shown = trimming ? { in: trimming.in, out: trimming.out } : clip
  const widthPx = Math.max(
    scale.toPx(span.durationSec),
    EDIT_DESK_LAYOUT.handleWidthPx * 3,
  )
  const sourceName = readSourceName(row)
  const sourceData = row.source.node?.data
  // 卡上记的时长是**当前版**的：段在用别的版时不拿它当裁剪上限。
  const sourceDurationSec =
    !row.source.stale &&
    sourceData &&
    (sourceData.kind === NODE_MEDIA_KIND_IDS.video ||
      sourceData.kind === NODE_MEDIA_KIND_IDS.audio)
      ? sourceData.durationSec
      : undefined
  const takes = isVideo && !gone ? readClipTakes(row) : null
  /** 这一段在重拍（4b）：生成中画光带，失败描红 + 「!」。 */
  const retake = isVideo ? desk.retakes.get(clip.id) : undefined
  const generating = retake?.status === 'generating'
  const failed = retake?.status === 'failed'
  const committedSpan = committed.clips.get(clip.id) ?? span

  /**
   * 裁剪：拖左端改入点、拖右端改出点。首尾相接的轨上这一段的起点不动，变的是**它的
   * 尾巴**（后面的段跟着补位），所以两种拖法吸附的都是尾巴那条边；按起点摆的轨（台词）
   * 拖左端时左边沿跟手、尾巴不动。
   */
  const startTrim =
    (edge: 'in' | 'out') => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.preventDefault()
      desk.select({ track, clipId: clip.id })
      const origin = { in: clip.in, out: clip.out }
      const rowStart = committedSpan.startSec
      const ownEnd = rowStart + committedSpan.durationSec

      const nextOf = (deltaPx: number) => {
        const delta = scale.toSeconds(deltaPx) * speed
        if (positioned && edge === 'in') {
          const rawIn = origin.in + delta
          const snappedStart = snap(rowStart + (rawIn - origin.in) / speed, [
            rowStart,
            ownEnd,
          ])
          const nextIn =
            snappedStart === null
              ? rawIn
              : origin.in + (snappedStart - rowStart) * speed
          const clamped = clampTrim(clip, { in: nextIn }, sourceDurationSec)
          return {
            ...clamped,
            startSec: Math.max(0, rowStart + (clamped.in - origin.in) / speed),
            guide: snappedStart,
          }
        }
        const raw =
          edge === 'in'
            ? { in: origin.in + delta, out: origin.out }
            : { in: origin.in, out: origin.out + delta }
        const rawEnd = rowStart + (raw.out - raw.in) / speed
        const snappedEnd = snap(rawEnd, [rowStart, ownEnd])
        const patched =
          snappedEnd === null
            ? raw
            : edge === 'in'
              ? {
                  in: origin.out - (snappedEnd - rowStart) * speed,
                  out: origin.out,
                }
              : {
                  in: origin.in,
                  out: origin.in + (snappedEnd - rowStart) * speed,
                }
        const clamped = clampTrim(
          clip,
          edge === 'in' ? { in: patched.in } : { out: patched.out },
          sourceDurationSec,
        )
        return { ...clamped, startSec: undefined, guide: snappedEnd }
      }
      const previewOf = (next: {
        in: number
        out: number
        startSec: number | undefined
      }): TimelineDragPreview => ({
        kind: 'trim',
        track,
        clipId: clip.id,
        in: next.in,
        out: next.out,
        ...(next.startSec === undefined ? {} : { startSec: next.startSec }),
      })

      followPointer(event, {
        onMove: (deltaPx) => {
          const next = nextOf(deltaPx)
          setGuide(next.guide)
          setDrag({ preview: previewOf(next) })
        },
        onEnd: (deltaPx, dragged) => {
          setGuide(null)
          if (!dragged) {
            setDrag(null)
            return
          }
          const next = nextOf(deltaPx)
          const landed = buildTimelineLayout(
            desk.project,
            previewOf(next),
          ).clips.get(clip.id)
          desk.updateClip(
            track,
            clip.id,
            edge === 'in'
              ? {
                  in: next.in,
                  ...(next.startSec === undefined
                    ? {}
                    : { startSec: next.startSec }),
                }
              : { out: next.out },
          )
          setDrag(null)
          if (positioned) {
            landAttachment(clip.id, committedSpan.attach, landed?.attach)
          }
        },
        onCancel: () => {
          setGuide(null)
          setDrag(null)
        },
      })
    }

  /**
   * 按住段拖：首尾相接的轨 = 换位置（段跟手、邻段实时让位，挂件跟着各自的段走，松手
   * 才发一条 `edit_move_clip`）；台词轨 = 改起点，按落点重新挂。⛔ 不用浏览器原生拖放
   * —— 那是拖一张半透明截图、松手才换位，看不见会落在哪。
   */
  const beginMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    desk.select({ track, clipId: clip.id })
    if (positioned) {
      const rowStart = committedSpan.startSec
      const own = [rowStart, rowStart + committedSpan.durationSec]
      const startOf = (deltaPx: number) => {
        const raw = Math.max(0, rowStart + scale.toSeconds(deltaPx))
        const byStart = snap(raw, own)
        if (byStart !== null) return { start: byStart, guide: byStart }
        const byEnd = snap(raw + committedSpan.durationSec, own)
        if (byEnd !== null) {
          return {
            start: Math.max(0, byEnd - committedSpan.durationSec),
            guide: byEnd,
          }
        }
        return { start: raw, guide: null }
      }
      const previewOf = (start: number): TimelineDragPreview => ({
        kind: 'shift',
        track,
        clipId: clip.id,
        startSec: start,
      })
      followPointer(event, {
        onMove: (deltaPx) => {
          const next = startOf(deltaPx)
          setGuide(next.guide)
          setDrag({ preview: previewOf(next.start) })
        },
        onEnd: (deltaPx, dragged) => {
          setGuide(null)
          if (!dragged) {
            setDrag(null)
            return
          }
          const next = startOf(deltaPx)
          if (Math.abs(next.start - rowStart) < EDIT_ATTACH_EPSILON_SEC) {
            setDrag(null)
            return
          }
          const landed = buildTimelineLayout(
            desk.project,
            previewOf(next.start),
          ).clips.get(clip.id)
          desk.updateClip(track, clip.id, { startSec: next.start })
          setDrag(null)
          landAttachment(clip.id, committedSpan.attach, landed?.attach)
        },
        onCancel: () => {
          setGuide(null)
          setDrag(null)
        },
      })
      return
    }
    const ids = committed.order[track]
    const centers = ids.map((id) => {
      const candidate = committed.clips.get(id)
      return candidate ? candidate.startSec + candidate.durationSec / 2 : 0
    })
    const from = ids.indexOf(clip.id)
    const targetOf = (deltaPx: number) => {
      const center = (centers[from] ?? 0) + scale.toSeconds(deltaPx)
      return ids.filter(
        (id, index) => index !== from && (centers[index] ?? 0) < center,
      ).length
    }
    followPointer(event, {
      onMove: (deltaPx) =>
        setDrag({
          preview: {
            kind: 'move',
            track,
            clipId: clip.id,
            toIndex: targetOf(deltaPx),
          },
          lift: { id: clip.id, originSec: committedSpan.startSec, deltaPx },
        }),
      onEnd: (deltaPx, dragged) => {
        if (dragged) {
          const to = targetOf(deltaPx)
          if (to !== from) desk.moveClip(track, clip.id, to)
        }
        setDrag(null)
      },
      onCancel: () => setDrag(null),
    })
  }

  const readoutEdge: 'in' | 'out' | null = trimming
    ? trimming.in !== clip.in
      ? 'in'
      : 'out'
    : null

  return (
    <motion.div
      className={cn(
        'absolute',
        animate && !own && !follows && 'transition-magnetic',
        own && 'z-30',
        // 断挂：挂点那一帧被裁掉了，导出时不出声 —— 半透明留在原处。
        cut && !own && 'opacity-30',
      )}
      style={{
        top: lane.top,
        left: scale.toPx(span.startSec),
        width: widthPx,
        height: lane.height,
        x: lifted || follows ? liftShiftPx : 0,
        y: lifted ? -6 : shifting ? -4 : 0,
      }}
      exit={exitMotion(reduceMotion)}
    >
      {readoutEdge ? (
        <TrimReadout
          edge={readoutEdge}
          text={t('trim', {
            edge: t(
              readoutEdge === 'in' ? 'inspector.inPoint' : 'inspector.outPoint',
            ),
            from: formatEditClock(
              readoutEdge === 'in' ? clip.in : clip.out,
              true,
            ),
            to: formatEditClock(
              readoutEdge === 'in' ? shown.in : shown.out,
              true,
            ),
            length: ((shown.out - shown.in) / speed).toFixed(1),
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
        onPointerDown={beginMove}
        onKeyDown={(event) => {
          if (event.key === 'Enter') desk.select({ track, clipId: clip.id })
        }}
        className={cn(
          'relative size-full cursor-grab touch-none select-none overflow-hidden transition-shadow duration-fast',
          isVideo
            ? cn(
                'rounded-md hover:ring-1 hover:ring-foreground/30',
                gone ? 'edit-clip-gone' : 'bg-card',
              )
            : isMusic
              ? 'rounded-md bg-foreground/4 ring-1 ring-inset ring-foreground/10 hover:ring-foreground/30'
              : 'rounded-sm bg-surface-workbench ring-1 ring-inset ring-foreground/30 hover:ring-foreground/50',
          selected && 'ring-2 ring-primary hover:ring-2 hover:ring-primary',
          // 拖台词 / 字幕时松手会挂上的那一段：虚线框，与白色选中环分得开。
          hostId === clip.id &&
            'outline-2 outline-offset-1 outline-dashed outline-foreground',
          lifted && 'cursor-grabbing shadow-overlay ring-2 ring-primary',
          generating && 'edit-clip-generating',
          failed &&
            'outline-2 -outline-offset-2 outline-status-risk transition duration-base',
        )}
      >
        {isVideo ? (
          <ClipFilmstrip
            row={row}
            shown={shown}
            widthPx={widthPx}
            dimmed={generating}
          />
        ) : isMusic ? (
          <MusicWave row={row} widthPx={widthPx} />
        ) : null}

        {isVideo ? (
          gone ? (
            <span className="absolute left-2 top-1 truncate text-2xs text-status-risk">
              {t('inspector.sourceGone')}
            </span>
          ) : (
            // 压在画面上的读数：固定明暗（ui-defaults §2.4 媒体 chrome 例外）。
            <span className="pointer-events-none absolute left-1.5 top-1 max-w-3/4 truncate rounded-sm bg-neutral-950/65 px-1.5 text-2xs leading-4 text-white">
              <b className="mr-1 font-semibold">{row.index + 1}</b>
              {sourceName}
            </span>
          )
        ) : isMusic ? (
          <span className="pointer-events-none absolute left-1.5 top-1 max-w-3/4 truncate rounded-sm bg-neutral-950/55 px-1.5 text-3xs leading-4 text-muted-foreground">
            {sourceName}
          </span>
        ) : (
          <span className="pointer-events-none absolute inset-y-0 left-2 right-2 flex items-center truncate text-2xs font-medium text-foreground/85">
            {sourceName}
          </span>
        )}

        {isMusic ? (
          // 配乐的音量线：1 = 原样，画在中线偏上；2 倍贴顶、0 贴底。
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 h-px bg-foreground/45"
            style={{
              top: `${Math.min(90, Math.max(10, (1 - (clip.gain ?? 1) / 2) * 100))}%`,
            }}
          />
        ) : null}

        {generating ? (
          <span
            data-testid={`edit-desk-retaking-${clip.id}`}
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-1/2 whitespace-nowrap rounded-full bg-neutral-950/72 px-2 text-2xs leading-4.5 text-status-warning"
          >
            {t('retake.generating')}
          </span>
        ) : null}

        {failed ? (
          // 重拍失败：点「!」= 选中这一段并升起它的重拍栏（栏顶写原因）。
          <button
            type="button"
            data-testid={`edit-desk-retake-failed-${clip.id}`}
            aria-label={t('retake.failedBadge')}
            title={t('retake.failedBadge')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              desk.openRetake(track, clip.id)
            }}
            className="absolute right-1.5 top-1 z-10 grid size-4 place-items-center rounded-full bg-status-risk font-mono text-3xs font-bold text-background animate-in fade-in duration-200"
          >
            !
          </button>
        ) : takes && (takes.count > 1 || takes.fresh) ? (
          // 段角版本读数（关键切片 `.cl-take`）：压在画面上，固定明暗（ui-defaults §2.4）。
          <EditClipVersionsPopover
            desk={desk}
            row={row}
            track={track}
            align="end"
          >
            <button
              type="button"
              data-testid={`edit-desk-takes-${clip.id}`}
              aria-label={t(
                takes.fresh ? 'versions.badgeFresh' : 'versions.badge',
                { n: takes.n, count: takes.count },
              )}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                desk.select({ track, clipId: clip.id })
              }}
              className="absolute right-1.5 top-1 z-10 flex items-center gap-1 rounded-sm bg-neutral-950/70 px-1.5 font-mono text-3xs leading-4 tabular-nums text-white/80 transition-colors duration-fast hover:bg-white hover:text-neutral-950"
            >
              {takes.n}/{takes.count}
              {takes.fresh ? (
                <span
                  aria-hidden
                  className="size-1.25 rounded-full bg-current"
                />
              ) : null}
            </button>
          </EditClipVersionsPopover>
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
    </motion.div>
  )
}

/**
 * 段间菱形（关键切片 `.seam`）：压在主线上沿两段的接缝处，实心 = 有转场。叠化横跨接缝
 * 画一块淡光，宽 = 两段重叠的秒数。菱形也是**落点**：从左列转场页拖一个预设过来 = 设
 * **前一段**的 `transitionOut`。⚠ 命中区靠一层透明覆盖放大，⛔ 不把菱形本身画大。
 */
function Seams({ desk }: { readonly desk: EditDesk }) {
  const scale = useTimelineScale()
  const { layout, animate, lift } = useTimelineInteraction()
  const order = layout.order[EDIT_TRACK_IDS.video]
  const byId = new Map(
    desk.project.tracks[EDIT_TRACK_IDS.video].map((clip) => [clip.id, clip]),
  )
  return (
    <>
      {order.slice(0, -1).map((clipId) => {
        const clip = byId.get(clipId)
        const span = layout.clips.get(clipId)
        if (!clip || !span) return null
        const at = scale.toPx(span.startSec + span.durationSec)
        const overlapPx =
          (clip.transitionOut ?? EDIT_TRANSITION_IDS.none) ===
          EDIT_TRANSITION_IDS.crossfade
            ? scale.toPx(RENDER_CROSSFADE_SEC)
            : 0
        // 换位途中被拖的那一段两侧的菱形先藏起来（它跟着指针走，菱形对不上）。
        const hidden = lift !== null
        return (
          <SeamMark
            key={clipId}
            clip={clip}
            at={at}
            overlapPx={overlapPx}
            hidden={hidden}
            animate={animate}
            onSet={(transition) =>
              desk.updateClip(EDIT_TRACK_IDS.video, clip.id, {
                transitionOut: transition,
              })
            }
          />
        )
      })}
    </>
  )
}

function SeamMark({
  clip,
  at,
  overlapPx,
  hidden,
  animate,
  onSet,
}: {
  readonly clip: EditClip
  readonly at: number
  readonly overlapPx: number
  readonly hidden: boolean
  readonly animate: boolean
  onSet(transition: (typeof EDIT_TRANSITIONS)[number]): void
}) {
  const t = useTranslations('StudioNode.editDesk')
  const [over, setOver] = useState(false)
  const current = clip.transitionOut ?? EDIT_TRANSITION_IDS.none
  return (
    <>
      {overlapPx > 0 ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-5 border-x border-foreground/25 bg-linear-to-r from-transparent via-foreground/20 to-transparent',
            animate && 'transition-magnetic',
            hidden && 'opacity-0',
          )}
          style={{
            top: LANE_TOP.video,
            height: G.videoPx,
            left: at - overlapPx / 2,
            width: overlapPx,
          }}
        />
      ) : null}
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
          top: LANE_TOP.video - G.seamPx / 2,
          left: at - G.seamPx / 2,
          width: G.seamPx,
          height: G.seamPx,
        }}
        className={cn(
          'absolute z-10 rotate-45 rounded-xs ring-2 ring-background',
          'after:absolute after:-inset-2 after:content-[""]',
          current === EDIT_TRANSITION_IDS.none
            ? 'border border-input bg-muted'
            : 'bg-foreground/80',
          animate && 'transition-magnetic',
          over && 'outline outline-[1.5px] outline-offset-2 outline-primary',
          hidden && 'opacity-0',
        )}
      />
    </>
  )
}

/**
 * 挂件的连接线（关键切片 `.lk`）：字幕从下沿往下连到主线上沿，台词从上沿往上连到主线
 * 下沿，主线那一头一颗小圆点。断挂 = 跟着挂件半透明；刚换了挂点 = 亮一下。
 * ⚠ 颜色取对暗地台刚好过 3:1 的那一档（图形门槛，方向稿实算）。
 */
function LinkLines() {
  const scale = useTimelineScale()
  const { layout, animate, lift, liftShiftPx, glowId, preview } =
    useTimelineInteraction()
  const reduceMotion = useReducedMotion()
  const items: {
    id: string
    span: TimelineSpan
    kind: 'text' | 'audio'
  }[] = []
  for (const [id, span] of layout.texts) {
    if (span.attach) items.push({ id, span, kind: 'text' })
  }
  for (const id of layout.order[EDIT_TRACK_IDS.audio]) {
    const span = layout.clips.get(id)
    if (span?.attach) items.push({ id, span, kind: 'audio' })
  }
  return (
    <AnimatePresence initial={false}>
      {items.map(({ id, span, kind }) => {
        const follows = Boolean(lift && span.attach?.clipId === lift.id)
        const dragging =
          (preview?.kind === 'text' || preview?.kind === 'shift') &&
          preview.clipId === id
        const cut = isAttachmentCut(layout.project, span.attach)
        const glowing = glowId === id || dragging
        const top =
          kind === 'text'
            ? LANE_TOP.text + G.textPx
            : LANE_TOP.video + G.videoPx
        const height =
          kind === 'text' ? LANE_TOP.video - top : LANE_TOP.audio - top
        return (
          <motion.span
            key={`${kind}:${id}`}
            aria-hidden
            data-testid={`edit-desk-link-${id}`}
            className={cn(
              'pointer-events-none absolute z-4 w-px',
              glowing ? 'bg-primary' : 'bg-foreground/40',
              animate && !follows && !dragging && 'transition-magnetic',
              cut && !dragging && 'opacity-30',
            )}
            style={{
              top,
              height,
              left: scale.toPx(span.startSec) + G.linkInsetPx,
              x: follows ? liftShiftPx : 0,
            }}
            exit={{
              opacity: 0,
              transition: { duration: reduceMotion ? 0 : DURATION.base },
            }}
          >
            <i
              className={cn(
                'absolute -left-0.5 size-1.25 rounded-full bg-inherit',
                kind === 'text' ? '-bottom-0.5' : '-top-0.5',
              )}
            />
          </motion.span>
        )
      })}
    </AnimatePresence>
  )
}

/**
 * 主线段里那排缩略帧：按轨高的 16:9 宽度铺，帧数有上限（多了就拉宽）。帧是这一段在
 * 那一刻的画面（自家 CDN 边缘截帧，时间取整到 `stepSec`）；截不了就用封面帧铺满。
 */
function ClipFilmstrip({
  row,
  shown,
  widthPx,
  dimmed = false,
}: {
  readonly row: EditTimelineRow
  readonly shown: { readonly in: number; readonly out: number }
  readonly widthPx: number
  /** 重拍生成中：压暗去色（关键切片动效表「生成中」）。 */
  readonly dimmed?: boolean
}) {
  const url = row.source.url
  const poster = useVideoPoster(url, row.source.version?.thumbnailUrl)
  const frameWidthPx = (G.videoPx * 16) / 9
  const count = Math.min(
    EDIT_DESK_CLIP_FRAME_MAX,
    Math.max(1, Math.ceil(widthPx / frameWidthPx)),
  )
  const step = EDIT_TIMELINE_FILMSTRIP.stepSec
  const frames = Array.from({ length: count }, (_, index) => {
    const at =
      shown.in + ((index + 0.5) / count) * Math.max(0, shown.out - shown.in)
    const sec = Math.min(
      Math.max(shown.in, Math.round(at / step) * step),
      Math.max(shown.in, shown.out - step / 2),
    )
    return (
      getVideoFrameUrl(url, sec, EDIT_TIMELINE_FILMSTRIP.frameWidthPx) ?? poster
    )
  })
  if (frames.every((frame) => !frame)) return null
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 flex transition duration-base',
        dimmed && 'brightness-40 grayscale',
      )}
    >
      {frames.map((frame, index) => (
        <span
          key={index}
          className="min-w-0 flex-1 border-r border-neutral-950/35 bg-cover bg-center"
          style={frame ? { backgroundImage: `url(${frame})` } : undefined}
        />
      ))}
    </div>
  )
}

/** 配乐段里那条波形（复用音频卡那一只）。 */
function MusicWave({
  row,
  widthPx,
}: {
  readonly row: EditTimelineRow
  readonly widthPx: number
}) {
  const url = row.source.url
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-1 inset-y-0 flex items-center pt-3 opacity-60"
    >
      <AudioWaveform
        seed={url ?? row.clip.sourceNodeId}
        barCount={Math.max(
          4,
          Math.floor(widthPx / EDIT_DESK_LAYOUT.waveBarPitchPx),
        )}
        height={G.musicPx - 22}
        className="w-full"
      />
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
