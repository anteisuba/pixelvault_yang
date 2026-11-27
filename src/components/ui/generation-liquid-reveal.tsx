'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'

import { GENERATION_LIQUID_REVEAL } from '@/constants/motion'
import { cn } from '@/lib/utils'

interface GenerationLiquidRevealProps {
  /** 唯一标识本次新出图（通常为 `generation.id`），切换新图时重新触发。 */
  revealKey: string
  /**
   * 仅在图像「刚从生成中变为完成」时传 `true`。
   * 历史记录切换与画廊列表必须传 `false`（继续走轻量 `useMediaReveal`），
   * 避免高频列表挂载 SVG 滤镜。
   */
  play: boolean
  /** 三段液态凝结彻底完成（`h = 1` 且卸载滤镜）后回调。 */
  onComplete?: () => void
  className?: string
  children: ReactNode
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function hashSeed(key: string): number {
  let hash = 7
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 997
  }
  return Math.max(1, hash)
}

/**
 * AI 新出图三段液态凝结揭示（吸收自 Bencho `#17 Generate`）：
 * 液态扰动（feTurbulence + feDisplacementMap）+ 高斯柔焦（feGaussianBlur）+
 * 线性对比度收敛（feComponentTransfer），按 `smoothstep` 三阶段在 ~1.05s 内凝结清晰。
 *
 * - 全程通过 DOM ref 推进 SVG 滤镜属性，动画期间零 React 重渲染。
 * - `h === 1` 后立刻移除行内 `filter` 并卸载 `<svg>` 滤镜节点，静止图保持零滤镜硬件锐度。
 * - `prefers-reduced-motion` 或 `play={false}` 下完全零开销直出子节点。
 */
export function GenerationLiquidReveal({
  revealKey,
  play,
  onComplete,
  className,
  children,
}: GenerationLiquidRevealProps) {
  const reducedMotion = Boolean(useReducedMotion())
  const rawId = useId()
  const filterId = `liquid-reveal-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const [finishedKey, setFinishedKey] = useState<string | null>(null)
  const isPlaying = play && !reducedMotion && finishedKey !== revealKey

  const contentRef = useRef<HTMLDivElement>(null)
  const turbRef = useRef<SVGFETurbulenceElement>(null)
  const dispRef = useRef<SVGFEDisplacementMapElement>(null)
  const blurRef = useRef<SVGFEGaussianBlurElement>(null)
  const funcRRef = useRef<SVGFEFuncRElement>(null)
  const funcGRef = useRef<SVGFEFuncGElement>(null)
  const funcBRef = useRef<SVGFEFuncBElement>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!isPlaying) return

    const contentEl = contentRef.current
    const startTime = performance.now()
    let rafId = 0
    let cancelled = false

    const applyProgress = (h: number) => {
      const k = smoothstep(0.1, 0.82, h)
      const r = smoothstep(0.05, 0.9, h)
      const baseFreq =
        GENERATION_LIQUID_REVEAL.baseFreq +
        GENERATION_LIQUID_REVEAL.freqAmp * Math.sin(h * 4.4)
      const dispScale =
        GENERATION_LIQUID_REVEAL.displacementMaxPx * Math.pow(1 - r, 1.5)
      const blurStd = GENERATION_LIQUID_REVEAL.blurMaxPx * Math.pow(1 - k, 2.2)
      const slope =
        GENERATION_LIQUID_REVEAL.contrastMax -
        (GENERATION_LIQUID_REVEAL.contrastMax - 1) * k
      const intercept = 0.9 - 0.9 * slope

      const freqStr = `${baseFreq.toFixed(5)} ${baseFreq.toFixed(5)}`
      turbRef.current?.setAttribute('baseFrequency', freqStr)
      dispRef.current?.setAttribute('scale', dispScale.toFixed(2))
      blurRef.current?.setAttribute('stdDeviation', blurStd.toFixed(2))

      const slopeStr = slope.toFixed(3)
      const interceptStr = intercept.toFixed(3)
      for (const fn of [funcRRef.current, funcGRef.current, funcBRef.current]) {
        if (!fn) continue
        fn.setAttribute('slope', slopeStr)
        fn.setAttribute('intercept', interceptStr)
      }

      if (contentEl) {
        const opacity = 0.35 + 0.65 * smoothstep(0, 0.22, h)
        const scale = 1 + 0.024 * (1 - k)
        contentEl.style.opacity = opacity.toFixed(3)
        contentEl.style.transform = `scale(${scale.toFixed(4)})`
      }
    }

    applyProgress(0)

    const tick = () => {
      if (cancelled) return
      const elapsed = Math.max(0, performance.now() - startTime)
      const h = Math.min(1, elapsed / GENERATION_LIQUID_REVEAL.durationMs)

      if (h >= 1) {
        if (contentEl) {
          contentEl.style.opacity = ''
          contentEl.style.transform = ''
          contentEl.style.filter = ''
        }
        setFinishedKey(revealKey)
        onCompleteRef.current?.()
        return
      }

      applyProgress(h)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      if (contentEl) {
        contentEl.style.opacity = ''
        contentEl.style.transform = ''
        contentEl.style.filter = ''
      }
    }
  }, [isPlaying, revealKey])

  if (!isPlaying) {
    return (
      <div
        data-slot="generation-liquid-reveal"
        data-liquid-reveal="idle"
        className={className}
      >
        {children}
      </div>
    )
  }

  const initialSlope = GENERATION_LIQUID_REVEAL.contrastMax
  const initialIntercept = Number((0.9 - 0.9 * initialSlope).toFixed(3))
  const seed = hashSeed(revealKey)

  return (
    <div
      data-slot="generation-liquid-reveal"
      data-liquid-reveal="active"
      className={cn('relative', className)}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <defs>
          <filter
            id={filterId}
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency={`${GENERATION_LIQUID_REVEAL.baseFreq} ${GENERATION_LIQUID_REVEAL.baseFreq}`}
              numOctaves={GENERATION_LIQUID_REVEAL.octaves}
              seed={seed}
              result="noise"
            />
            <feDisplacementMap
              ref={dispRef}
              in="SourceGraphic"
              in2="noise"
              scale={GENERATION_LIQUID_REVEAL.displacementMaxPx}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur
              ref={blurRef}
              in="displaced"
              stdDeviation={GENERATION_LIQUID_REVEAL.blurMaxPx}
              result="blurred"
            />
            <feComponentTransfer in="blurred">
              <feFuncR
                ref={funcRRef}
                type="linear"
                slope={initialSlope}
                intercept={initialIntercept}
              />
              <feFuncG
                ref={funcGRef}
                type="linear"
                slope={initialSlope}
                intercept={initialIntercept}
              />
              <feFuncB
                ref={funcBRef}
                type="linear"
                slope={initialSlope}
                intercept={initialIntercept}
              />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      <div
        ref={contentRef}
        className="size-full"
        style={{ filter: `url(#${filterId})` }}
      >
        {children}
      </div>
    </div>
  )
}
