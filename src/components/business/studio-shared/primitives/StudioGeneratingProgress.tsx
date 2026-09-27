'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import {
  GENERATION_COMPLETE_ANIMATION,
  GENERATION_COMPLETE_TOTAL_MS,
  PROGRESS_TICK_MS,
  STAGE_LABEL_CROSSFADE_OUT_MS,
} from '@/constants/generation-progress'
import {
  buildGenerationEdgePath,
  resolveGenerationProgress,
  type GenerationEdgeBox,
  type GenerationEdgePlacement,
} from '@/lib/generation-progress'
import { cn } from '@/lib/utils'

export interface StudioGenerationFailure {
  /** One translated, human sentence saying why nothing came out. */
  message: string
  /**
   * What a box narrower than 160px shows instead (e.g. 「没出图」); the full
   * `message` stays readable to screen readers there.
   */
  shortMessage?: string
  /** Label of the retry button; no button is drawn without `onRetry`. */
  retryLabel: string
  onRetry?: () => void
}

export interface StudioGeneratingProgressProps {
  /** Whole-second elapsed time (parent's 1s timer). Internally smoothed to the 500ms tick. */
  elapsedSeconds: number
  /** 0-100 real progress (video polling / training). Present → drives percent directly, zero visual fork. */
  realProgress?: number
  /** Stage word — `generatingOverlayStages.*` for the estimate path, or a real status string when `realProgress` is set. */
  stageLabel: string
  /** Bottom parameter row, e.g. "12s · anima XL · 1:1". Omit for the compact/regenerate-overlay variant. */
  paramsLine?: string
  /** `full` = new-generation stage card (larger digits + params row). `compact` = overlay on existing media, canvas cards, grid tiles. */
  variant?: 'full' | 'compact'
  /** True while the parent is holding this component mounted through the completion beat (close → hold → fade). */
  isCompleting?: boolean
  /** Fires once the full close/hold/fade sequence has played — parent unmounts on this. */
  onCompleteAnimationDone?: () => void
  /**
   * Fires when the closed line starts to fade (after close + hold). A canvas
   * card hands its edge back here: its ring / hairline returns underneath the
   * fading line, so the full loop is seen running before the ring shows.
   */
  onEdgeRelease?: () => void
  /**
   * The job failed: the line stops where it was and turns grey, and the middle
   * says why + offers a retry (加载态 A, owner 2026-09-27: canvas and workbench
   * both say it in place — ⛔ red frame, ⛔ error dialog). Hosts keep this
   * component mounted after a failure and pass this in.
   */
  failure?: StudioGenerationFailure | null
  /**
   * Percent only; the stage word goes to screen readers. A box narrower than
   * 160px does this on its own (container query — compare-grid tiles); the
   * canvas zooms with a transform that a container query cannot see, so the
   * canvas host passes this from the zoomed width.
   */
  hideStageLabel?: boolean
  /**
   * Matches the art box's corner radius so the line runs on its edge.
   * `--radius-node` is the canvas node card's own radius exception
   * (ui-defaults §3.1) — added for `NodeFrameProgress`.
   */
  cornerRadiusVar?: '--radius-xl' | '--radius-2xl' | '--radius-node'
  /**
   * `inside` (default): the line sits just inside the box's edge — every
   * workbench host clips its media box (`overflow-hidden`: the stage, grid
   * tiles, the LoRA card), and a line outside the edge would be cut off.
   * `outside`: only for the canvas card's unclipped edge layer, where the
   * line lands exactly on the card's selected ring.
   */
  edgePlacement?: GenerationEdgePlacement
  className?: string
}

/**
 * 加载态 A「边即进度」(owner 2026-09-27 · design canvas「加载态 A · 全部状态」):
 * one line. The box's own edge becomes a light track while generating and a
 * foreground line runs clockwise from the middle of the top edge; a full
 * line is the box's edge again (on a selected canvas card: exactly its
 * ring). The middle only carries a medium percent and one stage word.
 *
 * Spec: docs/references/loading.md.
 * Shared by every single-shot generation surface — the workbench stage and
 * its regenerate overlays, compare-grid tiles, the LoRA result card and
 * canvas node cards (`NodeFrameProgress`) — so the estimate/real-progress
 * algorithm and the closing beat only exist once.
 */
export function StudioGeneratingProgress({
  elapsedSeconds,
  realProgress,
  stageLabel,
  paramsLine,
  variant = 'full',
  isCompleting = false,
  onCompleteAnimationDone,
  onEdgeRelease,
  failure = null,
  hideStageLabel = false,
  cornerRadiusVar = '--radius-xl',
  edgePlacement = 'inside',
  className,
}: StudioGeneratingProgressProps) {
  const prefersReducedMotion = useReducedMotion()
  const reducedMotion = Boolean(prefersReducedMotion)
  const failed = failure !== null

  // ── Sub-second smoothing ──────────────────────────────────────────
  // `elapsedSeconds` only ticks once/sec upstream; PROGRESS_TICK_MS (500ms)
  // recomputes need a finer clock so the line doesn't visibly stall for
  // half a second. We interpolate using wall-clock time since the prop
  // last changed, re-rendered every tick.
  const [tick, setTick] = useState(0)
  const lastPropRef = useRef({ value: elapsedSeconds, at: performanceNow() })
  if (lastPropRef.current.value !== elapsedSeconds) {
    lastPropRef.current = { value: elapsedSeconds, at: performanceNow() }
  }

  useEffect(() => {
    if (isCompleting || failed) return
    const id = setInterval(() => setTick((t) => t + 1), PROGRESS_TICK_MS)
    return () => clearInterval(id)
  }, [isCompleting, failed])

  const smoothedElapsedSeconds = useMemo(() => {
    void tick
    const sinceProp = (performanceNow() - lastPropRef.current.at) / 1000
    return lastPropRef.current.value + Math.max(0, sinceProp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, elapsedSeconds])

  const { percent } = resolveGenerationProgress({
    elapsedSeconds: smoothedElapsedSeconds,
    realProgress,
    isComplete: isCompleting,
    reducedMotion,
  })
  const roundedPercent = Math.round(percent)

  // A failed line stops where it was. Hosts often reset their timer once a
  // job ends, so remember the last reading taken while it was still running
  // (adjust-state-during-render: reacting to our own prop, not syncing out).
  const [runningPercent, setRunningPercent] = useState(roundedPercent)
  if (!failed && runningPercent !== roundedPercent) {
    setRunningPercent(roundedPercent)
  }
  const shownPercent = failed ? runningPercent : roundedPercent

  // ── The edge: measured, because the path starts at the top middle ──
  const rootRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<GenerationEdgeBox | null>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const next: GenerationEdgeBox = {
        width: root.clientWidth,
        height: root.clientHeight,
        radius:
          Number.parseFloat(getComputedStyle(root).borderTopLeftRadius) || 0,
      }
      setBox((prev) =>
        prev &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.radius === next.radius
          ? prev
          : next,
      )
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])
  const edgePath = useMemo(
    () =>
      box ? buildGenerationEdgePath(box, undefined, edgePlacement) : undefined,
    [box, edgePlacement],
  )

  // ── Completion beat: close → hold → fade, then tell the parent ────
  // Reduced motion still keeps the opacity fade-out — only the line's
  // transitions and the stage-word crossfade are stripped (CSS
  // `no-preference` guard + `useCrossfadeLabel`'s reducedMotion branch).
  const [closed, setClosed] = useState(false)
  const [fading, setFading] = useState(false)
  useEffect(() => {
    if (!isCompleting) {
      setClosed(false)
      setFading(false)
      return
    }
    setClosed(true)
    const fadeTimer = setTimeout(() => {
      setFading(true)
      onEdgeRelease?.()
    }, GENERATION_COMPLETE_ANIMATION.closeMs + GENERATION_COMPLETE_ANIMATION.holdMs)
    const doneTimer = setTimeout(
      () => onCompleteAnimationDone?.(),
      GENERATION_COMPLETE_TOTAL_MS,
    )
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleting])

  // ── Stage word crossfade ───────────────────────────────────────────
  const { current: currentLabel, outgoing: outgoingLabel } = useCrossfadeLabel(
    stageLabel,
    reducedMotion,
  )

  const isFull = variant === 'full'
  const dash = closed ? 100 : shownPercent

  return (
    <div
      ref={rootRef}
      // A failed generation is announced assertively (the red box it replaces was an alert too).
      role={failed ? 'alert' : 'progressbar'}
      {...(failed
        ? {}
        : {
            'aria-valuenow': shownPercent,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-label': currentLabel,
          })}
      className={cn(
        '@container/progress pointer-events-none absolute inset-0 flex flex-col items-center justify-center',
        fading && 'opacity-0 transition-opacity duration-base ease-linear',
        className,
      )}
      style={{ borderRadius: `var(${cornerRadiusVar})` }}
    >
      <svg
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        aria-hidden
      >
        <path
          d={edgePath}
          pathLength={100}
          className="studio-generation-edge-track"
        />
        <path
          d={edgePath}
          pathLength={100}
          strokeDasharray={`${dash} 100`}
          className={cn(
            'studio-generation-edge',
            closed && 'studio-generation-edge--closing',
            failed && 'studio-generation-edge--stopped',
            // A round cap would leave a dot at the start before anything moved.
            dash <= 0 && 'opacity-0',
          )}
        />
      </svg>

      {failure ? (
        <div className="pointer-events-auto flex max-w-full animate-in flex-col items-center gap-3 px-6 text-center fade-in-0 duration-base ease-linear @max-4xs/progress:gap-2 @max-4xs/progress:px-2.5 motion-reduce:animate-none">
          <p className="text-sm leading-5 text-foreground/80 @max-4xs/progress:text-xs">
            <span
              className={cn(
                failure.shortMessage && '@max-4xs/progress:sr-only',
              )}
            >
              {failure.message}
            </span>
            {failure.shortMessage ? (
              <span aria-hidden className="hidden @max-4xs/progress:inline">
                {failure.shortMessage}
              </span>
            ) : null}
          </p>
          {failure.onRetry ? (
            <button
              type="button"
              onClick={failure.onRetry}
              className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-colors duration-fast ease-linear hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 @max-4xs/progress:h-6.5 @max-4xs/progress:px-2.5"
            >
              {failure.retryLabel}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            'flex flex-col items-center gap-1',
            fading && 'opacity-0 transition-opacity duration-fast ease-linear',
          )}
        >
          <p
            aria-hidden
            className={cn(
              'font-medium tracking-tight tabular-nums text-foreground',
              isFull ? 'text-3xl' : 'text-2xl @max-4xs/progress:text-lg',
            )}
          >
            {shownPercent}
            <span
              className={cn(
                'ml-0.5 font-normal text-muted-foreground',
                isFull ? 'text-base' : 'text-sm @max-4xs/progress:text-2xs',
              )}
            >
              %
            </span>
          </p>
          <span
            className={cn(
              'relative inline-flex text-sm text-muted-foreground @max-4xs/progress:sr-only',
              hideStageLabel && 'sr-only',
            )}
          >
            {outgoingLabel !== null && (
              <span
                aria-hidden
                className="studio-generation-stage-out absolute inset-0 whitespace-nowrap"
              >
                {outgoingLabel}
              </span>
            )}
            <span
              key={currentLabel}
              className={cn(
                'whitespace-nowrap',
                !reducedMotion && 'studio-generation-stage-in',
              )}
            >
              {currentLabel}
            </span>
          </span>
        </div>
      )}

      {isFull && paramsLine && !failed && (
        <p
          className={cn(
            'absolute inset-x-0 bottom-3 text-center text-2xs tabular-nums text-muted-foreground',
            fading && 'opacity-0 transition-opacity duration-fast ease-linear',
          )}
        >
          {paramsLine}
        </p>
      )}
    </div>
  )
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function useCrossfadeLabel(label: string, reducedMotion: boolean) {
  const [current, setCurrent] = useState(label)
  const [outgoing, setOutgoing] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (label === current) return
    if (reducedMotion) {
      setCurrent(label)
      return
    }
    setOutgoing(current)
    setCurrent(label)
    timeoutRef.current = setTimeout(
      () => setOutgoing(null),
      STAGE_LABEL_CROSSFADE_OUT_MS,
    )
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, reducedMotion])

  return { current, outgoing }
}
