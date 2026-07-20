'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import {
  GENERATION_COMPLETE_ANIMATION,
  GENERATION_COMPLETE_TOTAL_MS,
  PROGRESS_TICK_MS,
  STAGE_LABEL_CROSSFADE_OUT_MS,
} from '@/constants/generation-progress'
import { resolveGenerationProgress } from '@/lib/generation-progress'
import { cn } from '@/lib/utils'

export interface StudioGeneratingProgressProps {
  /** Whole-second elapsed time (parent's 1s timer). Internally smoothed to the 500ms tick. */
  elapsedSeconds: number
  /** 0-100 real progress (video polling / training). Present → drives percent directly, zero visual fork. */
  realProgress?: number
  /** Stage word — `generatingOverlayStages.*` for the estimate path, or a real status string when `realProgress` is set. */
  stageLabel: string
  /** Bottom parameter row, e.g. "12s · anima XL · 1:1". Omit for the compact/regenerate-overlay variant. */
  paramsLine?: string
  /** `full` = new-generation stage card (large digits + params row). `compact` = regenerate overlay on existing media (smaller digits, no params row). */
  variant?: 'full' | 'compact'
  /** True while the parent is holding this component mounted through the completion beat (close → hold → fade). */
  isCompleting?: boolean
  /** Fires once the full close/hold/fade sequence has played — parent unmounts on this. */
  onCompleteAnimationDone?: () => void
  /** Matches the art box's corner radius so the frame hugs it exactly. */
  cornerRadiusVar?: '--radius-xl' | '--radius-2xl'
  className?: string
}

/**
 * "裱框显影" — the progress frame described around the art box's own edge
 * (SVG rect, pathLength=100, stroke-dashoffset driven) + center digits +
 * stage word + optional params row.
 *
 * Spec: docs/plans/loading-language-2026-07.md §2.
 * Shared by every single-shot generation surface — GenerationPreview's
 * initial placeholder AND its image/video/audio regenerate overlays — so
 * the estimate/real-progress algorithm and the closing animation only
 * exist once.
 */
export function StudioGeneratingProgress({
  elapsedSeconds,
  realProgress,
  stageLabel,
  paramsLine,
  variant = 'full',
  isCompleting = false,
  onCompleteAnimationDone,
  cornerRadiusVar = '--radius-xl',
  className,
}: StudioGeneratingProgressProps) {
  const prefersReducedMotion = useReducedMotion()
  const reducedMotion = Boolean(prefersReducedMotion)

  // ── Sub-second smoothing ──────────────────────────────────────────
  // `elapsedSeconds` only ticks once/sec upstream; PROGRESS_TICK_MS (500ms)
  // recomputes need a finer clock so the frame doesn't visibly stall for
  // half a second. We interpolate using wall-clock time since the prop
  // last changed, re-rendered every tick.
  const [tick, setTick] = useState(0)
  const lastPropRef = useRef({ value: elapsedSeconds, at: performanceNow() })
  if (lastPropRef.current.value !== elapsedSeconds) {
    lastPropRef.current = { value: elapsedSeconds, at: performanceNow() }
  }

  useEffect(() => {
    if (isCompleting) return
    const id = setInterval(() => setTick((t) => t + 1), PROGRESS_TICK_MS)
    return () => clearInterval(id)
  }, [isCompleting])

  const smoothedElapsedSeconds = useMemo(() => {
    void tick
    const sinceProp = (performanceNow() - lastPropRef.current.at) / 1000
    return lastPropRef.current.value + Math.max(0, sinceProp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, elapsedSeconds])

  const { percent, stageKey } = resolveGenerationProgress({
    elapsedSeconds: smoothedElapsedSeconds,
    realProgress,
    isComplete: isCompleting,
    reducedMotion,
  })
  const roundedPercent = Math.round(percent)

  // ── Completion beat: close → hold → fade, then tell the parent ────
  // Reduced motion still keeps the opacity fade-out (spec: "完成闭合无动画,
  // 淡出保留(纯 opacity)") — only the dashoffset transition/breathing/
  // crossfade motion is stripped, via the CSS `no-preference` media guard
  // and `useCrossfadeLabel`'s reducedMotion branch above.
  const [closed, setClosed] = useState(false)
  const [fading, setFading] = useState(false)
  useEffect(() => {
    if (!isCompleting) {
      setClosed(false)
      setFading(false)
      return
    }
    setClosed(true)
    const fadeTimer = setTimeout(
      () => setFading(true),
      GENERATION_COMPLETE_ANIMATION.closeMs +
        GENERATION_COMPLETE_ANIMATION.holdMs,
    )
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
  const strokeDashoffset = 100 - roundedPercent

  return (
    <div
      role="progressbar"
      aria-valuenow={roundedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={currentLabel}
      className={cn(
        'pointer-events-none absolute inset-0 flex flex-col items-center justify-center',
        fading && 'opacity-0 transition-opacity duration-slow ease-standard',
        className,
      )}
      style={{
        ['--studio-generation-frame-radius' as string]: `var(${cornerRadiusVar})`,
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        {/* Geometry (x/y/width/height) lives in globals.css — calc() in SVG
            presentation *attributes* doesn't parse in Firefox; as CSS
            geometry properties it's safe everywhere. */}
        <rect pathLength={100} className="studio-generation-frame-track" />
        <rect
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={closed ? 0 : strokeDashoffset}
          className={cn(
            'studio-generation-frame',
            closed && 'studio-generation-frame--closing',
            !closed &&
              !reducedMotion &&
              stageKey === 'waiting' &&
              'studio-generation-frame--waiting',
          )}
        />
      </svg>

      <div
        className={cn(
          'flex flex-col items-center',
          isFull ? 'gap-1' : 'gap-0.5',
        )}
      >
        <p
          aria-hidden
          className={cn(
            'font-light tabular-nums text-foreground',
            isFull ? 'text-4xl' : 'text-2xl',
          )}
        >
          {roundedPercent}
          <span className="ml-0.5 text-lg text-muted-foreground">%</span>
        </p>
        <span className="relative inline-flex text-sm text-muted-foreground">
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

      {isFull && paramsLine && (
        <p className="absolute inset-x-0 bottom-3 text-center text-2xs tabular-nums text-muted-foreground">
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
