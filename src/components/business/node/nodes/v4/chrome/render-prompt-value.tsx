'use client'

/**
 * `NodePromptBar.renderValue` 的两个现成实现（@ 引用 / @ 引用 + 语气标记）。
 *
 * ⚠ 这里画出来的字符必须与 `value` **逐字符相同**：镜像层与 textarea 分毫不差地
 * 排版，光标才落在看到的字上。要藏的字符（方括号、强度前缀）用
 * `PromptBarMarkHidden` 变透明 —— 它们顺手就是 chip 的内边距。⛔ 不删字符、
 * ⛔ 不加 `padding`、⛔ 不塞缩略图（见 `PromptBarMark` 头注）。
 */

import type { ReactNode } from 'react'

import {
  VOICE_MARKUP,
  VOICE_MARKUP_INTENSITIES,
  VOICE_MARKUP_INTENSITY_IDS,
  parseVoiceMarkup,
} from '@/lib/voice-markup'

import { parseMentions, type ParseMentionsOptions } from './parse-mentions'
import {
  PROMPT_BAR_MARK_VARIANTS,
  PromptBarMark,
  PromptBarMarkHidden,
  type PromptBarMarkVariant,
} from './PromptBarMark'

/** 强度 → chip 形态（强 = 实心 · 中 = 灰底 · 轻 = 描边）。 */
const INTENSITY_VARIANT: Record<string, PromptBarMarkVariant> = {
  [VOICE_MARKUP_INTENSITY_IDS.strong]: PROMPT_BAR_MARK_VARIANTS.solid,
  [VOICE_MARKUP_INTENSITY_IDS.medium]: PROMPT_BAR_MARK_VARIANTS.soft,
  [VOICE_MARKUP_INTENSITY_IDS.light]: PROMPT_BAR_MARK_VARIANTS.outline,
}

/** 只画 @ 引用（文本卡的写作栏用这一支）。 */
export function renderPromptMentions(
  text: string,
  options: ParseMentionsOptions = {},
  keyPrefix = 'm',
): ReactNode {
  return parseMentions(text, options).map((segment, index) =>
    segment.type === 'text' ? (
      <span key={`${keyPrefix}:${index}`}>{segment.value}</span>
    ) : (
      <PromptBarMark key={`${keyPrefix}:${index}`} dataAttr="mention">
        {segment.raw}
      </PromptBarMark>
    ),
  )
}

/**
 * 语气标记 + @ 引用（音频卡的台词栏）。
 *
 * 标记 chip 上**只写标签本身**（画板：`愤怒`，不是 `强·愤怒`）——强度靠 chip 形态
 * 说，全称进 `title`。文本真值仍是 `[强·愤怒]`，一个字符都没动。
 */
export function renderVoicePromptValue(
  text: string,
  options: {
    readonly mentions?: ParseMentionsOptions
    /** 强度全称的译法，如 `强·愤怒`。 */
    readonly titleOf?: (label: string, intensityLabel: string | null) => string
  } = {},
): ReactNode {
  return parseVoiceMarkup(text).map((segment, index) => {
    if (segment.kind === 'text') {
      return (
        <span key={`v:${index}`}>
          {renderPromptMentions(
            segment.text,
            options.mentions ?? {},
            `v${index}`,
          )}
        </span>
      )
    }
    const { token } = segment
    const spec = VOICE_MARKUP_INTENSITIES.find(
      (item) => item.id === token.intensity,
    )
    const variant =
      (token.intensity ? INTENSITY_VARIANT[token.intensity] : undefined) ??
      PROMPT_BAR_MARK_VARIANTS.soft
    const hiddenPrefix = spec
      ? `${spec.label}${VOICE_MARKUP.intensitySeparator}`
      : ''
    return (
      <PromptBarMark
        key={`v:${index}`}
        variant={variant}
        dataAttr={`tone:${token.label}`}
        title={options.titleOf?.(token.label, spec?.label ?? null)}
      >
        <PromptBarMarkHidden text={`${VOICE_MARKUP.open}${hiddenPrefix}`} />
        {token.label}
        <PromptBarMarkHidden text={VOICE_MARKUP.close} />
      </PromptBarMark>
    )
  })
}
