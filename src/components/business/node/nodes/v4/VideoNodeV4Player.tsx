'use client'

/**
 * 视频节点展开态的**播放面 + 抓帧**（第三期 · 画布 C3c-②Q · 盘点 §1
 * `NodeVideoSurface`(139) / `VideoReferenceNode`(348) / §2
 * `VideoReferenceDetailBody`(193)）。
 *
 * v4 之前展开态用的是裸 `<video muted preload=metadata>` —— **没有任何播放控件**
 * （盘点原话）。这里把 legacy 那一套搬过来：自定义播放/暂停、静音、进度可拖、
 * poster、下载，外加把首/尾帧抓帧接到 v4 上。
 *
 * ── 为什么不用原生 `controls` ────────────────────────────────────────
 * 画布在 CSS transform 里，原生控件条的点击热区在缩放下会漂；而且它自带的全屏 /
 * 画中画在节点卡里是误触源。legacy 的结论就是自绘两颗钮，这里照搬。
 *
 * ── 抓帧的失败文案 ───────────────────────────────────────────────────
 * 复用**已有**的 `VideoAnalysis.captureReason.*`（六条，含 R2 CORS 那条明确修法），
 * ⛔ 不为画布另写一套说法：同一个失败在两个域读到两句话，用户就会以为是两回事。
 */

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  VIDEO_FRAME_CAPTURE_REASONS,
  type VideoFrameCaptureReason,
} from '@/constants/video-analysis'
import { captureVideoEndpointFrames } from '@/lib/video-frame-capture'

import {
  NodeV4MediaWell,
  NodeV4Transport,
  NodeV4TransportButton,
} from './NodeV4MediaWell'

/**
 * 机器可读的失败原因（kebab）→ 已有文案键（camel）。
 * ⚠ 两边的**集合**由 `satisfies` 钉住：枚举里加一条而这里漏了，编译期就红，
 * ⛔ 不会静默掉进一句「抽帧失败」的兜底。
 */
const CAPTURE_REASON_KEYS = {
  [VIDEO_FRAME_CAPTURE_REASONS.unsupportedEnvironment]:
    'unsupportedEnvironment',
  [VIDEO_FRAME_CAPTURE_REASONS.loadFailed]: 'loadFailed',
  [VIDEO_FRAME_CAPTURE_REASONS.unreadableDuration]: 'unreadableDuration',
  [VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas]: 'taintedCanvas',
  [VIDEO_FRAME_CAPTURE_REASONS.timeout]: 'timeout',
  [VIDEO_FRAME_CAPTURE_REASONS.encodeFailed]: 'encodeFailed',
} as const satisfies Record<VideoFrameCaptureReason, string>

export interface VideoNodeV4PlayerProps {
  readonly url?: string
  /** poster —— AI 视频取 `Generation.thumbnailUrl`，手传的取客户端抓的那一帧。 */
  readonly posterUrl?: string
  readonly title: string
  /**
   * 抓到首 / 中 / 末三帧之后交给调用方（`VideoNodeV4` 用它落首帧 / 尾帧槽）。
   * 不给 = 不渲染抓帧那颗钮。
   */
  readonly onCaptureFrames?: (
    frames: readonly { index: number; dataUrl: string }[],
  ) => void
}

export function VideoNodeV4Player({
  url,
  posterUrl,
  title,
  onCaptureFrames,
}: VideoNodeV4PlayerProps) {
  const t = useTranslations('StudioNode.v4.player')
  const tCapture = useTranslations('VideoAnalysis')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [clock, setClock] = useState({ current: 0, total: 0 })
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => setIsPlaying(false))
    else video.pause()
  }, [])

  const runCapture = useCallback(async () => {
    if (!url || !onCaptureFrames) return
    setCapturing(true)
    setCaptureError(null)
    const result = await captureVideoEndpointFrames(url)
    setCapturing(false)
    if (!result.ok) {
      // R2 CDN 没配 CORS 时落在 `tainted-canvas` 这条 —— 它的文案明写「修法是配
      // CORS，换个视频重试没有用」，正是本片要的那句明确文案。
      setCaptureError(
        tCapture(`captureReason.${CAPTURE_REASON_KEYS[result.reason]}`),
      )
      return
    }
    onCaptureFrames(
      result.frames.map((frame) => ({
        index: frame.index,
        dataUrl: frame.dataUrl,
      })),
    )
  }, [url, onCaptureFrames, tCapture])

  if (!url) {
    return (
      <div
        data-video-player="empty"
        className="dark flex h-24 items-center justify-center rounded-xl border border-dashed bg-surface-sunken text-2xs text-muted-foreground corner-squircle"
      >
        {t('empty')}
      </div>
    )
  }

  return (
    <div data-video-player="ready" className="space-y-2">
      {/* 媒体坐在沉底的井里，transport 是浮在井底的一条玻璃胶囊。 */}
      <NodeV4MediaWell testId="video">
        <video
          ref={videoRef}
          src={url}
          poster={posterUrl}
          muted={muted}
          playsInline
          preload="metadata"
          aria-label={title}
          className="dark aspect-video w-full object-cover"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={(event) =>
            setClock({
              current: 0,
              total: Number.isFinite(event.currentTarget.duration)
                ? event.currentTarget.duration
                : 0,
            })
          }
          onEnded={() => {
            setIsPlaying(false)
            setProgress(0)
          }}
          onTimeUpdate={(event) => {
            const el = event.currentTarget
            setProgress(el.duration > 0 ? el.currentTime / el.duration : 0)
            setClock({
              current: el.currentTime,
              total: Number.isFinite(el.duration) ? el.duration : 0,
            })
          }}
        />
        <NodeV4Transport>
          <NodeV4TransportButton
            testId="video-play"
            label={isPlaying ? t('pause') : t('play')}
            pressed={isPlaying}
            onClick={togglePlay}
          >
            {isPlaying ? '❚❚' : '▶'}
          </NodeV4TransportButton>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={progress}
            data-video-progress
            aria-label={t('progress')}
            className="h-1 min-w-0 flex-1 accent-primary"
            onChange={(event) => {
              const video = videoRef.current
              const next = Number(event.target.value)
              setProgress(next)
              if (video && video.duration > 0) {
                video.currentTime = next * video.duration
              }
            }}
          />
          {/* 时间读数走等宽 tabular，⛔ 不让秒数跳动时把进度条推来推去。 */}
          <span
            data-video-clock
            className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground"
          >
            {formatClock(clock.current)}/{formatClock(clock.total)}
          </span>
          <NodeV4TransportButton
            testId="video-mute"
            label={muted ? t('unmute') : t('mute')}
            pressed={muted}
            onClick={() => {
              const video = videoRef.current
              const next = !muted
              setMuted(next)
              if (video) video.muted = next
            }}
          >
            {muted ? '🔇' : '🔊'}
          </NodeV4TransportButton>
        </NodeV4Transport>
      </NodeV4MediaWell>

      {/* 抓帧 / 下载在**井外**：它们改的是别的槽和本地文件，不是在放这段视频。
          下载靠右，与抓帧动作分组。 */}
      <div className="flex items-center gap-2">
        {onCaptureFrames ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-video-capture
            disabled={capturing}
            className="rounded-lg bg-surface-fill hover:bg-surface-fill-hover"
            onClick={() => void runCapture()}
          >
            {capturing ? t('capturing') : t('captureFrames')}
          </Button>
        ) : null}
        {/* 下载走 `<a download>`：文件已经在 R2 上，⛔ 不在客户端再拉一份 blob。 */}
        <a
          href={url}
          download
          data-video-download
          className="ml-auto rounded-lg bg-surface-fill px-2.5 py-1.5 text-2sm hover:bg-surface-fill-hover"
        >
          {t('download')}
        </a>
      </div>
      {captureError ? (
        <p data-video-capture-failed className="text-3xs text-destructive">
          {captureError}
        </p>
      ) : null}
    </div>
  )
}

/** `m:ss` 读数。⛔ 不引 date 库：这里只有一种格式。 */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
