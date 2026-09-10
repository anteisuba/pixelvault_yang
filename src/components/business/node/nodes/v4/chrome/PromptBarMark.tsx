'use client'

/**
 * 提示词栏**输入框内部**那一颗 chip（`NodePromptBar.renderValue` 的唯一画法）。
 *
 * ── 为什么它不是 `MentionChip` ────────────────────────────────────────────
 * 栏里的 chip 画在 textarea **背后的等距镜像层**上：镜像层每一个字符都要与
 * `value` 逐字符对齐，光标才落在看到的字上。`MentionChip` 会加缩略图、`padding`、
 * `gap` —— 每一样都会让这一段比真文本宽出去，光标当场错位。所以栏内 chip 只做
 * **一件事**：给那一段字符加底色与圆角，宽度分毫不动。带缩略图的那一颗仍是
 * `MentionChip`，它活在候选列表与 chip 区里，那两处没有光标要对齐。
 *
 * 要藏的字符（`[`、强度前缀、`]`）用 `hidden` 变体：字**还在**、只是透明，于是
 * 它们顺手成了 chip 的左右内边距。⛔ 不要删掉它们改用 `padding`。
 */

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * `solid` / `soft` / `outline` 三档 —— 语气标记用它区分强度（强 / 中 / 轻），
 * @ 引用固定用 `soft`。
 */
export const PROMPT_BAR_MARK_VARIANTS = {
  solid: 'solid',
  soft: 'soft',
  outline: 'outline',
} as const

export type PromptBarMarkVariant =
  (typeof PROMPT_BAR_MARK_VARIANTS)[keyof typeof PROMPT_BAR_MARK_VARIANTS]

export interface PromptBarMarkProps {
  readonly children: ReactNode
  readonly variant?: PromptBarMarkVariant
  /** 悬停读全称（如「强·愤怒」）—— 栏里只画标签本身，强度靠 variant 说。 */
  readonly title?: string
  readonly dataAttr?: string
}

const VARIANT_CLASS: Record<PromptBarMarkVariant, string> = {
  // 对比度 `contrast-check` 2026-09-10：`primary-foreground` 对 `primary` 18.68；
  // `foreground` 对 `surface-fill` 17.4x；描边档字色仍是 `foreground` 压在栏底上。
  solid: 'bg-primary text-primary-foreground',
  soft: 'bg-surface-fill text-foreground',
  outline: 'ring-1 ring-inset ring-border text-foreground',
}

export function PromptBarMark({
  children,
  variant = PROMPT_BAR_MARK_VARIANTS.soft,
  title,
  dataAttr,
}: PromptBarMarkProps) {
  return (
    <span
      data-prompt-bar-mark={dataAttr ?? variant}
      title={title}
      className={cn('rounded-sm', VARIANT_CLASS[variant])}
    >
      {children}
    </span>
  )
}

/** 一段**占位不显形**的字符（方括号、强度前缀）。⛔ 不要换成 padding。 */
export function PromptBarMarkHidden({ text }: { readonly text: string }) {
  return <span className="text-transparent">{text}</span>
}

/**
 * 藏起来的那几个字符 + **压在它们上面**的 16px 缩略（2026-09-10 owner 真机反馈
 * 第三条：栏内的 `@图2` 也要看得见挂的是哪张图）。
 *
 * ⚠ 这是唯一能在镜像层里放图而不错位的画法：缩略是 `absolute`，**一点布局宽度都
 * 不占**，占位的仍是那几个透明字符本身。所以调用方只能把它用在「藏起来的那段
 * 至少和缩略一样宽」的地方 —— 轨上序号项的 `@图` / `@视频` / `@语音` 前缀正好
 * 够宽，普通 `@名字` 只有一个 `@`（约 8px）就不够，那里不画缩略。
 */
export function PromptBarMarkThumb({
  text,
  children,
}: {
  readonly text: string
  readonly children: ReactNode
}) {
  return (
    <span className="relative">
      <span className="text-transparent">{text}</span>
      <span
        aria-hidden
        data-prompt-bar-thumb
        className="pointer-events-none absolute top-1/2 left-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-xs bg-surface-fill-track"
      >
        {children}
      </span>
    </span>
  )
}
