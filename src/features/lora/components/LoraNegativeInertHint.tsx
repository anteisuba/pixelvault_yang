'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const TAP_HINT_MS = 2000

interface LoraNegativeInertHintProps {
  /** 当前底模 CFG 1、负面词不起作用 —— 只有这时才出说明。 */
  inert: boolean
  hint: string
  /** 负面 chip 本身（它自己的 onClick 在 inert 时要什么都不做）。 */
  children: ReactNode
}

/**
 * 负面 chip 在 CFG 1 底模时的那句说明（④ 画板 N2）：鼠标悬停出；触屏没有悬停，点一下
 * 在 chip 上方出、2 秒自己收。不 inert 时说明永远不出。
 */
export function LoraNegativeInertHint({
  inert,
  hint,
  children,
}: LoraNegativeInertHintProps) {
  const [open, setOpen] = useState(false)
  const pointerType = useRef<string>('mouse')
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    [],
  )

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={inert && open} onOpenChange={setOpen}>
        <TooltipTrigger
          asChild
          onPointerDown={(event) => {
            pointerType.current = event.pointerType
          }}
          onClick={(event) => {
            if (!inert) return
            // 拦下 Radix「点了就关」那一步，否则刚打开就被关上。
            event.preventDefault()
            setOpen(true)
            if (pointerType.current === 'mouse') return
            if (timer.current != null) window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => setOpen(false), TAP_HINT_MS)
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-64">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
