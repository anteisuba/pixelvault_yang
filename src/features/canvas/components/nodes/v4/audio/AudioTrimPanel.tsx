'use client'

/**
 * 音频**裁剪条**（spec §4，画板 `AudioTrim.dc.html`，2026-09-10 owner 参照即梦改）。
 *
 * 点了工具条那颗剪刀，卡下方的**提示词栏换成这一条**（⛔ 不是又一个对话框）：
 * 640 宽玻璃条，上半整条波形变淡、选区是一扇白底亮窗（窗内波形黑、两端黑色方
 * 括号手柄、窗顶写选区时长），下半一行「播放键 + 当前 / 选区时长 + 选区区间」
 * 与右侧「Esc 取消 · 确认」。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **纯呈现 + 受控**：不认识节点、不发 op、不上传。它只吐一对入出点秒数，切采样
 *    与编 WAV 在 `src/lib/audio-trim.ts`，落版本在调用方。
 * ② **非破坏**：确认落的是**新一版**，原音留作上一版 —— ⛔ 不提供任何覆盖原音的
 *    路径。
 * ③ **试听只播选区**：`<audio>` 的 `currentTime` 被夹在 `[入, 出)` 里循环，
 *    ⛔ 不放全曲（那样手柄拖到哪儿都听不出差别）。
 *
 * ⚠ 选区窗里那层黑波形是**整条淡波形的同一份**，靠 `left: -窗左` 平移后被窗口裁掉
 * 两边。⛔ 不另画一条属于选区的波形：两条波对不齐，拖窗时窗里的形状会自己跳。
 *
 * ── 视频卡也用这一条（node-canvas-v2 §4 shot，owner 2026-11-03）─────────────
 * 「与音频裁剪同款」：轨道里画的换成**胶片**（`renderTrack`），试听换成**卡上那只
 * `<video>`**（`previewRef`）——画面在卡上动、播放头停着时卡上就是手柄那一帧。
 * 其余（窗 / 手柄 / I O / 空格 / ⌘Z / Esc / 最短选区）一行不分叉：⛔ 不复制一份
 * 「视频裁剪条」，两份迟早手感对不上。
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { useTranslations } from 'next-intl'
import { Pause, Play } from '@/components/icons'

import { NODE_V4_AUDIO_TRIM } from '@/constants/node-studio'
import type { AudioTrimRange } from '@/lib/audio-trim'
import { cn } from '@/lib/utils'

import {
  buildAudioWaveformBars,
  formatAudioClock,
  formatAudioTrimDuration,
} from './audio-node-model'

export interface AudioTrimPanelProps {
  /** 当前这一版的地址（试听与「确认」都对着它）。 */
  readonly url: string
  /** 整段时长（秒）。⚠ ≤ 0 时面板没有可拖的坐标系，调用方不该打开它。 */
  readonly durationSec: number
  /** 波形种子 —— 与矮卡同一颗，两处画出来才是同一条波。 */
  readonly seed: string
  /** 正在切 / 传（确认键转成禁用）。 */
  readonly busy?: boolean
  /**
   * 轨道里画什么（缺省 = 波形）。两层是**同一份**：`faint` 铺满整条轨道、
   * `selected` 被选区窗裁着看 —— 返回的东西要铺满轨道宽（`trackWidth`）才对得齐。
   */
  readonly renderTrack?: (tone: TrimTone) => ReactNode
  /**
   * 试听放在外面那只媒体上（视频卡：画面在卡上动）。缺省 = 条内一只隐藏的
   * `<audio>`。⚠ 那只元素要和面板同时挂着（同一次提交里挂上）。
   */
  readonly previewRef?: RefObject<HTMLMediaElement | null>
  onCancel(): void
  onConfirm(range: AudioTrimRange): void
  readonly className?: string
}

/** 拖的是哪一端。 */
const TRIM_HANDLE = { start: 'start', end: 'end' } as const
type TrimHandle = (typeof TRIM_HANDLE)[keyof typeof TRIM_HANDLE]

/** 轨道两层：整条淡的那份、被选区窗裁着看的那份。 */
export type TrimTone = 'faint' | 'selected'

/** 外部媒体停着时，播放头与它差多少秒才去拨它（拨得太勤会一直解码）。 */
const PREVIEW_SEEK_EPSILON_SEC = 0.04

/**
 * 这一手正在拖什么。
 * - `handle` 改一端 = 改时长；
 * - `window` 整窗平移 = **时长不变**（画板那句「拖窗身整体平移」）；
 * - `marquee` 在淡波形上拖出新窗（松手替换旧窗）。
 */
type TrimDrag =
  | { readonly mode: 'handle'; readonly handle: TrimHandle }
  | {
      readonly mode: 'window'
      readonly clientX: number
      readonly startSec: number
      readonly endSec: number
    }
  | {
      readonly mode: 'marquee'
      readonly clientX: number
      readonly seconds: number
      moved: boolean
    }

/** 一排等宽细柱。淡的那份铺满整条轨道，黑的那份被选区窗裁着看。 */
function TrimBars({
  bars,
  tone,
  style,
}: {
  readonly bars: readonly number[]
  readonly tone: TrimTone
  readonly style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      data-audio-trim-bars={tone}
      className="absolute inset-y-0 flex items-center gap-0.5"
      style={{ height: NODE_V4_AUDIO_TRIM.trackHeight, ...style }}
    >
      {bars.map((ratio, index) => (
        <i
          key={index}
          className={cn(
            'block w-0.5 shrink-0 rounded-xs',
            tone === 'selected' ? 'bg-foreground' : 'bg-foreground/18',
          )}
          style={{
            height: Math.round(ratio * NODE_V4_AUDIO_TRIM.waveformHeight),
          }}
        />
      ))}
    </div>
  )
}

export function AudioTrimPanel({
  url,
  durationSec,
  seed,
  busy = false,
  renderTrack,
  previewRef,
  onCancel,
  onConfirm,
  className,
}: AudioTrimPanelProps) {
  const t = useTranslations('StudioNode.v4.audio.trim')
  const total = Math.max(0, durationSec)
  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(total)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const dragRef = useRef<TrimDrag | null>(null)
  /** 上一步的入出点（面板内 ⌘Z 撤一步）。⛔ 不进画布的撤销栈：这一格还没落库。 */
  const historyRef = useRef<{ startSec: number; endSec: number }[]>([])

  // 时长是异步回来的（`loadedmetadata`）——回来那一刻出点还停在 0 的话，条一开
  // 就是个 0 长度的选区。所以整段变长时把出点跟到末尾。
  const [syncedTotal, setSyncedTotal] = useState(total)
  if (syncedTotal !== total) {
    setSyncedTotal(total)
    setStartSec(0)
    setEndSec(total)
    setPlayhead(0)
  }

  const min = NODE_V4_AUDIO_TRIM.minSelectionSec
  const track = NODE_V4_AUDIO_TRIM.trackWidth
  const bars = buildAudioWaveformBars(seed, NODE_V4_AUDIO_TRIM.barCount)
  /** 秒 → 轨道内像素（⚠ 全条都用像素，窗里那层波形才对得齐柱子）。 */
  const pxOf = (seconds: number) => (total > 0 ? (seconds / total) * track : 0)

  /** 轨道的一层：缺省是波形；给了 `renderTrack` 就画调用方那份（视频卡 = 胶片）。 */
  const trackLayer = (tone: TrimTone, style: CSSProperties) =>
    renderTrack ? (
      <div
        aria-hidden
        data-audio-trim-strip={tone}
        className="pointer-events-none absolute inset-y-0"
        style={{ width: track, ...style }}
      >
        {renderTrack(tone)}
      </div>
    ) : (
      <TrimBars bars={bars} tone={tone} style={style} />
    )

  /** 试听对着哪只媒体：外面给的优先，否则条内那只隐藏 `<audio>`。 */
  const mediaOf = (): HTMLMediaElement | null =>
    previewRef?.current ?? audioRef.current

  /** 只播选区：越过出点就绕回入点（⛔ 不 pause —— 要能反复听那一段）。 */
  const followMediaTime = (el: HTMLMediaElement) => {
    if (el.currentTime >= endSec || el.currentTime < startSec) {
      el.currentTime = startSec
    }
    setPlayhead(el.currentTime)
  }

  const secondsAtClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * total
  }

  /** 客户端横向位移换算成秒（拖窗身用）。 */
  const secondsPerPx = (): number => {
    const width = trackRef.current?.getBoundingClientRect().width ?? track
    return width > 0 ? total / width : 0
  }

  const moveHandle = (handle: TrimHandle, seconds: number) => {
    if (handle === TRIM_HANDLE.start) {
      const next = Math.min(Math.max(0, seconds), Math.max(0, endSec - min))
      setStartSec(next)
      setPlayhead(next)
      return
    }
    const next = Math.max(
      Math.min(total, seconds),
      Math.min(total, startSec + min),
    )
    setEndSec(next)
    setPlayhead(next)
  }

  /** 整窗平移：时长锁死，两端一起挪，撞到 0 / 末尾就停住（⛔ 不压缩选区）。 */
  const slideWindow = (
    from: { startSec: number; endSec: number },
    by: number,
  ) => {
    const span = from.endSec - from.startSec
    const next = Math.min(
      Math.max(0, from.startSec + by),
      Math.max(0, total - span),
    )
    setStartSec(next)
    setEndSec(next + span)
    setPlayhead(next)
  }

  /** 记一步（拖手柄 / 拖窗 / 拖出新窗 / I / O 各算一步，一次连续拖只记按下那一刻）。 */
  const pushHistory = () => {
    historyRef.current.push({ startSec, endSec })
  }

  /** ⌘Z：退回上一步的入出点。栈空就什么都不做（⛔ 不退成 0）。 */
  const undoHandles = () => {
    const previous = historyRef.current.pop()
    if (!previous) return
    setStartSec(previous.startSec)
    setEndSec(previous.endSec)
    setPlayhead(previous.startSec)
  }

  /** 拖出来的新窗：按下点与当前点各当一端，短过最短选区就撑到最短。 */
  const setSelection = (a: number, b: number) => {
    const low = Math.max(0, Math.min(a, b))
    const high = Math.min(total, Math.max(a, b))
    const end = Math.max(high, Math.min(total, low + min))
    setStartSec(Math.min(low, Math.max(0, end - min)))
    setEndSec(end)
    setPlayhead(low)
  }

  // 拖的时候鼠标经常跑出条外 —— 监听挂在 window 上，⛔ 不挂在手柄本身
  // （那样一出界就断，手柄粘在半路）。
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      if (drag.mode === 'handle') {
        event.preventDefault()
        moveHandle(drag.handle, secondsAtClientX(event.clientX))
        return
      }
      if (drag.mode === 'window') {
        event.preventDefault()
        slideWindow(drag, (event.clientX - drag.clientX) * secondsPerPx())
        return
      }
      if (
        !drag.moved &&
        Math.abs(event.clientX - drag.clientX) <
          NODE_V4_AUDIO_TRIM.marqueeThresholdPx
      ) {
        return
      }
      drag.moved = true
      event.preventDefault()
      setSelection(drag.seconds, secondsAtClientX(event.clientX))
    }
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current
      // 在淡波形上按下又没挪 = 点了一下：只挪播放头（⛔ 不抹掉调好的入出点）。
      if (drag?.mode === 'marquee' && !drag.moved) {
        setPlayhead(secondsAtClientX(event.clientX))
      }
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  // 外部媒体（视频卡那只 `<video>`）：播 / 停 / 走时的读数挂监听回来 —— 条内那只
  // `<audio>` 走 JSX 事件，这只不在本组件里渲染，只能 addEventListener。
  useEffect(() => {
    const el = previewRef?.current
    if (!el) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => followMediaTime(el)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('timeupdate', onTime)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('timeupdate', onTime)
    }
  })

  // 外部媒体停着时，卡上那一帧跟着播放头走（拖入点 = 看见入点那一帧）。播着的时候
  // 播放头本来就是它报上来的，差不出阈值，不会自己拨自己。
  useEffect(() => {
    if (!previewRef) return
    const el = mediaOf()
    if (!el || !el.paused) return
    if (Math.abs(el.currentTime - playhead) > PREVIEW_SEEK_EPSILON_SEC) {
      el.currentTime = playhead
    }
  })

  /** 试听：从入点起播，到出点绕回去（拖完立刻听得出来）。 */
  const togglePreview = () => {
    const el = mediaOf()
    if (!el) return
    if (!el.paused) {
      el.pause()
      return
    }
    el.currentTime = startSec
    void el.play().catch(() => setPlaying(false))
  }

  const selectionSec = Math.max(0, endSec - startSec)
  const canConfirm = !busy && total > 0 && selectionSec >= min
  const windowLeft = pxOf(startSec)
  const windowWidth = Math.max(1, pxOf(endSec) - windowLeft)

  return (
    <div
      data-audio-trim-panel
      role="group"
      aria-label={t('title')}
      style={{
        width: NODE_V4_AUDIO_TRIM.panelWidth,
        paddingInline: NODE_V4_AUDIO_TRIM.paddingX,
      }}
      className={cn(
        'nodrag nopan flex flex-col gap-3 rounded-node-bar corner-squircle pt-3.5 pb-3',
        'surface-glass shadow-node-chrome',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
          return
        }
        // ⌘Z / Ctrl+Z = 撤上一步（画板：条内的撤销只管这一格，⛔ 不进画布的撤销
        // 栈 —— 这一段还没落成版本）。
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'z'
        ) {
          event.preventDefault()
          event.stopPropagation()
          undoHandles()
          return
        }
        // 空格试听选区（画板右注）。⚠ 要 `preventDefault`：焦点落在条内某颗按钮上
        // 时空格会被读成「按这颗键」。
        if (event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          togglePreview()
          return
        }
        // `I` / `O` = 把播放头收成入 / 出点（画板右注仍保留这两颗快捷键）。
        const key = event.key.toLowerCase()
        if (key === 'i') {
          pushHistory()
          moveHandle(TRIM_HANDLE.start, playhead)
        } else if (key === 'o') {
          pushHistory()
          moveHandle(TRIM_HANDLE.end, playhead)
        }
      }}
      tabIndex={-1}
    >
      <div
        ref={trackRef}
        data-audio-trim-track
        style={{ height: NODE_V4_AUDIO_TRIM.trackHeight }}
        className="relative"
        onPointerDown={(event) => {
          // 淡波形上按下：挪过阈值就是**拖出一扇新窗**（松手替换旧窗），没挪就
          // 只是把播放头放过去 —— ⛔ 一次误点不该抹掉入出点。
          pushHistory()
          dragRef.current = {
            mode: 'marquee',
            clientX: event.clientX,
            seconds: secondsAtClientX(event.clientX),
            moved: false,
          }
        }}
      >
        {trackLayer('faint', { left: 0 })}
        <div
          data-audio-trim-window
          role="group"
          aria-label={t('selectionWindow')}
          style={{ left: windowLeft, width: windowWidth }}
          className="absolute inset-y-0"
          onPointerDown={(event) => {
            // 窗身 = 整体平移（⛔ 不冒泡给轨道，那会当成「拖出新窗」）。
            event.stopPropagation()
            pushHistory()
            dragRef.current = {
              mode: 'window',
              clientX: event.clientX,
              startSec,
              endSec,
            }
          }}
        >
          {/* 亮窗本体：白底 + 浅影，窗内那层黑波形被它裁掉两边。 */}
          <div className="absolute inset-0 overflow-hidden rounded-sm bg-card shadow-node-trim-window">
            {trackLayer('selected', { left: -windowLeft, width: track })}
          </div>
          {[TRIM_HANDLE.start, TRIM_HANDLE.end].map((handle) => {
            const isStart = handle === TRIM_HANDLE.start
            const seconds = isStart ? startSec : endSec
            return (
              <button
                key={handle}
                type="button"
                data-audio-trim-handle={handle}
                aria-label={t(isStart ? 'inPoint' : 'outPoint')}
                role="slider"
                aria-valuenow={Math.round(seconds * 10) / 10}
                aria-valuemin={0}
                aria-valuemax={Math.round(total * 10) / 10}
                style={{
                  width: NODE_V4_AUDIO_TRIM.handleHitWidth,
                  ...(isStart ? { left: 0 } : { right: 0 }),
                }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  pushHistory()
                  dragRef.current = { mode: 'handle', handle }
                }}
                onKeyDown={(event) => {
                  // 键盘也要拖得动（AA）：一格 0.1s，Shift 一格 1s。
                  const step = event.shiftKey ? 1 : min
                  if (event.key === 'ArrowLeft') {
                    pushHistory()
                    moveHandle(handle, seconds - step)
                  } else if (event.key === 'ArrowRight') {
                    pushHistory()
                    moveHandle(handle, seconds + step)
                  } else return
                  event.preventDefault()
                  event.stopPropagation()
                }}
                // 命中区 16 宽、骑在窗边上；里面那只黑括号只有 10 宽（画板）。
                className={cn(
                  'absolute top-0 bottom-0 flex items-center cursor-ew-resize',
                  isStart
                    ? '-translate-x-1/2 justify-start'
                    : 'translate-x-1/2 justify-end',
                  ' focus-visible:outline-none focus-visible:shadow-focus',
                )}
              >
                <span
                  aria-hidden
                  // ⚠ 括号比窗高出上下各 4px（画板 `top:-4;bottom:-4`）：贴平窗沿
                  // 的括号读起来像窗自己的边框，探出来才像一只抓手。
                  style={{
                    width: NODE_V4_AUDIO_TRIM.handleWidth,
                    height: `calc(100% + ${NODE_V4_AUDIO_TRIM.handleOverhangPx * 2}px)`,
                    borderWidth: NODE_V4_AUDIO_TRIM.handleBorderWidth,
                    ...(isStart
                      ? { borderRightWidth: 0, marginLeft: 2 }
                      : { borderLeftWidth: 0, marginRight: 2 }),
                  }}
                  className={cn(
                    'block border-foreground',
                    isStart ? 'rounded-l-sm' : 'rounded-r-sm',
                  )}
                />
              </button>
            )
          })}
          {/* 窗顶居中那颗选区时长（画板 `8.1s`）。 */}
          <span
            data-audio-trim-selection
            className="-top-0.5 -translate-x-1/2 absolute left-1/2 rounded-xs bg-card px-1 text-2xs font-semibold tabular-nums text-foreground"
          >
            {formatAudioTrimDuration(selectionSec)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          data-audio-trim-preview
          data-playing={playing ? 'true' : 'false'}
          aria-label={t(playing ? 'pausePreview' : 'preview')}
          disabled={total <= 0}
          onClick={togglePreview}
          className={cn(
            'flex size-7.5 shrink-0 items-center justify-center rounded-full',
            'bg-surface-fill text-foreground transition-colors duration-fast hover:tint-hover',
            ' focus-visible:outline-none focus-visible:shadow-focus',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {playing ? (
            <Pause aria-hidden className="size-3.5" />
          ) : (
            <Play aria-hidden className="size-3.5" />
          )}
        </button>
        <span
          data-audio-trim-clock
          className="text-2xs tabular-nums text-foreground"
        >
          {formatAudioClock(Math.max(0, playhead - startSec))} /{' '}
          {formatAudioClock(selectionSec)}
        </span>
        <span
          data-audio-trim-range
          className="ml-1.5 text-2xs tabular-nums text-muted-foreground"
        >
          {t('range', {
            start: formatAudioClock(startSec),
            end: formatAudioClock(endSec),
          })}
        </span>
        <span className="flex-1" />
        <kbd className="rounded-sm border border-border px-1.5 py-px text-2xs font-normal text-muted-foreground">
          {t('keyEsc')}
        </kbd>
        <button
          type="button"
          data-audio-trim-confirm
          disabled={!canConfirm}
          onClick={() => onConfirm({ startSec, endSec })}
          className="flex h-8 shrink-0 items-center rounded-full bg-primary px-4.5 text-2sm font-semibold text-primary-foreground transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? t('confirming') : t('confirm')}
        </button>
      </div>

      {previewRef ? null : (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          hidden
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => followMediaTime(event.currentTarget)}
        />
      )}
    </div>
  )
}
