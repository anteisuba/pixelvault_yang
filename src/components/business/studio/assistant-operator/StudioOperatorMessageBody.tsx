'use client'

/**
 * 助手正文那一格（2026-09-06 面板轮，第 4 / 5 件）。
 *
 * ── 三件事，一颗组件 ────────────────────────────────────────────
 *  · **无气泡、无边框、无底色**：正文就是沟里的一段字。两方靠头像与节点形状分
 *    （时间线沟本来就分得出来），⛔ 不靠色块分 —— 色块一加，一屏里每一条都在
 *    抢重量，而其中真正要读的只有最后两行。
 *  · **长回话自动折起来**（`collapseAfterLines`）：折起态只留**首句**，后面跟
 *    一颗「展开全文」。⚠ 判据数的是**换行数**不是渲染行数，理由见常量头注。
 *  · **`detail` 折成「为什么」**：正文只写结论 + 下一步，理由点开才看。
 *
 * ⚠ **流着的时候不折**：一条正在长出来的回复中途被折起来，用户看到的是字长到
 * 一半自己没了。折叠只对**定稿之后**的条目生效。
 * ⚠ 折叠开合是**局部 state**：它是一次性的阅读动作，不该占 store 的一格 ——
 * 而收放法则（拍板 7）把面板卸载一次之后重新收起，恰恰是对的（那时用户是在
 * 重新读这条会话）。
 */

import { useState } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  firstOperatorSentence,
  shouldCollapseOperatorText,
} from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'
import type {
  StudioOperatorAttachment,
  StudioOperatorMessageEntry,
} from '@/types/studio-assistant-operator'

import { StudioOperatorStreamingText } from './StudioOperatorStreamingText'

interface StudioOperatorMessageBodyProps {
  entry: StudioOperatorMessageEntry
}

/**
 * 正文那一段字 + 「展开全文」—— **实时线程与只读历史共用这一颗**
 * （2026-09-07 真机）。
 *
 * ⭐ 由来：历史里一条 8 行的正文整条铺开，既没有折叠开关也没有 `data-testid`。
 * 根因不是 `streaming` 没清零，而是历史那一支**压根走的是另一段 JSX**（一个裸
 * `<p>{entry.text}</p>`）—— 折叠逻辑只写在实时那一支里。⛔ 不在历史那边再抄一份：
 * 抄的那份哪天与这份分叉，表现是「刷新之后同一句话的折法变了」。
 */
export function StudioOperatorCollapsibleText({
  text,
  streaming = false,
  plain = false,
}: {
  text: string
  /** 流着的时候不折（字长到一半自己没了）—— 历史那一支恒为 `false`。 */
  streaming?: boolean
  /**
   * **一整段字，⛔ 不切片**（历史那一支）。
   *
   * ⚠ `StudioOperatorStreamingText` 把正文切成逐字的 `<span>` 并让新片淡入 ——
   * 那是「看得出在长」的手段，而历史是一次性铺出来的几十条已完成的话：切片在那里
   * 只换来成千上万个开屏就一起淡一遍的节点，还把一句连续的话在 DOM 上劈成碎片
   * （按文本找它的人 —— 读屏与用例 —— 就此找不到）。
   */
  plain?: boolean
}) {
  const t = useTranslations('StudioOperator')
  const [expanded, setExpanded] = useState(false)
  /**
   * ⭐ **揭示没走完就不折**（owner 2026-09-07 的打字机那一条）。
   *
   * 定稿帧到达时 `streaming` 就落了，而那时正文才写到一半 —— 只看 `streaming`
   * 的表现是一条正在一个字一个字长出来的长回复突然折成首句，用户看到的是
   * 「字长到一半自己没了」，比不做打字机还糟。
   */
  const [revealing, setRevealing] = useState(false)

  const collapsible =
    !streaming && !revealing && shouldCollapseOperatorText(text)
  const collapsed = collapsible && !expanded

  return (
    <>
      {collapsed ? (
        <p
          data-testid="operator-message-text"
          data-collapsed="true"
          className="whitespace-pre-wrap text-md leading-relaxed text-foreground"
        >
          {firstOperatorSentence(text)}
        </p>
      ) : plain ? (
        <p
          data-testid="operator-message-text"
          data-streaming="false"
          className="whitespace-pre-wrap text-md leading-relaxed text-foreground"
        >
          {text}
        </p>
      ) : (
        <StudioOperatorStreamingText
          text={text}
          streaming={streaming}
          onRevealingChange={setRevealing}
        />
      )}

      {collapsible ? (
        <button
          type="button"
          data-testid="operator-message-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-fit items-center gap-1 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? t('message.collapse') : t('message.expand')}
          <ChevronDown
            aria-hidden
            className={cn(
              'size-3 transition-transform duration-(--duration-fast) ease-standard motion-reduce:transition-none',
              expanded && 'rotate-180',
            )}
          />
        </button>
      ) : null}
    </>
  )
}

export function StudioOperatorMessageBody({
  entry,
}: StudioOperatorMessageBodyProps) {
  const t = useTranslations('StudioOperator')

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <StudioOperatorCollapsibleText
        text={entry.text}
        streaming={entry.streaming ?? false}
      />

      {/* ⚠ 没有 `detail` 就**什么都不画**（⛔ 不画一颗点开是空的「为什么」）。 */}
      {entry.detail ? (
        <details data-testid="operator-message-why" className="min-w-0">
          <summary className="w-fit cursor-pointer list-none text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {t('message.why')}
          </summary>
          <p className="mt-1 whitespace-pre-wrap border-l border-border pl-2.5 text-2sm leading-relaxed text-muted-foreground">
            {entry.detail}
          </p>
        </details>
      ) : null}
    </div>
  )
}

export function StudioOperatorUserText({
  text,
  attachments,
}: {
  text: string
  attachments: readonly StudioOperatorAttachment[]
}) {
  const displayText = attachments.reduce(
    (value, attachment) =>
      attachment.kind === 'video' || attachment.kind === 'audio'
        ? value.replaceAll(
            `${attachment.label} (${attachment.kind}) ${attachment.url}`,
            `@${attachment.label}`,
          )
        : value,
    text,
  )
  const images = new Map(
    attachments
      .filter((item) => item.kind === 'image')
      .map((item) => [item.label.toLowerCase(), item]),
  )
  return (
    <p
      data-testid="operator-user-text"
      className="whitespace-pre-wrap text-md font-medium leading-relaxed text-foreground"
    >
      {displayText
        .split(/(\breference image [1-9]\d*\b)/gi)
        .map((part, index) => {
          const attachment = /^reference image [1-9]\d*$/i.test(part)
            ? images.get(part.toLowerCase())
            : undefined
          return attachment ? (
            <span
              key={index}
              className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/50 px-1 py-0.5 align-middle text-2sm font-normal"
            >
              <Image
                src={attachment.thumbnailUrl || attachment.url}
                alt={attachment.label}
                width={24}
                height={24}
                unoptimized
                className="size-6 shrink-0 rounded object-cover"
              />
              <span>{part}</span>
            </span>
          ) : (
            part
          )
        })}
    </p>
  )
}
