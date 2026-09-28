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

import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'

import {
  EDIT_ASPECTS,
  EDIT_TEXT_MARGIN_SCALE,
  EDIT_TEXT_MAX_LENGTH,
  EDIT_TEXT_SIZE_SCALE,
  type EditTextAnchor,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  clipLocalTimeSec,
  currentUrlOf,
  formatEditClock,
} from '@/lib/edit-project'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditProject, EditTextClip } from '@/types/node-workflow'

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
  /**
   * 这一刻要叠的字幕（S8d）。
   *
   * ⚠ 传的是**已经按播放头筛过**的那几段（`textClipsAt`）：播放头不在段内就是空
   * 数组，于是「不在段内不显示」这条规则只有一处实现（纯函数那一处）。
   */
  readonly textClips: readonly EditTextClip[]
  /**
   * 字幕在画面上怎么点（④ A：**字在预览上原地改**，owner 09-28）。缺席 = 只看
   * （手机档）：字幕仍是画面的一部分，⛔ 不接点击。
   */
  readonly textEditing?: PreviewTextEditing
}

export interface PreviewTextEditing {
  readonly selectedId: string | null
  /** 正在原地改的那一段（`null` = 没在改）。 */
  readonly editingId: string | null
  /** 单击 = 选中这段（那一行换成字幕的属性）。 */
  onSelect(clipId: string): void
  /** 双击 = 原地改字。 */
  onStartEdit(clipId: string): void
  /** 改完：`text` = 要落的字；`null` = 放弃（Esc / 空字 / 没改）。 */
  onEndEdit(clipId: string, text: string | null): void
}

/** 九宫 → 画面里的定位（与渲染层的 `drawtext` 表达式一一对应）。 */
const TEXT_ANCHOR_CLASS: Readonly<Record<EditTextAnchor, string>> = {
  tl: 'top-0 left-0 text-left',
  tc: 'top-0 left-0 right-0 text-center',
  tr: 'top-0 right-0 text-right',
  ml: 'top-1/2 left-0 -translate-y-1/2 text-left',
  mc: 'top-1/2 left-0 right-0 -translate-y-1/2 text-center',
  mr: 'top-1/2 right-0 -translate-y-1/2 text-right',
  bl: 'bottom-0 left-0 text-left',
  bc: 'bottom-0 left-0 right-0 text-center',
  br: 'bottom-0 right-0 text-right',
}

/** 比例 → CSS `aspect-ratio`。⛔ 不在组件里手写 `16/9`。 */
const ASPECT_CSS: Readonly<Record<(typeof EDIT_ASPECTS)[number], string>> = {
  '16:9': '16 / 9',
  '9:16': '9 / 16',
  '1:1': '1 / 1',
}

/** 宽 / 高 数值 —— 给「占满预览区」那条 `min(100%, 100cqh × 比例)` 用。 */
const ASPECT_RATIO: Readonly<Record<(typeof EDIT_ASPECTS)[number], number>> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
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
  textClips,
  textEditing,
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
      // 外层量尺寸：里面那只盒子用 `cqh` 按**预览区高**推宽，占满两个方向里先到顶的那个。
      style={{ containerType: 'size' }}
    >
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-xl bg-muted"
        // ⚠ `container-type: size` 是字幕那几行 `cqh` 的锚：字号必须跟着**画面高**
        // 走（与渲染层同一套比例），跟着视口走的话窗口一窄字就跳。
        // ⚠ 盒子**占满预览区**（owner 2026-09-11：「至少适配，不要浪费空间，最好占满」）：
        // 宽 = min(区宽, 区高 × 比例)，高由比例推 —— 哪个方向先到顶就贴哪个方向，
        // 永远不出区（此前按宽撑 16:9 会顶穿顶栏）。
        style={{
          aspectRatio: ASPECT_CSS[project.settings.aspect],
          width: `min(100%, calc(100cqh * ${ASPECT_RATIO[project.settings.aspect]}))`,
          containerType: 'size',
        }}
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
          字幕叠字（S8d · 画板左上那块预览）。⚠ 用**画面高的百分比**排字号与边距，
          与渲染层同一套比例（`EDIT_TEXT_SIZE_SCALE`）—— 预览与成片不一致的字幕比
          没有预览更糟：用户会照着预览摆，导出才发现字压在别处。
          ⚠ 外层定位那一格 `pointer-events-none`（它可能横跨整幅画面，⛔ 不抢播放器
          的点击）；只有字本身能点。
        */}
        {textClips.map((clip) => (
          <div
            key={clip.id}
            style={subtitleBoxStyle(clip)}
            className={cn(
              'pointer-events-none absolute whitespace-pre-wrap font-semibold leading-tight',
              TEXT_ANCHOR_CLASS[clip.anchor],
              clip.tone === 'light' ? 'text-white' : 'text-black',
            )}
          >
            {textEditing?.editingId === clip.id ? (
              <EditingSubtitle clip={clip} onEnd={textEditing.onEndEdit} />
            ) : (
              <span
                data-testid={`edit-desk-preview-text-${clip.id}`}
                {...(textEditing
                  ? {
                      title: t('text.doubleClickHint'),
                      onClick: () => textEditing.onSelect(clip.id),
                      onDoubleClick: () => textEditing.onStartEdit(clip.id),
                    }
                  : {})}
                className={cn(
                  'rounded-md px-2 py-0.5',
                  textEditing && 'pointer-events-auto cursor-text',
                  textEditing?.selectedId === clip.id && 'ring-1 ring-white/90',
                )}
              >
                {clip.text}
              </span>
            )}
          </div>
        ))}
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

/** 一段字幕在画面里的那一格（字号 / 边距跟画面高走，与渲染层同一套比例）。 */
function subtitleBoxStyle(clip: EditTextClip): CSSProperties {
  return {
    fontSize: `${EDIT_TEXT_SIZE_SCALE[clip.size] * 100}cqh`,
    padding: `0 ${EDIT_TEXT_MARGIN_SCALE * 100}cqh`,
    marginBottom: clip.anchor.startsWith('b')
      ? `${EDIT_TEXT_MARGIN_SCALE * 100}cqh`
      : undefined,
    marginTop: clip.anchor.startsWith('t')
      ? `${EDIT_TEXT_MARGIN_SCALE * 100}cqh`
      : undefined,
    // 描边的浅色版：⛔ 不写进 class（Tailwind 4 没有 text-shadow 档）。
    textShadow:
      clip.tone === 'light'
        ? '0 1px 3px rgb(0 0 0 / 0.75)'
        : '0 1px 3px rgb(255 255 255 / 0.75)',
  }
}

/**
 * 原地改字（④ A 关键切片：白框 + 光标立刻出现，⛔ 不弹输入框）。
 *
 * Enter 确认 · Shift+Enter 换行 · Esc 放弃 · 点别处确认；空字不收（回到原文）。
 * ⚠ 字由 DOM 自己管（挂上时写一次），⛔ 不让 React 在打字时重画 children ——
 *   别处（Claude / 撤销）同时改了这段也不会把光标冲掉，确认时以这里的字为准。
 * ⚠ Enter / Esc `stopPropagation`：台面的快捷键挂在 window 上，Esc 冒上去 = 退出
 *   剪辑台。
 */
function EditingSubtitle({
  clip,
  onEnd,
}: {
  readonly clip: EditTextClip
  onEnd(clipId: string, text: string | null): void
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const endedRef = useRef(false)
  const original = clip.text

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = original
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // 只在挂上时写一次（见头注）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const end = (commit: boolean) => {
    if (endedRef.current) return
    endedRef.current = true
    const raw = ref.current?.innerText ?? ref.current?.textContent ?? ''
    const next = raw.trim().slice(0, EDIT_TEXT_MAX_LENGTH)
    onEnd(clip.id, commit && next && next !== original ? next : null)
  }

  return (
    <span
      ref={ref}
      role="textbox"
      aria-multiline="true"
      data-testid={`edit-desk-preview-text-editing-${clip.id}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          event.stopPropagation()
          end(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          end(false)
        }
      }}
      onBlur={() => end(true)}
      className="pointer-events-auto inline-block min-w-4 cursor-text rounded-md bg-black/25 px-2 py-0.5 outline-2 outline-white"
    />
  )
}
