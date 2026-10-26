'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import { CHAT_BUBBLE_PAUSE } from '@/constants/chat-voice'

/** 前一个气泡有多长，后一个之前就停多久（封顶）。 */
export function chatBubblePauseMs(previous: string): number {
  return Math.min(
    CHAT_BUBBLE_PAUSE.maxMs,
    CHAT_BUBBLE_PAUSE.baseMs + previous.length * CHAT_BUBBLE_PAUSE.perCharMs,
  )
}

/**
 * 像发消息一样一条一条出（10-26「更像真人」F）：她的回复按行拆成几个气泡，后一个气泡要等前一个出完、
 * 再停一会儿（「正在输入…」）才露面——模型写得再快，读起来也有节奏。
 *
 * 返回现在能露几个。`done`（写完了）且全都露完 → `onRevealed` 一次（换成真台词）。
 * 减少动态效果时不停顿。⚠ 换一段（查完资料重起）由调用方换 key 重挂，这里不认。
 */
export function useChatBubbleReveal(
  bubbles: readonly string[],
  done: boolean,
  onRevealed?: () => void,
): number {
  const reduceMotion = useReducedMotion()
  const [shown, setShown] = useState(1)
  const revealedRef = useRef(onRevealed)
  useEffect(() => {
    revealedRef.current = onRevealed
  }, [onRevealed])

  const previous = bubbles[shown - 1] ?? ''
  const waiting = shown < bubbles.length
  const finished = done && !waiting

  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(
      () => setShown((count) => count + 1),
      reduceMotion ? 0 : chatBubblePauseMs(previous),
    )
    return () => window.clearTimeout(timer)
  }, [waiting, shown, previous, reduceMotion])

  useEffect(() => {
    if (!finished) return
    const timer = window.setTimeout(() => revealedRef.current?.(), 0)
    return () => window.clearTimeout(timer)
  }, [finished])

  return shown
}
