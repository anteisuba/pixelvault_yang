'use client'

/**
 * 台词的**行内标记预览**（画板 `AudioSelected.dc.html` 提示词栏首行那一句：
 * `[愤怒][咬牙切齿]把她还给我！ [低声]……你听见了吗。`）。
 *
 * 标记渲染成 chip、正文原样 —— 与 `MentionChip` 渲染 @ chip 同一条分工：解析走纯函数
 * （`parseVoiceMarkup`），这里只负责画。
 *
 * ⚠ 这是**只读**的一层，今天只剩**快速听**里那段裸台词在用。提示词栏里的 chip
 * 已经进到输入框内部（`NodePromptBar.renderValue` + `renderVoicePromptValue`，
 * S0-fix2），⛔ 别再把这一行搬回栏上方——画板里栏上方没有第二行。
 */

import { parseVoiceMarkup } from '@/lib/voice-markup'
import { cn } from '@/lib/utils'
import { findVoiceMarkupTag } from '@/lib/voice-markup'

export interface AudioLineChipsProps {
  readonly text: string
  /** `plain` = 快速听里的裸正文（栏内 chip 走 `renderVoicePromptValue`）。 */
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
