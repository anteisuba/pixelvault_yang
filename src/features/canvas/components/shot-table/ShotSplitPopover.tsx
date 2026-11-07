'use client'

/**
 * 在参考段的某一刻切开（H4a mock ⑧）：点一行的参考帧弹出来 —— 看这一段、拖到要切的那一刻、
 * 「在 0:12.6 切开」。切点离两头至少 `SHOT_SPLIT_MIN_SEC`（规划函数也拦一道）。
 *
 * 播放用浏览器自己的 `<video>`：拖滑杆 = 改 `currentTime`，⛔ 不为每个位置截一帧（截帧按
 * 次计费，滑杆一拖就是几十次）。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { Scissors } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatPullClockPrecise, shotRefFrameUrl } from '@/lib/shot-pull-frames'
import { SHOT_SPLIT_MIN_SEC } from '@/lib/shot-pull-plan'
import type { ShotTableReference } from '@/lib/shot-table-rows'

export function ShotSplitPopover({
  shotNo,
  reference,
  onSplit,
  children,
}: {
  readonly shotNo: number
  readonly reference: ShotTableReference & { readonly url: string }
  onSplit(atSec: number): void
  readonly children: ReactNode
}) {
  const t = useTranslations('StudioNode.shotTable')
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        data-testid="shot-split"
        className="nodrag w-80 p-3"
      >
        {open ? (
          <SplitBody
            reference={reference}
            title={t('split.title', {
              shotNo: String(shotNo).padStart(2, '0'),
              range: `${formatPullClockPrecise(reference.startSec)}–${formatPullClockPrecise(reference.endSec)}`,
            })}
            onSplit={(at) => {
              setOpen(false)
              onSplit(at)
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function SplitBody({
  reference,
  title,
  onSplit,
}: {
  readonly reference: ShotTableReference & { readonly url: string }
  readonly title: string
  onSplit(atSec: number): void
}) {
  const t = useTranslations('StudioNode.shotTable')
  const videoRef = useRef<HTMLVideoElement>(null)
  const min = reference.startSec + SHOT_SPLIT_MIN_SEC
  const max = reference.endSec - SHOT_SPLIT_MIN_SEC
  const [at, setAt] = useState(
    () => Math.round(((reference.startSec + reference.endSec) / 2) * 10) / 10,
  )
  const splittable = max > min

  useEffect(() => {
    const video = videoRef.current
    if (video && Number.isFinite(at)) video.currentTime = at
  }, [at])

  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        {title}
      </p>
      <video
        ref={videoRef}
        src={reference.url}
        poster={
          shotRefFrameUrl(
            reference.url,
            reference.startSec,
            reference.endSec,
          ) ?? undefined
        }
        muted
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-md bg-surface-fill object-cover"
      />
      <input
        type="range"
        data-testid="shot-split-scrub"
        aria-label={t('split.hint')}
        min={min}
        max={max}
        step={0.1}
        value={Math.min(max, Math.max(min, at))}
        disabled={!splittable}
        onChange={(event) => setAt(Number(event.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t('split.hint')}</span>
        <Button
          size="sm"
          data-testid="shot-split-action"
          disabled={!splittable}
          onClick={() => onSplit(at)}
        >
          <Scissors className="size-4" aria-hidden />
          {t('split.action', { time: formatPullClockPrecise(at) })}
        </Button>
      </div>
    </div>
  )
}
