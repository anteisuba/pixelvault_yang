'use client'

/**
 * 段的版本（v2 第 4 片 4a · 关键切片「版本弹层」，借自方向 B）。
 *
 * 版本**不新增数据**：列表就是来源卡的产出版本，段上的 `sourceVersionId` 是在用的那一版。
 * - 段角 `n/m`：卡不止一版、或画布上换了版还没换进来（亮一个点）时才出；
 * - 选中行的「版本 n/m」开同一块弹层；
 * - 弹层里各版缩略并排，写时长和来源，在用的描白框；点哪张换哪张 —— 段与来源卡一起切，
 *   一步撤销（`pickClipVersion`）。
 */

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { useTranslations } from 'next-intl'

import {
  EDIT_TIMELINE_FILMSTRIP,
  type EditTrackId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { EditTimelineRow } from '@/lib/edit-project'
import { probeMediaDuration } from '@/lib/media-probe'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { cn } from '@/lib/utils'
import { getVideoFrameUrl } from '@/lib/video-poster'
import type { NodeV4OutputVersion } from '@/types/node-workflow'

import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { flashEditClips } from './edit-desk-flash'

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
 * 版本弹层。`children` 是触发键（段角读数 / 选中行胶囊）；弹层开在它上方。
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
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align={align}
        sideOffset={8}
        // 传送到台面里的 `.dark` 落点（`PortalContainerProvider`），跟着走暗档。
        className={cn('w-auto max-w-160 p-3', zoom.className)}
        style={zoom.style}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <VersionTiles
          desk={desk}
          row={row}
          track={track}
          onPicked={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

function VersionTiles({
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
  const stripRef = useRef<HTMLDivElement | null>(null)
  const inUseRef = useRef<HTMLButtonElement | null>(null)

  // 版本多了一排放不下：打开时把在用那张滚进视野（只滚这一排，⛔ 用 scrollIntoView 连页面一起滚）。
  useEffect(() => {
    const strip = stripRef.current
    const tile = inUseRef.current
    if (!strip || !tile) return
    strip.scrollLeft = Math.max(
      0,
      tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2,
    )
  }, [])

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
    desk.setPlayhead(row.startSec + 0.01)
    requestAnimationFrame(() => flashEditClips([row.clip.id]))
  }

  return (
    <div data-testid="edit-desk-versions" className="grid gap-2.5">
      <div className="flex items-baseline gap-2">
        <b className="text-sm font-semibold text-foreground">{t('title')}</b>
        <span className="truncate text-xs text-muted-foreground">
          {t('hint', { name })}
        </span>
      </div>
      <div ref={stripRef} className="flex gap-2.5 overflow-x-auto pb-1">
        {versions.map((version, index) => (
          <VersionTile
            key={version.id}
            ref={index === inUse ? inUseRef : undefined}
            version={version}
            n={index + 1}
            thumbnailUrl={
              index === current && media?.kind === NODE_MEDIA_KIND_IDS.video
                ? media.videoThumbnailUrl
                : version.meta?.videoThumbnailUrl
            }
            durationSec={durations.get(version.url) ?? null}
            inUse={index === inUse}
            fresh={row.source.stale && index === current}
            onPick={() => pick(index)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('footer')}</p>
    </div>
  )
}

function VersionTile({
  ref,
  version,
  n,
  thumbnailUrl,
  durationSec,
  inUse,
  fresh,
  onPick,
}: {
  readonly ref?: Ref<HTMLButtonElement>
  readonly version: NodeV4OutputVersion
  readonly n: number
  readonly thumbnailUrl: string | undefined
  readonly durationSec: number | null
  readonly inUse: boolean
  /** 画布上换到了这一版，段还没换进来。 */
  readonly fresh: boolean
  onPick(): void
}) {
  const t = useTranslations('StudioNode.editDesk.versions')
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
    <button
      ref={ref}
      type="button"
      data-testid={`edit-desk-version-${n}`}
      aria-pressed={inUse}
      onClick={onPick}
      className={cn(
        'group grid w-34 shrink-0 gap-0.75 text-left text-xs text-foreground/80',
        inUse && 'text-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'aspect-video rounded-md bg-muted bg-cover bg-center transition-shadow duration-fast',
          inUse
            ? 'ring-2 ring-foreground'
            : 'ring-1 ring-inset ring-border group-hover:ring-foreground/60',
        )}
        style={frame ? { backgroundImage: `url(${frame})` } : undefined}
      />
      <span className="truncate">
        {t('take', { n })}
        {durationSec ? (
          <span className="font-mono tabular-nums">
            {' · '}
            {t('seconds', { sec: durationSec.toFixed(1) })}
          </span>
        ) : null}
      </span>
      <small className="flex items-center gap-1.25 text-2xs text-muted-foreground">
        {fresh ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-foreground"
          />
        ) : null}
        {inUse
          ? t('inUse', { from: t('fromCanvas') })
          : fresh
            ? t('fresh', { from: t('fromCanvas') })
            : t('fromCanvas')}
      </small>
    </button>
  )
}
