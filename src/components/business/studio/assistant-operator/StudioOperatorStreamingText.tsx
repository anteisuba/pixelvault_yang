'use client'

/**
 * 助手正文的**流式渲染件**（`pages/assistant-shell.md` §4.1 第一行 / §11.5 「按词淡入」）。
 *
 * ⭐ 由来（owner 2026-09-06「助手回复应该一个字一个字连续出」「缺少加载中的状态」）：
 * 正文此前是一坨砸出来的 —— 服务端等整份 turn JSON 收完才发一帧 `message`。现在
 * 服务端边收边吐 `message_delta`，这一颗负责让长出来的那几个字**看得出是在长**。
 *
 * ── 两件事，一颗组件 ──────────────────────────────────────────────
 *  · `text` 为空且还在流 → **占位脉冲**（三点）。它的高度**就是一行正文的高度**
 *    （`h-4` = `text-xs/leading-relaxed` 的行高），所以第一个字到达时那一行不跳。
 *  · `text` 有字 → 按词（中日韩按字）切片，新出现的那一片淡入 `--duration-fast`。
 *
 * ── ⚠ 为什么 key 用下标 ─────────────────────────────────────────────
 * 淡入靠的是**挂载动画**（`animate-in fade-in-0`）：老片段的 key 不变就不会重挂，
 * 也就不会重新淡一次；只有追加在末尾的新片段是新 key，于是只有它淡。
 * ⛔ 别改成按内容做 key —— 同一个词在一段话里出现两次就会撞 key，而表现是整段
 * 文字每来一个字就整体闪一下。
 * ⚠ 末尾那一片会随着字的到来**原地变长**（`夜` → `夜景`）：同一个 key、同一个
 * 节点、只换文本，所以它不重新淡 —— 这正是「连续长出来」而不是「一格一格跳」。
 *
 * ⚠ `motion-reduce` 直接显示：淡入是装饰，⛔ 不允许它成为看不看得见字的条件。
 */

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

/**
 * 切片规则。
 *
 * ⭐ 中日韩**逐字**、拉丁**逐词**：中文一句话里没有空格，按空白切等于整段一片，
 * 而整段一片就没有「一个字一个字」可言了 —— 而这正是 owner 要的那件事。
 * ⚠ 空白单独成片并**保留原样**（不 trim）：正文里的换行与缩进是内容的一部分，
 * `whitespace-pre-wrap` 要靠它们排版。
 */
const CJK =
  '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af'
const SLICE_PATTERN = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, 'g')

export function sliceStreamingText(text: string): string[] {
  return text.match(SLICE_PATTERN) ?? []
}

interface StudioOperatorStreamingTextProps {
  text: string
  /** 这一条还在长 —— 空正文时画占位脉冲，⛔ 不画一行空白。 */
  streaming?: boolean
  className?: string
}

export function StudioOperatorStreamingText({
  text,
  streaming = false,
  className,
}: StudioOperatorStreamingTextProps) {
  const t = useTranslations('StudioOperator')
  const slices = useMemo(() => sliceStreamingText(text), [text])

  if (slices.length === 0 && streaming) {
    return (
      <p
        data-testid="operator-message-pending"
        // ⚠ 高度写死成一行正文高（`text-xs` + `leading-relaxed` = 16px）：
        //   §4.1「骨架尺寸 = 内容尺寸」，第一个字到达时这一行不许跳。
        className={cn(
          'flex h-4 items-center gap-1 text-xs leading-relaxed',
          className,
        )}
        aria-label={t('streaming.pending')}
      >
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden
            style={{ animationDelay: `${dot * 140}ms` }}
            className="size-1 rounded-full bg-muted-foreground/70 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </p>
    )
  }

  return (
    <p
      data-testid="operator-message-text"
      data-streaming={streaming ? 'true' : 'false'}
      className={cn(
        'whitespace-pre-wrap text-xs leading-relaxed text-foreground',
        className,
      )}
    >
      {slices.map((slice, index) => (
        <span
          // ⚠ 下标就是「第几片」——换成内容 key 会撞，见头注。
          key={index}
          data-testid="operator-message-slice"
          className="animate-in fade-in-0 duration-(--duration-fast) ease-standard motion-reduce:animate-none"
        >
          {slice}
        </span>
      ))}
    </p>
  )
}
