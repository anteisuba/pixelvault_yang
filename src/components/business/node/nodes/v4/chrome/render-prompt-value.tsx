'use client'

/**
 * `NodePromptBar.renderValue` 的两个现成实现（@ 引用 / @ 引用 + 语气标记）。
 *
 * ⚠ 这里画出来的字符必须与 `value` **逐字符相同**：镜像层与 textarea 分毫不差地
 * 排版，光标才落在看到的字上。要藏的字符（方括号、强度前缀）用
 * `PromptBarMarkHidden` 变透明 —— 它们顺手就是 chip 的内边距。⛔ 不删字符、
 * ⛔ 不加 `padding`。
 *
 * 缩略图**只能压在藏起来的字符上**（`PromptBarMarkThumb`，绝对定位、零布局宽度）：
 * 轨上序号项的 `@图2` 把 `@图` 藏掉、缩略压上去、只留下号（owner 2026-09-10 真机
 * 反馈第三条）。普通 `@名字` 前面只有一个 `@`，宽度不够放 16px，那里不画。
 */

import Image from 'next/image'
import type { ReactNode } from 'react'

import { NODE_V4_CHROME } from '@/constants/node-studio'
import {
  VOICE_MARKUP,
  VOICE_MARKUP_INTENSITIES,
  VOICE_MARKUP_INTENSITY_IDS,
  parseVoiceMarkup,
} from '@/lib/voice-markup'

import type { MentionChipMedia } from './MentionChip'
import { parseMentions, type ParseMentionsOptions } from './parse-mentions'
import {
  PROMPT_BAR_MARK_VARIANTS,
  PromptBarMark,
  PromptBarMarkHidden,
  PromptBarMarkThumb,
  type PromptBarMarkVariant,
} from './PromptBarMark'

/** 带缩略的引用：`mediaOf` 给这一颗引用画什么（不给 = 全部不画缩略）。 */
export interface RenderPromptMentionsOptions extends ParseMentionsOptions {
  readonly mediaOf?: (name: string) => MentionChipMedia | undefined
}

/** 语音没有缩略图，压两根柱子当波形小标（与 `MentionChip` 同一套）。 */
function WaveformGlyph() {
  return (
    <span className="flex h-2.5 items-end gap-px text-foreground">
      <i className="block h-1 w-0.5 rounded-full bg-current" />
      <i className="block h-2.5 w-0.5 rounded-full bg-current" />
      <i className="block h-1.5 w-0.5 rounded-full bg-current" />
    </span>
  )
}

/**
 * 这一颗引用能不能把缩略压上去：名字得以数字结尾（轨上的 `图2` / `视频1` /
 * `语音1`），前面那截前缀连同 `@` 就是能藏的宽度。
 */
function railThumbSplit(raw: string, name: string): string | null {
  const match = /^(.+?)\d+$/.exec(name)
  if (!match) return null
  const prefix = match[1] as string
  const hidden = raw.slice(0, raw.length - (name.length - prefix.length))
  return hidden.endsWith(prefix) ? hidden : null
}

function MentionThumb({ media }: { readonly media: MentionChipMedia }) {
  if (media.kind === 'audio') return <WaveformGlyph />
  if ('thumbnailUrl' in media && media.thumbnailUrl) {
    return (
      <Image
        src={media.thumbnailUrl}
        alt=""
        width={NODE_V4_CHROME.mentionThumbSize}
        height={NODE_V4_CHROME.mentionThumbSize}
        unoptimized
        className="size-full object-cover"
      />
    )
  }
  return null
}

/** 强度 → chip 形态（强 = 实心 · 中 = 灰底 · 轻 = 描边）。 */
const INTENSITY_VARIANT: Record<string, PromptBarMarkVariant> = {
  [VOICE_MARKUP_INTENSITY_IDS.strong]: PROMPT_BAR_MARK_VARIANTS.solid,
  [VOICE_MARKUP_INTENSITY_IDS.medium]: PROMPT_BAR_MARK_VARIANTS.soft,
  [VOICE_MARKUP_INTENSITY_IDS.light]: PROMPT_BAR_MARK_VARIANTS.outline,
}

/** 只画 @ 引用（文本卡的写作栏用这一支）。 */
export function renderPromptMentions(
  text: string,
  options: RenderPromptMentionsOptions = {},
  keyPrefix = 'm',
): ReactNode {
  return parseMentions(text, options).map((segment, index) => {
    if (segment.type === 'text') {
      return <span key={`${keyPrefix}:${index}`}>{segment.value}</span>
    }
    const media = options.mediaOf?.(segment.name)
    const hidden = media ? railThumbSplit(segment.raw, segment.name) : null
    return (
      <PromptBarMark key={`${keyPrefix}:${index}`} dataAttr="mention">
        {hidden && media ? (
          <>
            <PromptBarMarkThumb text={hidden}>
              <MentionThumb media={media} />
            </PromptBarMarkThumb>
            {segment.raw.slice(hidden.length)}
          </>
        ) : (
          segment.raw
        )}
      </PromptBarMark>
    )
  })
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
