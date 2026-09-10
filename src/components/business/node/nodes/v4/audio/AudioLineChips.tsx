'use client'

/**
 * 台词的**行内标记预览**（画板 `AudioSelected.dc.html` 提示词栏首行那一句：
 * `[愤怒][咬牙切齿]把她还给我！ [低声]……你听见了吗。`）。
 *
 * 标记渲染成 chip、正文原样 —— 与 `TextBody` 渲染 @ chip 同一条分工：解析走纯函数
 * （`parseVoiceMarkup`），这里只负责画。
 *
 * ⚠ 这是**只读**的一层。真正可编辑的是提示词栏里的 textarea，文本才是真值
 * （见 `lib/voice-markup.ts` 头注）。缺 prop 记一笔：`NodePromptBar` 今天无法在
 * 输入框**内部**画 chip（没有 overlay / renderValue 入口），所以这一行浮在栏上方
 * ——画板里它是同一块玻璃的第一行。
 */

import { parseVoiceMarkup } from '@/lib/voice-markup'
import { cn } from '@/lib/utils'
import { findVoiceMarkupTag } from '@/lib/voice-markup'

export interface AudioLineChipsProps {
  readonly text: string
  /** `bar` = 提示词栏上方那条玻璃行；`plain` = 快速听里的裸正文。 */
  readonly variant?: 'bar' | 'plain'
  readonly className?: string
}

export function AudioLineChips({
  text,
  variant = 'bar',
  className,
}: AudioLineChipsProps) {
  const segments = parseVoiceMarkup(text)
  if (segments.length === 0) return null

  return (
    <p
      data-audio-line-chips={variant}
      className={cn(
        'max-w-full text-2sm leading-6 text-foreground',
        variant === 'bar' &&
          'rounded-node px-3 py-1.5 surface-glass shadow-node-chrome corner-squircle',
        className,
      )}
    >
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <span
            key={index}
            data-audio-line-marker={segment.token.raw}
            className={cn(
              'mr-0.5 inline-flex items-center rounded-sm px-1.5 align-middle text-2xs',
              // 认得出的标签 = 实心黑底白字（画板 `.em`）；自定义描述 = 灰底
              // （画板 `.em.soft`）。对比度 `contrast-check` 2026-09-10：
              // `primary-foreground` 对 `primary` 18.68；`foreground` 对
              // `surface-fill` 17.4x —— 两种都远过 4.5。
              findVoiceMarkupTag(segment.token.label)
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-fill text-foreground',
            )}
          >
            {segment.token.raw}
          </span>
        ),
      )}
    </p>
  )
}
