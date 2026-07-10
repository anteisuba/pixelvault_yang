'use client'

import { useRef, useState } from 'react'
import { Film, Frame, Locate, Mic2, Play } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type ReferenceTokenKind =
  | 'character'
  | 'background'
  | 'shot'
  | 'keyframe'
  | 'closeup'
  | 'voice'
  | 'video'

export interface ReferenceTokenData {
  id: string
  kind: ReferenceTokenKind
  label: string
  token: string
  /** Visual thumbnail source — the node's own image, or `videoThumbnailUrl`
   *  for video references. */
  mediaUrl?: string
  /** Voice cover — voiceCoverImage or voiceReferenceCoverImage. */
  coverImage?: string
  /** false = projection-only slot, no @insert: video refs (ride video_urls
   *  automatically) and unready voices (no reference audio → not sent).
   *  undefined/true keeps the normal insert behavior. */
  insertable?: boolean
  /** Render at 40% opacity — a wired reference that will NOT be sent this
   *  generation (§3.3 禁用/不发送), e.g. a voice without reference audio. */
  dimmed?: boolean
}

// 'shot' shares the image-family port color with 'character' (both are part of
// the unified image node — see --node-port-image's comment in globals.css).
const SHAPE_CLASS: Record<ReferenceTokenKind, string> = {
  character: 'rounded-full',
  background: 'rounded-md',
  shot: 'rounded-md',
  keyframe: 'rounded-md',
  // closeup is a face-detail image → square, image-family (§9 A/B).
  closeup: 'rounded-md',
  voice: 'rounded-full',
  video: 'rounded-md',
}
const RING_CLASS: Record<ReferenceTokenKind, string> = {
  character: 'ring-node-port-character/40',
  background: 'ring-node-port-background/40',
  shot: 'ring-node-port-image/40',
  keyframe: 'ring-node-port-image/40',
  closeup: 'ring-node-port-image/40',
  voice: 'ring-node-port-voice/40',
  video: 'ring-node-port-video/40',
}
const FILL_CLASS: Record<ReferenceTokenKind, string> = {
  character: 'bg-node-port-character/20 text-node-port-character',
  background: 'bg-node-port-background/20 text-node-port-background',
  shot: 'bg-node-port-image/20 text-node-port-image',
  keyframe: 'bg-node-port-image/20 text-node-port-image',
  closeup: 'bg-node-port-image/20 text-node-port-image',
  voice: 'bg-node-port-voice/20 text-node-port-voice',
  video: 'bg-node-port-video/20 text-node-port-video',
}

interface ReferenceTokenChipProps {
  data: ReferenceTokenData
  onInsert(data: ReferenceTokenData, originEl: HTMLElement): void
  onLocate?(nodeId: string): void
}

/** §8 引用 token — 内嵌真实缩略图的 chip：选角(圆)/置景·镜头(方)/配音(圆，封面
 *  或 Mic2 兜底)/视频(方·▶)/keyframe(方·Frame)。Hover 弹出预览浮层（§8.3），点击
 *  插入交给调用方（VideoComposer 负责飞入+辉光动效，§8.4）。改名走 V2-1 静默自动
 *  回写（VideoComposer 侧），token 不再有漂移态。 */
export function ReferenceTokenChip({
  data,
  onInsert,
  onLocate,
}: ReferenceTokenChipProps) {
  const tc = useTranslations('StudioNode.videoComposer')
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | undefined>(undefined)

  const insertable = data.insertable !== false && Boolean(data.token)

  // Unnamed-but-nameable references keep the "needs a name" text pill —
  // naming is the user's actionable fix. Projection-only slots
  // (insertable === false) skip this: their token is legitimately empty.
  if (!data.token && data.insertable !== false) {
    return (
      <span
        title={tc('references.unnamedHint')}
        className="rounded-md border border-dashed border-node-panel-inner bg-node-panel px-1.5 py-0.5 text-2xs text-node-subtle"
      >
        {tc(`refKind.${data.kind}`)} · {tc('references.unnamed')}
      </span>
    )
  }

  // Why a wired reference can't be @inserted — also the slot's title and a
  // status line in the hover preview, so "won't send" is never silent. Only
  // meaningful when NOT insertable: a video reference is insertable since §9 D
  // (自动编号), so this only fires for the rare no-slot edge case, not the
  // common path — showing it unconditionally would contradict an insertable
  // video chip's own click behavior.
  const noInsertHint = insertable
    ? undefined
    : data.kind === 'video'
      ? tc('references.videoAutoHint')
      : data.kind === 'keyframe'
        ? tc('references.keyframeHint')
        : data.kind === 'voice'
          ? tc('references.voiceNotReadyHint')
          : undefined

  const thumbUrl = data.kind === 'voice' ? data.coverImage : data.mediaUrl
  const display =
    (data.kind === 'voice' ? data.label || data.token : data.token) ||
    data.label ||
    tc(`refKind.${data.kind}`)
  // The fallback glyph reads from the plain name, not the `@`-prefixed token —
  // "@" itself isn't a useful initial.
  const glyph = (data.label || data.token).replace(/^@/, '').slice(0, 1)

  const openHover = () => {
    window.clearTimeout(closeTimerRef.current)
    setOpen(true)
  }
  const scheduleClose = () => {
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={openHover}
          onMouseLeave={scheduleClose}
          onClick={
            insertable
              ? (event) => onInsert(data, event.currentTarget)
              : undefined
          }
          title={insertable ? tc('references.insertHint') : noInsertHint}
          aria-label={display}
          className={cn(
            'nodrag relative flex size-10 shrink-0 items-center justify-center overflow-hidden border ring-1 transition-colors',
            SHAPE_CLASS[data.kind],
            !insertable && 'cursor-default',
            data.dimmed && 'opacity-40',
            'border-node-panel-inner',
            RING_CLASS[data.kind],
          )}
        >
          {thumbUrl ? (
            // Reference thumbnails come from R2/third-party covers, not a fixed
            // set of app assets — matches VoiceDetailBody's raw-img convention.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="size-full object-cover" />
          ) : (
            <span
              className={cn(
                'flex size-full items-center justify-center',
                FILL_CLASS[data.kind],
              )}
            >
              {data.kind === 'voice' ? (
                <Mic2 className="size-4" />
              ) : data.kind === 'video' ? (
                <Film className="size-4" />
              ) : data.kind === 'keyframe' ? (
                <Frame className="size-4" />
              ) : (
                <span className="text-2xs font-semibold">{glyph}</span>
              )}
            </span>
          )}
          {data.kind === 'video' ? (
            // §8.2 动作·参考视频: ▶ 角标一眼区分"这是动图不是静图"。
            // node-card-window (S2 卡内偏差修正): same fixed-dark-scrim badge as
            // DepartmentStrip's corner badge — needs the deep-window's light
            // foreground override so the glyph doesn't go dark-on-dark.
            <span className="node-card-window absolute bottom-0 right-0 flex size-3.5 items-center justify-center rounded-tl bg-node-canvas/85 text-node-foreground">
              <Play className="size-2" fill="currentColor" />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        onMouseEnter={openHover}
        onMouseLeave={scheduleClose}
        // Hover preview — never manage focus. Without these, Radix moves focus
        // into the content on open (trigger blurs → scheduleClose → close) and
        // returns it to the trigger on close (trigger focus → openHover →
        // reopen), a ~120ms open/close oscillation that flickers after a click.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-60 space-y-2.5 rounded-xl border-node-panel-inner bg-node-panel/96 p-3 text-node-foreground shadow-node-panel backdrop-blur-xl"
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-18 shrink-0 items-center justify-center overflow-hidden',
              SHAPE_CLASS[data.kind],
              !thumbUrl && FILL_CLASS[data.kind],
            )}
          >
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbUrl} alt="" className="size-full object-cover" />
            ) : data.kind === 'voice' ? (
              <Mic2 className="size-6" />
            ) : data.kind === 'video' ? (
              <Film className="size-6" />
            ) : data.kind === 'keyframe' ? (
              <Frame className="size-6" />
            ) : (
              <span className="text-sm font-semibold">{glyph}</span>
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-node-foreground">
              {display}
            </p>
            <p className="text-2xs text-node-muted">
              {tc(`refKind.${data.kind}`)}
            </p>
          </div>
        </div>

        {noInsertHint ? (
          <p
            className={cn(
              'text-2xs leading-4',
              data.dimmed ? 'text-node-status-failed' : 'text-node-muted',
            )}
          >
            {noInsertHint}
          </p>
        ) : null}

        {onLocate ? (
          <button
            type="button"
            onClick={() => onLocate(data.id)}
            className="flex w-full items-center gap-1.5 rounded-md border border-node-panel-inner px-2 py-1.5 text-2xs text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
          >
            <Locate className="size-3" />
            {tc('references.locate')}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
