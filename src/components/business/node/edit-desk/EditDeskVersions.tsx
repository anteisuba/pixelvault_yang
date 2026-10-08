'use client'

/**
 * 段的版本（v2 第 4 片 4a · 关键切片「版本弹层」，借自方向 B）。
 *
 * 版本**不新增数据**：列表就是来源卡的产出版本，段上的 `sourceVersionId` 是在用的那一版。
 * - 段角 `n/m`：卡不止一版、或画布上换了版还没换进来（亮一个点）时才出；
 * - 选中行的「版本 n/m」开同一块弹层；
 * - 弹层一行一项（换皮第二轮 ⑥ C，照模型选择器）：小缩略 · 第 n 版 · 时长 · 来源，在用的
 *   整行浅灰加对勾；点哪行换哪版 —— 段与来源卡一起切，一步撤销（`pickClipVersion`）；
 * - **鼠标停在另一版上 = 大预览左右对比**（样片 W，`TakeCompareOverlay`）：左在用、右这一版，
 *   中间那条线能拖，拖出画面压扁、松手弹回。只是看，⛔ 不改时间线。
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  EDIT_PICK_CLOSE_DELAY_MS,
  EDIT_TAKE_COMPARE_MOTION,
  EDIT_TIMELINE_FILMSTRIP,
  type EditTrackId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { clipLocalTimeSec, type EditTimelineRow } from '@/lib/edit-project'
import { probeMediaDuration } from '@/lib/media-probe'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { cn } from '@/lib/utils'
import { getVideoFrameUrl } from '@/lib/video-poster'
import type { NodeV4OutputVersion } from '@/types/node-workflow'

import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import { useBlurSwapIn } from '@/components/ui/blur-swap'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { flashEditClips } from './edit-desk-flash'
import { PickHeader, PickList, PickRow } from './EditDeskPickRow'

/** 对比层的标记：在它上面按下去 ⛔ 不算「点在弹层外面」（拖分隔线时弹层不能收）。 */
const COMPARE_ATTR = 'data-edit-take-compare'

/** 量过的时长（url → 秒；`null` = 量不出来）。同一版在弹层里开关几次只量一次。 */
const durationCache = new Map<string, number | null>()

function useVersionDurations(
  urls: readonly string[],
): ReadonlyMap<string, number | null> {
  const [, setTick] = useState(0)
  const key = urls.join('\n')
  useEffect(() => {
    let alive = true
    for (const url of key.split('\n')) {
      if (!url || durationCache.has(url)) continue
      void probeMediaDuration(url, 'video').then((seconds) => {
        durationCache.set(url, seconds)
        if (alive) setTick((tick) => tick + 1)
      })
    }
    return () => {
      alive = false
    }
  }, [key])
  return durationCache
}

/** 这一段的版本读数：卡有几版、在用第几版、画布上是不是换了版没换进来。 */
export function readClipTakes(row: EditTimelineRow): {
  readonly count: number
  /** 在用那一版，1 起。 */
  readonly n: number
  readonly fresh: boolean
} | null {
  const version = row.source.version
  if (!version) return null
  return { count: version.count, n: version.index + 1, fresh: row.source.stale }
}

/**
 * 版本弹层。`children` 是触发键（段角读数 / 选中行文字键）；弹层开在它上方。
 */
export function EditClipVersionsPopover({
  desk,
  row,
  track,
  align,
  children,
}: {
  readonly desk: EditDesk
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  readonly align: 'start' | 'end'
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const zoom = getChipZoomMotion({ side: 'top', align, sideOffset: 8 })
  const { setCompare } = desk
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setCompare(null)
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align={align}
        sideOffset={8}
        className={cn('w-70 p-1.5', zoom.className)}
        style={zoom.style}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerDownOutside={(event) => {
          const target = event.target
          if (
            target instanceof Element &&
            target.closest(`[${COMPARE_ATTR}]`)
          ) {
            event.preventDefault()
          }
        }}
      >
        <VersionRows
          desk={desk}
          row={row}
          track={track}
          onPicked={() =>
            window.setTimeout(() => {
              setOpen(false)
              setCompare(null)
            }, EDIT_PICK_CLOSE_DELAY_MS)
          }
        />
      </PopoverContent>
    </Popover>
  )
}

function VersionRows({
  desk,
  row,
  track,
  onPicked,
}: {
  readonly desk: EditDesk
  readonly row: EditTimelineRow
  readonly track: EditTrackId
  onPicked(): void
}) {
  const t = useTranslations('StudioNode.editDesk.versions')
  const data = row.source.node?.data
  const media = data && data.kind !== NODE_MEDIA_KIND_IDS.text ? data : null
  const versions = media ? readOutputVersions(media) : []
  const current = media ? readOutputIndex(media) : 0
  const inUse = row.source.version?.index ?? current
  const durations = useVersionDurations(versions.map((version) => version.url))
  const listRef = useRef<HTMLDivElement | null>(null)
  const { setCompare } = desk

  // 版本多了一屏放不下：打开时把在用那一行滚进视野（只滚这一列，⛔ 用 scrollIntoView 连页面一起滚）。
  useEffect(() => {
    const list = listRef.current
    const picked = list?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!list || !picked) return
    list.scrollTop = Math.max(
      0,
      picked.offsetTop - (list.clientHeight - picked.offsetHeight) / 2,
    )
  }, [])
  // 弹层卸下（选中别的段 / 段删了）时对比跟着收。
  useEffect(() => () => setCompare(null), [setCompare])

  const name =
    media?.kind === NODE_MEDIA_KIND_IDS.video
      ? (media.label ?? media.name)
      : (media?.name ?? '')
  const inUseUrl = versions[inUse]?.url

  const pick = (index: number) => {
    const url = versions[index]?.url
    onPicked()
    if (index === inUse && !row.source.stale) return
    const picked = desk.pickClipVersion(track, row.clip.id, index, {
      from: (inUseUrl && durations.get(inUseUrl)) || undefined,
      to: (url && durations.get(url)) || undefined,
    })
    if (!picked) return
    setCompare(null)
    desk.setPlayhead(row.startSec + 0.01)
    requestAnimationFrame(() => flashEditClips([row.clip.id]))
  }

  return (
    <div data-testid="edit-desk-versions">
      <PickHeader title={t('title')} hint={t('hint', { name })} />
      <div ref={listRef} className="max-h-72 overflow-y-auto">
        <PickList label={t('title')}>
          {versions.map((version, index) => {
            const fresh = row.source.stale && index === current
            const durationSec = durations.get(version.url) ?? null
            return (
              <PickRow
                key={version.id}
                testId={`edit-desk-version-${index + 1}`}
                selected={index === inUse}
                onPick={() => pick(index)}
                onHover={() =>
                  setCompare(
                    index === inUse
                      ? null
                      : { track, clipId: row.clip.id, index },
                  )
                }
                leading={
                  <VersionThumb
                    version={version}
                    thumbnailUrl={
                      index === current &&
                      media?.kind === NODE_MEDIA_KIND_IDS.video
                        ? media.videoThumbnailUrl
                        : version.meta?.videoThumbnailUrl
                    }
                    durationSec={durationSec}
                  />
                }
                label={
                  <>
                    {t('take', { n: index + 1 })}
                    {fresh ? (
                      <span
                        aria-hidden
                        className="ml-1.5 inline-block size-1.5 rounded-full bg-foreground align-middle"
                      />
                    ) : null}
                  </>
                }
                detail={[
                  durationSec
                    ? t('seconds', { sec: durationSec.toFixed(1) })
                    : null,
                  fresh
                    ? t('fresh', { from: t('fromCanvas') })
                    : t('fromCanvas'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            )
          })}
        </PickList>
      </div>
    </div>
  )
}

/** 行首那张小缩略。 */
function VersionThumb({
  version,
  thumbnailUrl,
  durationSec,
}: {
  readonly version: NodeV4OutputVersion
  readonly thumbnailUrl: string | undefined
  readonly durationSec: number | null
}) {
  const poster = useVideoPoster(version.url, thumbnailUrl)
  // AI 重拍常从同一张首帧出发，各版第一帧一个样：量到时长就取片中那一帧。
  const step = EDIT_TIMELINE_FILMSTRIP.stepSec
  const frame =
    (durationSec
      ? getVideoFrameUrl(
          version.url,
          Math.round(durationSec / 2 / step) * step,
          EDIT_TIMELINE_FILMSTRIP.frameWidthPx,
        )
      : null) ?? poster
  return (
    <span
      aria-hidden
      className="h-5 w-9 shrink-0 rounded-sm bg-muted bg-cover bg-center"
      style={frame ? { backgroundImage: `url(${frame})` } : undefined}
    />
  )
}

export interface EditTakeCompareView {
  readonly row: EditTimelineRow
  /** 拿来比的那一版（卡上第几版，0 起）。 */
  readonly index: number
}

/**
 * 大预览上的版本对比（样片 W）。挂在画面那只盒子里，盖住正在放的那一帧：左半是在用那一版、
 * 右半是鼠标停着的那一版，同一刻（播放头在这段里就取播放头那一刻，不在就取入点）。
 *
 * ⚠ 一直挂着、只切显隐（短模糊进出，CSS 过渡）：⛔ 不随 `compare` 卸下 —— 收的时候也要
 * 有动效，卸下就没了。上一次比的内容留着，淡出时还是它。
 * ⚠ 分隔线：拖出画面按 `rubber` 比例跟手并压扁，松手弹回边上（一点点过冲）。
 */
export function TakeCompareOverlay({
  compare,
  playheadSec,
}: {
  readonly compare: EditTakeCompareView | null
  readonly playheadSec: number
}) {
  const t = useTranslations('StudioNode.editDesk.versions')
  const [shown, setShown] = useState(compare)
  const key = compare ? `${compare.row.clip.id}:${compare.index}` : null
  if (
    compare &&
    (compare.row !== shown?.row || compare.index !== shown.index)
  ) {
    setShown(compare)
  }
  const on = compare !== null

  const split = useMotionValue(0.5)
  const squash = useMotionValue(1)
  const clipPath = useTransform(
    split,
    (value) => `inset(0 0 0 ${clamp01(value) * 100}%)`,
  )
  const left = useTransform(split, (value) => {
    const inside = clamp01(value)
    return `calc(${inside * 100}% + ${(value - inside) * EDIT_TAKE_COMPARE_MOTION.overshootPx}px)`
  })
  const drag = useRef<DOMRect | null>(null)

  // 换一版来比：分隔线回到正中（样片同一条）。
  useEffect(() => {
    if (key) split.set(0.5)
  }, [key, split])

  if (!shown) return null
  const { row } = shown
  const data = row.source.node?.data
  const media = data && data.kind !== NODE_MEDIA_KIND_IDS.text ? data : null
  const rightUrl = media ? readOutputVersions(media)[shown.index]?.url : null
  const leftUrl = row.source.url
  const offset = playheadSec - row.startSec
  const atSec = clipLocalTimeSec(
    row.clip,
    offset >= 0 && offset < row.durationSec ? offset : 0,
  )

  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    drag.current =
      event.currentTarget.parentElement?.getBoundingClientRect() ?? null
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 合成事件没有真的指针可捕获 —— 拖动照样跟 move 走。
    }
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const box = drag.current
    if (!box || box.width <= 0) return
    const raw = (event.clientX - box.left) / box.width
    const {
      rubber,
      squashScale,
      squash: squashSpring,
    } = EDIT_TAKE_COMPARE_MOTION
    const past = raw > 1 ? raw - 1 : raw < 0 ? raw : 0
    split.set(clamp01(raw) + past * rubber)
    if (past !== 0 && squash.get() === 1) {
      void animate(squash, squashScale, squashSpring)
    } else if (past === 0 && squash.get() !== 1) {
      void animate(squash, 1, squashSpring)
    }
  }
  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    void animate(squash, 1, EDIT_TAKE_COMPARE_MOTION.squash)
    void animate(split, clamp01(split.get()), EDIT_TAKE_COMPARE_MOTION.release)
  }

  return (
    <div
      {...{ [COMPARE_ATTR]: '' }}
      data-testid="edit-desk-take-compare"
      aria-hidden={!on}
      className={cn(
        'absolute inset-0 bg-neutral-950 transition duration-fast ease-standard motion-reduce:transition-none',
        on ? 'opacity-100 blur-none' : 'pointer-events-none opacity-0 blur-sm',
      )}
    >
      <CompareFrame url={leftUrl} atSec={atSec} />
      <motion.div className="absolute inset-0" style={{ clipPath }}>
        {rightUrl ? <CompareFrame url={rightUrl} atSec={atSec} swapIn /> : null}
      </motion.div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-neutral-950/60 px-2 text-2xs leading-5.5 text-white">
        {t('compareInUse')}
      </span>
      <span
        data-testid="edit-desk-take-compare-label"
        className="pointer-events-none absolute right-3 top-3 rounded-md bg-neutral-950/60 px-2 text-2xs leading-5.5 text-white"
      >
        {t('take', { n: shown.index + 1 })}
      </span>
      <motion.span
        data-testid="edit-desk-take-compare-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ left, scaleY: squash }}
        className="absolute inset-y-0 -ml-3 flex w-6 cursor-ew-resize touch-none justify-center"
      >
        <span aria-hidden className="h-full w-0.5 bg-white" />
        <span
          aria-hidden
          className="absolute top-1/2 size-6 -translate-y-1/2 rounded-full bg-white shadow-md"
        />
      </motion.span>
    </div>
  )
}

/** 对比里的一半：一只静音 `<video>` 停在 `atSec`（超过这一版的长度就停在片尾）。 */
function CompareFrame({
  url,
  atSec,
  swapIn = false,
}: {
  readonly url: string | null | undefined
  readonly atSec: number
  /** 右半换一版时由糊变清地进来。 */
  readonly swapIn?: boolean
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const swap = useBlurSwapIn(swapIn ? (url ?? '') : '')
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const seek = () => {
      const end = Number.isFinite(video.duration)
        ? video.duration - 0.05
        : atSec
      video.currentTime = Math.max(0, Math.min(atSec, end))
    }
    if (video.readyState >= 1) seek()
    else video.addEventListener('loadedmetadata', seek, { once: true })
    return () => video.removeEventListener('loadedmetadata', seek)
  }, [atSec, url])
  if (!url) return null
  return (
    <motion.video
      key={url}
      ref={ref}
      src={url}
      muted
      playsInline
      preload="auto"
      {...(swapIn ? swap : {})}
      className="absolute inset-0 size-full object-contain"
    />
  )
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
