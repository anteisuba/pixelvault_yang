'use client'

/**
 * 黑舞台上的预览（v2 关键切片）：画面按高度定尺寸居中；画面上只有**右上一枚「镜 n ·
 * 镜头名」**和字幕。播放 / 时间码 / 声音在预览下面那条走带行（`EditDeskTimeline`），
 * ⛔ 不再压一条播放条在画面上 —— 时间线本身就是进度条，两条进度会互相打架。
 *
 * 播放头落在哪一段，就把那一段的来源 url 放进这一只 `<video>`。⚠ 播放条管的是**整条
 * 成片**（进度 = 播放头 / 总长，点哪儿播放头就去哪儿），⛔ 不是这一段的原片 ——
 * 所以这里不借节点卡那只 `VideoPlayer`（它的条是单个文件的）。
 *
 * ── 播放头 ↔ 预览是**同一根轴**（S8b 修 S8 遗留）────────────────────────
 * S8 那一版两边各走各的：拖播放头预览不动，按空格是「跳到下一段段首」而不是播放。
 * 于是时间线上那条线和画面里的那一帧对不上，整张台面读起来像两个互不相干的东西。
 * 现在两个方向都通：
 * - **播放头 → 预览**：段变了就换 src，段内位置变了就 seek 到 `clipLocalTimeSec`
 *   （裁剪 + 倍速都算进去了）。
 * - **预览 → 播放头**：`timeupdate` 把段内位置换算回整条时间线的秒数。
 * - **过段**：播到 `clip.out` 就把播放头推过这一段的尾巴，下一段自然接上。
 *
 * ── 换镜头不黑屏（owner 2026-09-28「拖播放头 / 看画面」）──────────────────
 * 播放头这一段**连同前后两段**各挂一只 `<video>`（按 url 认，同源切开的两段共用一只），
 * 邻段提前加载并停在它会被看到的那一帧；换段 = 两只之间 200ms 交叉淡化（动效表
 * 「预览换镜头」），⛔ 不再是卸掉旧的、从零加载新的那一下黑。真正的无缝要渲染层
 * 的规格化，那是成片。
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
import { clipLocalTimeSec } from '@/lib/edit-project'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import { cn } from '@/lib/utils'
import type { EditTimelineRow } from '@/lib/edit-project'
import type { EditProject, EditTextClip } from '@/types/node-workflow'

export interface EditDeskPreviewProps {
  readonly project: EditProject
  /** 播放头下的那一段（`null` = 轨道之外）。 */
  readonly row: EditTimelineRow | null
  readonly playheadSec: number
  readonly durationSec: number
  /** 空格键 / 走带行那颗钮共用的这一份播放态。 */
  readonly playing: boolean
  /** 走带行那颗声音键。 */
  readonly muted: boolean
  /** 这一段正在重拍（4b）：左上角写「第 n 版生成中」。`null` / 缺席 = 不在生成。 */
  readonly generatingTake?: number | null
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
  /** 还没有片段时那颗「从画布素材加镜头」（手机只看不剪时缺席）。 */
  onOpenMaterials?(): void
  /** V 轨上紧挨着这一段的前后两段：提前挂好、停在衔接的那一帧。 */
  readonly neighbors?: readonly EditTimelineRow[]
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

/** 前一段停在出点前多少秒（往回拖播放头时最先看到的那一帧）。 */
const PREVIEW_TAIL_SEC = 0.1

export function EditDeskPreview({
  project,
  row,
  playheadSec,
  durationSec,
  playing,
  muted,
  generatingTake = null,
  onPlayingChange,
  onPlayheadChange,
  textClips,
  textEditing,
  onOpenMaterials,
  neighbors = [],
}: EditDeskPreviewProps) {
  const t = useTranslations('StudioNode.editDesk')
  /** 按 url 登记的那几只 `<video>`；当前那只 = 播放头这一段的 url。 */
  const videosRef = useRef(new Map<string, HTMLVideoElement>())
  /** 上一次 seek 还没落地时，最新那个目标先存着（拖播放头时不叠一串 seek）。 */
  const pendingSeekRef = useRef<number | null>(null)
  const url = row?.source.url
  const poster = useVideoPoster(url, row?.source.version?.thumbnailUrl)

  const activeVideo = useCallback(
    (): HTMLVideoElement | null =>
      url ? (videosRef.current.get(url) ?? null) : null,
    [url],
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
    const video = activeVideo()
    if (!video || !clip) return
    if (Math.abs(video.currentTime - localSec) <= PREVIEW_SEEK_EPSILON_SEC) {
      return
    }
    // 上一次 seek 还在路上：只记下最新的目标，落地后再补一次（见下面 `seeked`）。
    if (video.seeking) {
      pendingSeekRef.current = localSec
      return
    }
    video.currentTime = localSec
  }, [localSec, clip, activeVideo])

  useEffect(() => {
    const video = activeVideo()
    if (!video) return
    pendingSeekRef.current = null
    const onSeeked = () => {
      const pending = pendingSeekRef.current
      if (pending === null) return
      pendingSeekRef.current = null
      video.currentTime = pending
    }
    video.addEventListener('seeked', onSeeked)
    return () => video.removeEventListener('seeked', onSeeked)
  }, [activeVideo])

  /* ── 邻段：停在衔接的那一帧（后一段 = 入点，前一段 = 出点前一点）───────── */
  useEffect(() => {
    for (const neighbor of neighbors) {
      const neighborUrl = neighbor.source.url
      if (!neighborUrl || neighborUrl === url) continue
      const video = videosRef.current.get(neighborUrl)
      if (!video) continue
      if (!video.paused) video.pause()
      const target =
        neighbor.startSec < rowStartSec
          ? Math.max(neighbor.clip.in, neighbor.clip.out - PREVIEW_TAIL_SEC)
          : neighbor.clip.in
      if (Math.abs(video.currentTime - target) > PREVIEW_SEEK_EPSILON_SEC) {
        video.currentTime = target
      }
    }
  }, [neighbors, url, rowStartSec])

  /* ── 倍速 ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const video = activeVideo()
    if (!video || !clip) return
    video.playbackRate = clip.speed || 1
  }, [clip, activeVideo])

  /* ── 播放态（空格与播放器那颗钮共用一份）────────────────────────────── */
  useEffect(() => {
    const video = activeVideo()
    if (!video) return
    // ⚠ 先看它现在是什么状态再动手：无条件 `pause()` 会在每次挂载 / 每次换段
    // 时对一只本来就停着的 `<video>` 再喊一次停，jsdom 里直接刷屏，浏览器里是
    // 一次没有意义的状态事件。
    if (playing && video.paused) {
      void video.play().catch(() => onPlayingChange(false))
    } else if (!playing && !video.paused) {
      video.pause()
    }
  }, [playing, activeVideo, onPlayingChange])

  /* ── 预览 → 播放头 ────────────────────────────────────────────────── */
  useEffect(() => {
    const video = activeVideo()
    if (!video || !clip || !row) return

    const onTimeUpdate = () => {
      // ⚠ 停着的时候播放头说了算，画面只跟、⛔ 不回写：seek 落地也会发一次
      // `timeupdate`，报的是**上一个**目标 —— 回写的话播放头被拽回去、又触发一次
      // seek，两个位置来回跳个不停（owner 2026-09-29「不断卡动」）。
      if (video.paused) return
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
    activeVideo,
  ])

  /** 走到片尾（播放头落到轨道之外）就停 —— ⛔ 不留一个「在播」但没画面的状态。 */
  useEffect(() => {
    if (!row && playing) onPlayingChange(false)
  }, [row, playing, onPlayingChange])

  /** 这一段 + 前后两段的来源（按 url 去重：同一只 `<video>` 服务同源的几段）。 */
  const slots = [row, ...neighbors].reduce<{ url: string }[]>(
    (list, candidate) => {
      const candidateUrl = candidate?.source.url
      if (candidateUrl && !list.some((slot) => slot.url === candidateUrl)) {
        list.push({ url: candidateUrl })
      }
      return list
    },
    [],
  )

  const aspect = project.settings.aspect
  const sourceData = row?.source.node?.data
  const shotName =
    sourceData && sourceData.kind === NODE_MEDIA_KIND_IDS.video
      ? (sourceData.label ?? sourceData.name)
      : (sourceData?.name ?? '')

  // 还没有片段：舞台上是一句话 + 一颗起手的键（与视频台的起手屏同一个样子）。
  if (durationSec <= 0) {
    return (
      <div
        data-testid="edit-desk-preview"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center"
      >
        <span className="text-2xs font-semibold uppercase tracking-nav text-muted-foreground">
          {t('title')}
        </span>
        <p className="text-md text-muted-foreground">{t('stageEmpty')}</p>
        {onOpenMaterials ? (
          <button
            type="button"
            data-testid="edit-desk-stage-open-materials"
            onClick={onOpenMaterials}
            className="h-9 rounded-full border border-border bg-muted px-4 text-2sm transition-colors duration-fast hover:bg-surface-fill"
          >
            {t('stageEmptyAction')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-testid="edit-desk-preview"
      className="flex min-h-0 flex-1 items-center justify-center px-6 pb-2.5 pt-3.5"
      // 外层量尺寸：里面那只盒子用 `cqh` 按**预览区高**推宽，占满两个方向里先到顶的那个。
      style={{ containerType: 'size' }}
    >
      <div
        className="relative max-h-full max-w-full overflow-hidden rounded-lg bg-neutral-950 ring-1 ring-border"
        // ⚠ `container-type: size` 是字幕那几行 `cqh` 的锚：字号必须跟着**画面高**
        // 走（与渲染层同一套比例），跟着视口走的话窗口一窄字就跳。
        // ⚠ 盒子按预览区的高定尺寸：宽 = min(区宽, 区高 × 比例)，高由比例推 —— 哪个
        // 方向先到顶就贴哪个方向，永远不出区；助手开合时它不变大小，只多出两侧留白。
        style={{
          aspectRatio: ASPECT_CSS[aspect],
          width: `min(100%, calc(100cqh * ${ASPECT_RATIO[aspect]}))`,
          containerType: 'size',
        }}
      >
        {slots.map((slot) => {
          const active = slot.url === url
          return (
            <video
              key={slot.url}
              ref={(element) => {
                if (element) videosRef.current.set(slot.url, element)
                else videosRef.current.delete(slot.url)
              }}
              src={slot.url}
              {...(active && poster ? { poster } : {})}
              muted={active ? muted : true}
              playsInline
              preload="auto"
              aria-hidden={!active}
              {...(active
                ? {
                    'aria-label': t('previewTitle', { name: project.name }),
                    'data-testid': 'edit-desk-preview-video',
                  }
                : {})}
              className={cn(
                'absolute inset-0 size-full object-contain transition-opacity duration-base motion-reduce:transition-none',
                active ? 'opacity-100' : 'opacity-0',
              )}
            />
          )
        })}
        {url ? null : (
          <div className="flex size-full items-center justify-center">
            <p className="text-xs text-white/70">
              {/* 播放头下有段、来源卡还没片子（续拍的占位，4c）≠ 播放头下没有段。 */}
              {row?.source.exists
                ? t('continue.previewPending')
                : t('previewEmpty')}
            </p>
          </div>
        )}
        {/*
          字幕叠字（S8d）。⚠ 用**画面高的百分比**排字号与边距，与渲染层同一套比例
          （`EDIT_TEXT_SIZE_SCALE`）—— 预览与成片不一致的字幕比没有预览更糟：用户会
          照着预览摆，导出才发现字压在别处。
          ⚠ 外层定位那一格 `pointer-events-none`（它可能横跨整幅画面，⛔ 不抢播放条
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

        {/* 左上：这一段在重拍（花积分的事走警告琥珀，配色 B）。 */}
        {generatingTake ? (
          <span
            data-testid="edit-desk-preview-generating"
            className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-neutral-950/70 px-3 text-xs leading-6 text-status-warning"
          >
            <span
              aria-hidden
              className="size-1.75 animate-pulse rounded-full bg-status-warning motion-reduce:animate-none"
            />
            {t('retake.previewGenerating', { n: generatingTake })}
          </span>
        ) : null}

        {/* 右上一枚「镜 n · 镜头名」。压在画面上的 chrome 固定明暗
            （ui-defaults §2.4 媒体 chrome 例外）。 */}
        {row ? (
          <span
            data-testid="edit-desk-shot-tag"
            className="pointer-events-none absolute right-3 top-3 max-w-3/4 truncate rounded-md bg-neutral-950/60 px-2 text-2xs leading-5.5 text-white"
          >
            {t('shotTag', {
              n: row.index + 1,
              name: shotName || t('inspector.sourceGone'),
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
