'use client'

import React, { useImperativeHandle, useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

interface PulsatingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pulseColor?: string
  duration?: string
  distance?: string
  variant?: 'pulse' | 'ripple'
}

export const PulsatingButton = React.forwardRef<
  HTMLButtonElement,
  PulsatingButtonProps
>(
  (
    {
      className,
      children,
      pulseColor,
      duration = '1.5s',
      distance = '8px',
      variant = 'pulse',
      ...props
    },
    ref,
  ) => {
    const innerRef = useRef<HTMLButtonElement>(null)
    useImperativeHandle(ref, () => innerRef.current!)

    useLayoutEffect(() => {
      const button = innerRef.current
      if (!button) return

      if (pulseColor) {
        button.style.removeProperty('--bg')
        return
      }

      let animationFrameId = 0
      let currentBg = ''

      const updateBg = () => {
        animationFrameId = 0

        const nextBg = getComputedStyle(button).backgroundColor
        if (nextBg === currentBg) return

        currentBg = nextBg
        button.style.setProperty('--bg', nextBg)
      }

      const scheduleBgUpdate = () => {
        if (animationFrameId) return
        animationFrameId = window.requestAnimationFrame(updateBg)
      }

      updateBg()

      const themeObserver = new MutationObserver(scheduleBgUpdate)
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })

      const buttonObserver = new MutationObserver(scheduleBgUpdate)
      buttonObserver.observe(button, {
        attributes: true,
      })

      const syncEvents = [
        'blur',
        'focus',
        'pointerenter',
        'pointerleave',
      ] as const

      for (const eventName of syncEvents) {
        button.addEventListener(eventName, scheduleBgUpdate)
      }

      return () => {
        if (animationFrameId) {
          window.cancelAnimationFrame(animationFrameId)
        }

        themeObserver.disconnect()
        buttonObserver.disconnect()

        for (const eventName of syncEvents) {
          button.removeEventListener(eventName, scheduleBgUpdate)
        }
      }
    }, [pulseColor])

    return (
      <button
        ref={innerRef}
        className={cn(
          'bg-primary text-primary-foreground relative flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-center',
          className,
        )}
        style={
          {
            ...(pulseColor && { '--pulse-color': pulseColor }),
            '--duration': duration,
            '--distance': distance,
          } as React.CSSProperties
        }
        {...props}
      >
        <span className="relative z-10">{children}</span>
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 rounded-[inherit] bg-inherit',
            // ⚠ 是 animate-pulse-**glow** 不是 animate-pulse：后者是 Tailwind
            // 内建的透明度呼吸，全站骨架屏都在用。这颗按钮要的是 box-shadow
            // 光晕，靠下面那三个内联变量驱动 —— 两者同名会把内建那条盖死
            // （globals.css 里那段注释记着这个坑的完整经过）。
            variant === 'pulse' ? 'animate-pulse-glow' : 'animate-pulse-ripple',
          )}
        />
      </button>
    )
  },
)

PulsatingButton.displayName = 'PulsatingButton'
