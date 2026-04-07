'use client'

import { useCallback, useEffect, useRef, type ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/utils'

interface CharParticle {
  char: string
  originX: number
  originY: number
  x: number
  y: number
  vx: number
  vy: number
  width: number
}

interface TextRepelProps extends ComponentPropsWithoutRef<'div'> {
  text: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  color?: string
  repelRadius?: number
  repelForce?: number
  lineHeight?: number
  letterSpacing?: number
}

export function TextRepel({
  text,
  className,
  fontSize = 18,
  fontFamily = '"Space Grotesk", sans-serif',
  fontWeight = '400',
  color = '#141413',
  repelRadius = 80,
  repelForce = 0.4,
  lineHeight = 1.6,
  letterSpacing = 0,
  ...props
}: TextRepelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<CharParticle[]>([])
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const rafRef = useRef<number | null>(null)
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1

  const buildParticles = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = container.offsetWidth
    const h = container.offsetHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)

    // Resolve CSS variables for canvas
    const computedStyle = getComputedStyle(container)
    const resolvedFamily = fontFamily.startsWith('var(')
      ? computedStyle.getPropertyValue(fontFamily.slice(4, -1)).trim() || 'sans-serif'
      : fontFamily
    resolvedFontRef.current = resolvedFamily
    const font = `${fontWeight} ${fontSize}px ${resolvedFamily}`
    ctx.font = font
    ctx.textBaseline = 'top'

    const particles: CharParticle[] = []
    const leading = fontSize * lineHeight
    const chars = text.split('')

    let cursorX = 0
    let cursorY = 0

    for (const char of chars) {
      const charWidth = ctx.measureText(char).width

      if (cursorX + charWidth > w && char !== ' ') {
        cursorX = 0
        cursorY += leading
      }

      if (char === '\n') {
        cursorX = 0
        cursorY += leading
        continue
      }

      particles.push({
        char,
        originX: cursorX,
        originY: cursorY,
        x: cursorX,
        y: cursorY,
        vx: 0,
        vy: 0,
        width: charWidth,
      })

      cursorX += charWidth + letterSpacing
    }

    particlesRef.current = particles

    const totalHeight = cursorY + leading
    const newH = Math.max(totalHeight + fontSize, 200)
    canvas.height = newH * dpr
    canvas.style.height = `${newH}px`
    container.style.minHeight = `${newH}px`
    ctx.scale(dpr, dpr)
  }, [text, fontSize, fontFamily, fontWeight, lineHeight, letterSpacing, dpr])

  const resolvedFontRef = useRef('sans-serif')
  const configRef = useRef({ fontSize, fontWeight, color, repelRadius, repelForce, dpr })
  configRef.current = { fontSize, fontWeight, color, repelRadius, repelForce, dpr }

  useEffect(() => {
    buildParticles()

    function draw() {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const cfg = configRef.current
      const w = canvas.width / cfg.dpr
      const h = canvas.height / cfg.dpr

      ctx.clearRect(0, 0, w, h)
      ctx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${resolvedFontRef.current}`
      ctx.textBaseline = 'top'
      ctx.fillStyle = cfg.color

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const r2 = cfg.repelRadius * cfg.repelRadius
      const particles = particlesRef.current

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const dx = p.x - mx
        const dy = p.y - my
        const dist2 = dx * dx + dy * dy

        if (dist2 < r2 && dist2 > 0) {
          const dist = Math.sqrt(dist2)
          const force = (1 - dist / cfg.repelRadius) * cfg.repelForce
          p.vx += (dx / dist) * force * cfg.fontSize
          p.vy += (dy / dist) * force * cfg.fontSize
        }

        // spring back to origin
        const sx = p.originX - p.x
        const sy = p.originY - p.y
        p.vx += sx * 0.08
        p.vy += sy * 0.08

        // damping
        p.vx *= 0.85
        p.vy *= 0.85

        p.x += p.vx
        p.y += p.vy

        ctx.fillText(p.char, p.x, p.y)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    const handleResize = () => {
      buildParticles()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [buildParticles])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      mouseRef.current.x = e.clientX - rect.left
      mouseRef.current.y = e.clientY - rect.top
    },
    [],
  )

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.x = -9999
    mouseRef.current.y = -9999
  }, [])

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="block size-full"
        aria-label={text}
      />
    </div>
  )
}
