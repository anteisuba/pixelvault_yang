'use client'

import { useCallback, useRef, useState, type ComponentPropsWithoutRef } from 'react'

import { cn } from '@/lib/utils'

interface ImageCompareProps extends ComponentPropsWithoutRef<'div'> {
  beforeSrc: string
  afterSrc: string
  beforeLabel?: string
  afterLabel?: string
}

export function ImageCompare({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Reference',
  afterLabel = 'Generated',
  className,
  ...props
}: ImageCompareProps) {
  const [position, setPosition] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = clientX - rect.left
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setPosition(pct)
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      updatePosition(e.clientX)
    },
    [updatePosition],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      updatePosition(e.clientX)
    },
    [updatePosition],
  )

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative select-none overflow-hidden rounded-2xl cursor-col-resize',
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      {...props}
    >
      {/* After (generated) — full width background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt={afterLabel}
        className="block w-full h-auto"
        draggable={false}
      />

      {/* Before (reference) — clipped by position */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt={beforeLabel}
          className="block h-full object-cover"
          style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100vw' }}
          draggable={false}
        />
      </div>

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.3)]"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center size-8 rounded-full bg-white shadow-md border border-border/40">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-foreground/60">
            <path d="M4 3L1 7L4 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 3L13 7L10 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute top-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-semibold text-white backdrop-blur-sm">
        {beforeLabel}
      </span>
      <span className="absolute top-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-[0.65rem] font-semibold text-white backdrop-blur-sm">
        {afterLabel}
      </span>
    </div>
  )
}
