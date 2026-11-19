'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { ChevronDown } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useChatBubbleReveal } from '@/hooks/use-chat-bubble-reveal'
import { chatBubbles, greetingParagraphs, stickerUrlOf } from '@/lib/chat-voice'
import { cn } from '@/lib/utils'

/** 表情包裸图的边长（与 `size-30` 同一个数）。 */
const STICKER_SIZE_PX = 120

/** 手机上一边最多占 5/6：长句撑满一整列就成了卡片，不像在聊天（你的那句同一条）。 */
const BUBBLE_CLASS =
  'w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border/80 bg-card px-3.5 py-2.5 text-md leading-reading text-foreground shadow-ring max-md:max-w-5/6'

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

/**
 * 她卡上的开场白（11-18 真机：拆成 7 个小气泡读着碎）：开场白是卡作者写的一整段叙事，整块一个气泡，
 * 一行一段、段间留行距；`*动作*` 去掉星号用次要色（⛔ 斜体：中文斜体是假斜体），台词正常色。
 * ⚠ 只给开场白用：她平时的回复照旧一行一个气泡、动作藏掉（`StudioOperatorChatBubbles`）。
 */
export function StudioOperatorGreetingText({
  text,
  foldable = false,
}: {
  text: string
  /**
   * 你已经开口了（它进了线程）：长开场白收成三行 +「展开全文」（11-18 owner：每个新对话顶上
   * 一大段剧情占掉半屏）。没开口前摆在空态位置上的那份不收（`false`）。
   */
  foldable?: boolean
}) {
  const t = useTranslations('StudioOperator')
  const [expanded, setExpanded] = useState(false)
  const paragraphs = greetingParagraphs(text)
  const long =
    paragraphs.length > GREETING_FOLD.paragraphs ||
    text.length > GREETING_FOLD.chars
  const folded = foldable && long && !expanded
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <GreetingBody paragraphs={paragraphs} folded={folded} />
      {foldable && long ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="operator-greeting-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('message.collapse') : t('message.expand')}
          <ChevronDown
            aria-hidden
            className={cn(
              'transition-transform duration-fast ease-standard motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </Button>
      ) : null}
    </div>
  )
}

/** 收起时留几行、多长才收（段数或字数过一条就收）。 */
const GREETING_FOLD = { paragraphs: 3, chars: 160 } as const

function GreetingBody({
  paragraphs,
  folded,
}: {
  paragraphs: ReturnType<typeof greetingParagraphs>
  folded: boolean
}) {
  return (
    <div
      data-testid="operator-greeting-text"
      {...(folded ? { 'data-folded': 'true' } : {})}
      className={BUBBLE_CLASS}
    >
      {/* 收起 = 整块按三行截断（`line-clamp` 跨段落数行），⛔ 拆掉段落：读屏与「展开」后是同一份。
          ⚠ 截断挂在**没有内边距的里层**（11-19 真机）：挂在气泡本身上时 `overflow:hidden` 只裁到
          内边距外沿，第 4 行的上半截落在底部 `py-2` 里露出来，像渲染错了。 */}
      <div
        data-testid="operator-greeting-clamp"
        className={folded ? 'line-clamp-3' : 'flex flex-col gap-3'}
      >
        {paragraphs.map((runs, index) => (
          <p key={index} data-testid="operator-greeting-paragraph">
            {runs.map((run, at) => (
              <span
                key={at}
                {...(run.action
                  ? {
                      'data-testid': 'operator-greeting-action',
                      className: 'text-muted-foreground',
                    }
                  : {})}
              >
                {at > 0 ? ' ' : ''}
                {run.text}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  )
}
