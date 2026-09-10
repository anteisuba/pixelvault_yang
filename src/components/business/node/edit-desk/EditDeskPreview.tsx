'use client'

/**
 * 中间的预览（画板 `EditDesk.dc.html` 中列）。
 *
 * 播放头落在哪一段，就把那一段的来源 url 交给 `VideoPlayer`（S6 那一只，⛔ 不
 * 另写一个播放器）。
 *
 * ── 播放头 ↔ 预览是**同一根轴**（S8b 修 S8 遗留）────────────────────────
 * S8 那一版两边各走各的：拖播放头预览不动，按空格是「跳到下一段段首」而不是播放。
 * 于是时间线上那条线和画面里的那一帧对不上，整张台面读起来像两个互不相干的东西。
 * 现在两个方向都通：
 * - **播放头 → 预览**：段变了就换 src，段内位置变了就 seek 到 `clipLocalTimeSec`
 *   （裁剪 + 倍速都算进去了）。
 * - **预览 → 播放头**：`timeupdate` 把段内位置换算回整条时间线的秒数。
 * - **过段**：播到 `clip.out` 就把播放头推过这一段的尾巴，下一段自然接上（跨段
 *   是**换 src**，会有一次可见的接口 —— 真正的无缝要渲染层的规格化，那是成片）。
 *
 * ⚠ 环路靠 `PREVIEW_SEEK_EPSILON_SEC` 断开：`timeupdate` 推回来的秒数与我们刚
 * 设过去的那一刻只差几十毫秒，超不过这个阈值就不再 seek —— ⛔ 没有这道闸，
 * 播放时每一帧都会被 seek 打断一次。
 *
 * 播放头落在轨道之外（还没有段 / 拖到片尾之后）时是一块空的比例框 + 一句提示，
 * ⛔ 不放一个点了没反应的播放钮。
 */

import { useCallback, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { EDIT_ASPECTS } from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  clipLocalTimeSec,
  currentUrlOf,
  formatEditClock,
} from '@/lib/edit-project'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditProject } from '@/types/node-workflow'

import { VideoPlayer } from '../nodes/v4/video/VideoPlayer'

export interface EditDeskPreviewProps {
  readonly project: EditProject
  /** 播放头下的那一段（`null` = 轨道之外）。 */
  readonly row: EditTimelineRow | null
  readonly playheadSec: number
  readonly durationSec: number
  /** 空格键 / 播放器自己的钮共用的这一份播放态。 */
  readonly playing: boolean
  onPlayingChange(playing: boolean): void
  /** 预览走到哪儿了 —— 推回整条时间线的秒数。 */
  onPlayheadChange(seconds: number): void
}

/** 比例 → CSS `aspect-ratio`。⛔ 不在组件里手写 `16/9`。 */
const ASPECT_CSS: Readonly<Record<(typeof EDIT_ASPECTS)[number], string>> = {
  '16:9': '16 / 9',
  '9:16': '9 / 16',
  '1:1': '1 / 1',
}

/** 播放头与画面差多少才值得 seek（见文件头的环路说明）。 */
const PREVIEW_SEEK_EPSILON_SEC = 0.25

/** 推过段尾时多迈的一点点 —— 正好落在下一段的开头而不是这一段的最后一帧。 */
const PREVIEW_CLIP_ADVANCE_SEC = 0.01

export function EditDeskPreview({
  project,
  row,
  playheadSec,
  durationSec,
  playing,
  onPlayingChange,
  onPlayheadChange,
}: EditDeskPreviewProps) {
  const t = useTranslations('StudioNode.editDesk')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const node = row?.source.node
  const data = node?.data
  const url = row?.source.url
  const poster = useVideoPoster(
    node ? currentUrlOf(node) : undefined,
    data && data.kind === NODE_MEDIA_KIND_IDS.video
      ? data.videoThumbnailUrl
      : undefined,
  )

  const clip = row?.clip ?? null
  const rowStartSec = row?.startSec ?? 0
  const rowDurationSec = row?.durationSec ?? 0
  const localSec = clip ? clipLocalTimeSec(clip, playheadSec - rowStartSec) : 0

  /** 段内秒 → 整条时间线秒（`timeupdate` 的反向换算）。 */
  const toTimelineSec = useCallback(
    (currentTime: number): number => {
      if (!clip) return rowStartSec
      return rowStartSec + (currentTime - clip.in) / (clip.speed || 1)
    },
    [clip, rowStartSec],
  )

  /* ── 播放头 → 预览 ────────────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !clip) return
    if (Math.abs(video.currentTime - localSec) <= PREVIEW_SEEK_EPSILON_SEC) {
      return
    }
    video.currentTime = localSec
  }, [localSec, clip])

  /* ── 倍速 ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !clip) return
    video.playbackRate = clip.speed || 1
  }, [clip, url])

  /* ── 播放态（空格与播放器那颗钮共用一份）────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // ⚠ 先看它现在是什么状态再动手：无条件 `pause()` 会在每次挂载 / 每次换段
    // 时对一只本来就停着的 `<video>` 再喊一次停，jsdom 里直接刷屏，浏览器里是
    // 一次没有意义的状态事件。
    if (playing && video.paused) {
      void video.play().catch(() => onPlayingChange(false))
    } else if (!playing && !video.paused) {
      video.pause()
    }
  }, [playing, url, onPlayingChange])

  /* ── 预览 → 播放头 ────────────────────────────────────────────────── */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !clip || !row) return

    const onTimeUpdate = () => {
      // 到段尾：推过这一段的尾巴，下一段由 `row` 换成新的那一段自然接上。
      if (video.currentTime >= clip.out - PREVIEW_CLIP_ADVANCE_SEC) {
        onPlayheadChange(
          rowStartSec + rowDurationSec + PREVIEW_CLIP_ADVANCE_SEC,
        )
        return
      }
      onPlayheadChange(toTimelineSec(video.currentTime))
    }
    const onPlay = () => onPlayingChange(true)
    const onPause = () => onPlayingChange(false)

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [
    clip,
    row,
    rowStartSec,
    rowDurationSec,
    toTimelineSec,
    onPlayheadChange,
    onPlayingChange,
  ])

  /** 走到片尾（播放头落到轨道之外）就停 —— ⛔ 不留一个「在播」但没画面的状态。 */
  useEffect(() => {
    if (!row && playing) onPlayingChange(false)
  }, [row, playing, onPlayingChange])

  return (
    <div
      data-testid="edit-desk-preview"
      className="flex min-h-0 flex-1 items-center justify-center"
    >
      <div
        className="relative w-full max-w-[640px] overflow-hidden rounded-xl bg-muted"
        style={{ aspectRatio: ASPECT_CSS[project.settings.aspect] }}
      >
        {url ? (
          <VideoPlayer
            key={url}
            url={url}
            {...(poster ? { posterUrl: poster } : {})}
            videoRef={videoRef}
            title={t('previewTitle', { name: project.name })}
            className="size-full"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1">
            <p className="text-xs text-muted-foreground">{t('previewEmpty')}</p>
          </div>
        )}
        {/*
          两个读数**分开放**（S9 修 S8 遗留）：
          - 右上 = **整条时间线**的位置（播放头 / 成片总长）；
          - 左上 = **当前段**的位置（段内已播 / 段长）。
          S8 那一版把段读数也挤在右下，与播放器自己的时间码叠在同一格上，1440
          以下直接糊成一团。⚠ 播放器**底部那一条**（transport + 它自己的时间码）
          是它自己的，所以两个读数都走顶部 —— ⛔ 别塞回底部去跟 transport 抢那一行。
        */}
        <span
          data-testid="edit-desk-clock"
          className="canvas-glass pointer-events-none absolute right-3 top-2 rounded-full px-2 py-0.5 text-2xs tabular-nums"
        >
          {t('clock', {
            at: formatEditClock(playheadSec, true),
            total: formatEditClock(durationSec),
          })}
        </span>
        {row ? (
          <span
            data-testid="edit-desk-clip-clock"
            className="canvas-glass pointer-events-none absolute left-3 top-2 rounded-full px-2 py-0.5 text-2xs tabular-nums"
          >
            {t('clipClock', {
              at: formatEditClock(
                Math.max(0, playheadSec - row.startSec),
                true,
              ),
              total: formatEditClock(row.durationSec),
            })}
          </span>
        ) : null}
      </div>
    </div>
  )
}
