'use client'

import { useEffect, useRef, useState } from 'react'

import { useChatBubbleReveal } from '@/hooks/use-chat-bubble-reveal'
import { chatBubbles } from '@/lib/voiceroom-chat-prompt'
import { cn } from '@/lib/utils'

const BUBBLE_CLASS =
  'w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 text-md leading-reading text-foreground'

/**
 * 她在聊天时的回复（②c-2，聊天并回对话）：一行一个气泡，像发消息一样一条一条出——
 * 后一个要等前一个出完、再停一会儿（三点「正在输入」）才露面。
 *
 * `live`：这一段是挂上时还在写的那段才一条一条出；翻历史 / 重挂一律整段直接摆出来。
 */
export function StudioOperatorChatBubbles({
  text,
  streaming,
}: {
  text: string
  streaming: boolean
}) {
  const [live] = useState(streaming)
  const bubbles = chatBubbles(text)
  const revealed = useChatBubbleReveal(bubbles, !streaming)
  const shown = live ? revealed : bubbles.length
  const endRef = useRef<HTMLSpanElement | null>(null)
  // 新气泡 / 三点露面不改字数，对话那边的「滚到底」看不见：这里自己往下带一下。
  useEffect(() => {
    if (live) endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [live, shown])

  const visible = bubbles.slice(0, shown)
  // 前一个写完、下一个还没开头（刚换行）也算在路上。
  const waiting =
    live &&
    (shown < bubbles.length ||
      (streaming && visible.length > 0 && /\n\s*$/.test(text)))

  return (
    <div
      data-testid="operator-chat-bubbles"
      className="flex min-w-0 flex-col items-start gap-1.5"
    >
      {visible.map((bubble, index) => (
        <p
          key={index}
          data-testid="operator-chat-bubble"
          className={cn(
            BUBBLE_CLASS,
            'animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-standard motion-reduce:animate-none',
          )}
        >
          {bubble}
        </p>
      ))}
      {waiting ? (
        <span
          aria-hidden
          data-testid="operator-chat-typing"
          className={cn(BUBBLE_CLASS, 'flex items-center gap-1 py-3')}
        >
          <i className="size-1.25 rounded-full bg-muted-foreground animate-spinner-dot-1 motion-reduce:animate-none" />
          <i className="size-1.25 rounded-full bg-muted-foreground animate-spinner-dot-2 motion-reduce:animate-none" />
          <i className="size-1.25 rounded-full bg-muted-foreground animate-spinner-dot-3 motion-reduce:animate-none" />
        </span>
      ) : null}
      <span ref={endRef} aria-hidden />
    </div>
  )
}
