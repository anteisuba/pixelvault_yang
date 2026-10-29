'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'

import { useChatBubbleReveal } from '@/hooks/use-chat-bubble-reveal'
import { chatBubbles, stickerUrlOf } from '@/lib/chat-voice'
import { cn } from '@/lib/utils'

/** 表情包裸图的边长（与 `size-30` 同一个数）。 */
const STICKER_SIZE_PX = 120

const BUBBLE_CLASS =
  'w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 text-md leading-reading text-foreground'

/** 还在写的那段里**已经写完**的几行（最后一行换了行才算完）；写完了 = 全部。 */
function finishedBubbles(text: string, streaming: boolean): string[] {
  if (!streaming) return chatBubbles(text)
  return chatBubbles(text.slice(0, text.lastIndexOf('\n') + 1))
}

/**
 * 她在聊天时的回复（②c-2，聊天并回对话；出场照用户 10-26 定的样件 F）：一行一个气泡，
 * 像发消息一样——先三点「正在输入」，一行写完整条一次弹出，后一条等前一条出完再停一会儿
 * （500ms + 每字 70ms）。⛔ 一个字一个字打、⛔ 末尾光标。
 *
 * 挂上时还在写的那段才一条一条出；翻历史 / 重挂一律整段直接摆出来。
 */
export function StudioOperatorChatBubbles({
  text,
  streaming,
  renderBubble = (bubble) => bubble,
}: {
  text: string
  streaming: boolean
  /** 一行气泡里的字怎么画 —— 正文那一格借它把 `图_N` 换成缩略图（与非聊天正文同一条规则）。 */
  renderBubble?: (bubble: string) => ReactNode
}) {
  const [live] = useState(streaming)
  const bubbles = finishedBubbles(text, streaming)
  const revealed = useChatBubbleReveal(bubbles, !streaming)
  const shown = live ? Math.min(revealed, bubbles.length) : bubbles.length
  const endRef = useRef<HTMLSpanElement | null>(null)
  // 新气泡 / 三点露面不改字数，对话那边的「滚到底」看不见：这里自己往下带一下。
  useEffect(() => {
    if (live) endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [live, shown])

  const visible = bubbles.slice(0, shown)
  // 还在写、或者写完的还没轮到露面：末尾摆三点。
  const typing = live && (streaming || shown < bubbles.length)

  return (
    <div
      data-testid="operator-chat-bubbles"
      className="flex min-w-0 flex-col items-start gap-1.5"
    >
      {visible.map((bubble, index) => {
        const sticker = stickerUrlOf(bubble)
        // 她发的表情包（4d，owner 10-29 定 A）：不套气泡，就一张图，弹一下出现。
        return sticker ? (
          <Image
            key={index}
            src={sticker}
            alt=""
            width={STICKER_SIZE_PX}
            height={STICKER_SIZE_PX}
            unoptimized
            data-testid="operator-chat-sticker"
            className={cn(
              'size-30 object-contain',
              live && 'operator-chat-sticker-in',
            )}
          />
        ) : (
          <p
            key={index}
            data-testid="operator-chat-bubble"
            className={cn(BUBBLE_CLASS, live && 'operator-chat-bubble-in')}
          >
            {renderBubble(bubble)}
          </p>
        )
      })}
      {typing ? (
        <span
          aria-hidden
          data-testid="operator-chat-typing"
          className={cn(BUBBLE_CLASS, 'operator-chat-typing flex gap-1 py-3')}
        >
          <i className="size-1.5 rounded-full bg-muted-foreground" />
          <i className="size-1.5 rounded-full bg-muted-foreground" />
          <i className="size-1.5 rounded-full bg-muted-foreground" />
        </span>
      ) : null}
      <span ref={endRef} aria-hidden />
    </div>
  )
}
