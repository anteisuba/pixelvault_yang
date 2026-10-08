'use client'

/**
 * 接缝弹层（v2 第 5 片 5a · 换皮第二轮 ⑤ A）：点主线两段之间的接缝标记（改版 A：硬切是一颗
 * 悬停才出的「+」圆钮，有转场是一颗黑底小块），从标记上长出来。
 *
 * - 头一行「转场 · 镜 n → 镜 n+1」；
 * - 六种预设一行一项（照模型选择器）：行首一张小缩略是**这两段自己的画面**（前一段出点那一帧
 *   → 后一段入点那一帧），鼠标停在这一行上就把这种转场演一遍；选中整行浅灰 + 对勾；
 * - 选了转场才出「时长」那一行（「专属」A1：名字在左、分段条在右，说明只在鼠标停在名字上时
 *   出现）和「改回硬切」；
 * - 选完 ⛔ 收起：接着挑时长；两段各闪一下，告诉你改的是哪个接缝。
 *
 * ⚠ 转场是**前一段**的属性（`transitionOut` / `transitionSec`），⛔ 不另存一份接缝对象。
 * AI 接镜（5b）与「让助手挑」（5c）之后加在时长那一行下面。
 */

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  EDIT_PICK_CLOSE_DELAY_MS,
  EDIT_TIMELINE_FILMSTRIP,
  EDIT_TRACK_IDS,
  EDIT_TRANSITION_DEFAULT_SEC,
  EDIT_TRANSITION_DURATIONS,
  EDIT_TRANSITION_IDS,
  EDIT_TRANSITION_PRESETS,
  type EditTransitionId,
} from '@/constants/edit-desk'
import type { EditTimelineRow } from '@/lib/edit-project'
import { cn } from '@/lib/utils'
import { getVideoFrameUrl } from '@/lib/video-poster'

import type { EditDesk } from '@/hooks/node/use-edit-desk'
import { useVideoPoster } from '@/hooks/node/use-video-poster'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { flashEditClips } from './edit-desk-flash'
import { PickHeader, PickList, PickRow } from './EditDeskPickRow'

export function EditDeskSeamPopover({
  desk,
  from,
  to,
  children,
}: {
  readonly desk: EditDesk
  /** 接缝前一段（转场记在它身上）。 */
  readonly from: EditTimelineRow
  readonly to: EditTimelineRow
  /** 触发键（接缝标记）。 */
  readonly children: ReactNode
}) {
  const t = useTranslations('StudioNode.editDesk')
  const [open, setOpen] = useState(false)
  const zoom = getChipZoomMotion({
    side: 'top',
    align: 'center',
    sideOffset: 10,
  })
  const clip = from.clip
  const current = clip.transitionOut ?? EDIT_TRANSITION_IDS.none
  const seconds = clip.transitionSec ?? EDIT_TRANSITION_DEFAULT_SEC
  const fromFrame = useClipFrame(from, 'out')
  const toFrame = useClipFrame(to, 'in')

  const set = (patch: {
    readonly transitionOut?: EditTransitionId
    readonly transitionSec?: number
  }) => {
    if (!desk.updateClip(EDIT_TRACK_IDS.video, clip.id, patch)) return
    requestAnimationFrame(() => flashEditClips([clip.id, to.clip.id]))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        className={cn('w-64 p-1.5', zoom.className)}
        style={zoom.style}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div data-testid={`edit-desk-seam-popover-${clip.id}`}>
          <PickHeader
            title={t('seam.title')}
            hint={t('seam.between', { from: from.index + 1, to: to.index + 1 })}
          />
          <PickList label={t('seam.title')}>
            {EDIT_TRANSITION_PRESETS.map((transition) => (
              <PickRow
                key={transition}
                testId={`edit-desk-seam-${transition}`}
                className="edit-seam-row"
                leading={
                  <SeamThumb
                    transition={transition}
                    from={fromFrame}
                    to={toFrame}
                  />
                }
                label={t(`inspector.transitions.${transition}`)}
                selected={current === transition}
                onPick={() => set({ transitionOut: transition })}
              />
            ))}
          </PickList>
          {current !== EDIT_TRANSITION_IDS.none ? (
            <>
              <DurationRow
                value={seconds}
                onChange={(transitionSec) => set({ transitionSec })}
              />
              <div aria-hidden className="mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                data-testid="edit-desk-seam-hard-cut"
                onClick={() => {
                  set({ transitionOut: EDIT_TRANSITION_IDS.none })
                  window.setTimeout(
                    () => setOpen(false),
                    EDIT_PICK_CLOSE_DELAY_MS,
                  )
                }}
                className="flex h-8 w-full items-center rounded-lg px-2 text-left text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground hover:outline hover:outline-1 hover:outline-border"
              >
                {t('seam.hardCut')}
              </button>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * 时长那一行（「专属」A1）：名字在左、分段条在右；说明只在鼠标停在名字上时出现（黑底小字，
 * 由糊变清）。不在三档里的旧值（助手 / MCP 写的）就近亮一档。
 */
function DurationRow({
  value,
  onChange,
}: {
  readonly value: number
  onChange(seconds: number): void
}) {
  const t = useTranslations('StudioNode.editDesk.seam')
  const nearest = EDIT_TRANSITION_DURATIONS.reduce((best, candidate) =>
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
  )
  return (
    <div className="flex h-10 items-center justify-between gap-2.5 px-2">
      <span className="group/hint relative text-xs text-foreground">
        <span className="cursor-help underline decoration-transparent decoration-dotted underline-offset-4 transition-colors duration-fast group-hover/hint:decoration-muted-foreground">
          {t('duration')}
        </span>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 w-52 translate-y-1 rounded-lg bg-foreground px-2.5 py-1.5 text-2xs leading-relaxed text-background opacity-0 blur-xs transition duration-fast group-hover/hint:translate-y-0 group-hover/hint:opacity-100 group-hover/hint:blur-none"
        >
          {t('durationHint')}
        </span>
      </span>
      <LiquidSegmented
        ariaLabel={t('duration')}
        semantics="radio"
        value={String(nearest)}
        onChange={(next) => onChange(Number(next))}
        items={EDIT_TRANSITION_DURATIONS.map((seconds) => ({
          value: String(seconds),
          label: t('seconds', { sec: seconds }),
        }))}
      />
    </div>
  )
}

/**
 * 行首那张小缩略：前一段出点那一帧叠着后一段入点那一帧，行被悬停时按这种转场演一遍
 * （`canvas.css` 的 `edit-seam-thumb`）。截不到帧就退回封面；都没有是一块灰。
 */
function SeamThumb({
  transition,
  from,
  to,
}: {
  readonly transition: EditTransitionId
  readonly from: string | null
  readonly to: string | null
}) {
  return (
    <span
      aria-hidden
      data-transition={transition}
      className="edit-seam-thumb relative h-5 w-9 shrink-0 overflow-hidden rounded-sm bg-muted"
    >
      <i
        className="edit-seam-a absolute inset-0 bg-cover bg-center"
        style={from ? { backgroundImage: `url(${from})` } : undefined}
      />
      <i
        className="edit-seam-b absolute inset-0 bg-cover bg-center opacity-0"
        style={to ? { backgroundImage: `url(${to})` } : undefined}
      />
    </span>
  )
}

/** 一段在接缝那一头的画面：前一段取出点前一点那一帧，后一段取入点那一帧。 */
function useClipFrame(row: EditTimelineRow, edge: 'in' | 'out'): string | null {
  const data = row.source.node?.data
  const thumbnail =
    data && 'videoThumbnailUrl' in data ? data.videoThumbnailUrl : undefined
  const poster = useVideoPoster(row.source.url ?? undefined, thumbnail)
  const { stepSec, frameWidthPx } = EDIT_TIMELINE_FILMSTRIP
  const at =
    edge === 'in' ? row.clip.in : Math.max(row.clip.in, row.clip.out - stepSec)
  return (
    getVideoFrameUrl(
      row.source.url ?? undefined,
      Math.round(at / stepSec) * stepSec,
      frameWidthPx,
    ) ??
    poster ??
    null
  )
}

/** 接缝上那颗黑底小块里的图：两张叠在一起的画面（前一张描边、后一张半透明实心）。 */
export function TransitionGlyph({
  className,
}: {
  readonly className?: string
}) {
  return (
    <svg viewBox="0 0 14 10" fill="none" aria-hidden className={className}>
      <rect
        x="1"
        y="1"
        width="7"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="6"
        y="1"
        width="7"
        height="8"
        rx="1.5"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  )
}
