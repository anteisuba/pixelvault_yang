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
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  firstOperatorSentence,
  shouldCollapseOperatorText,
} from '@/lib/studio-operator-timeline'
import { cn } from '@/lib/utils'
import type { StudioOperatorMessageEntry } from '@/types/studio-assistant-operator'

import { StudioOperatorStreamingText } from './StudioOperatorStreamingText'

interface StudioOperatorMessageBodyProps {
  entry: StudioOperatorMessageEntry
}

export function StudioOperatorMessageBody({
  entry,
}: StudioOperatorMessageBodyProps) {
  const t = useTranslations('StudioOperator')
  const [expanded, setExpanded] = useState(false)

  const streaming = entry.streaming ?? false
  const collapsible = !streaming && shouldCollapseOperatorText(entry.text)
  const collapsed = collapsible && !expanded

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {collapsed ? (
        <p
          data-testid="operator-message-text"
          data-collapsed="true"
          className="whitespace-pre-wrap text-md leading-relaxed text-foreground"
        >
          {firstOperatorSentence(entry.text)}
        </p>
      ) : (
        <StudioOperatorStreamingText text={entry.text} streaming={streaming} />
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
