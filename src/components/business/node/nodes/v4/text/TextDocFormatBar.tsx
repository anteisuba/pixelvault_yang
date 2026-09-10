'use client'

/**
 * 全屏文档中间那条**格式工具条**（spec §2，画板 `TextJimeng.dc.html`）：
 * 标题级下拉 · 无序 · 有序 ‖ 加粗 · 删除线 · 斜体 · 下划线。
 *
 * ⛔ **不引入富文本存储**：每一颗只是往正文里写 Markdown 语法，算术在
 * `text-markdown.ts`（纯函数）。这一层只有形状与「按下不抢焦点」。
 *
 * ⚠ 每颗键都 `onMouseDown` 阻止默认：一旦 textarea 失焦，选区就没了，
 * 加粗会加到空气上（与 `MentionPicker` 不抢焦点是同一条理由）。
 */

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { TextMarkdownFormat } from './text-markdown'

const HEADING_FORMATS = ['h1', 'h2', 'h3'] as const

export interface TextDocFormatBarProps {
  onFormat(format: TextMarkdownFormat): void
}

const CELL_CLASS = cn(
  'flex h-7.5 min-w-7.5 items-center justify-center rounded-lg px-2 text-2sm text-foreground',
  'transition-[background-color,transform] duration-spring-press ease-spring-press active:scale-95',
  'hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
)

export function TextDocFormatBar({ onFormat }: TextDocFormatBarProps) {
  const t = useTranslations('StudioNode.v4.text')

  const cell = (
    format: TextMarkdownFormat,
    label: string,
    content: ReactNode,
  ) => (
    <button
      key={format}
      type="button"
      aria-label={label}
      title={label}
      data-text-format={format}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onFormat(format)}
      className={CELL_CLASS}
    >
      {content}
    </button>
  )

  return (
    <div
      role="toolbar"
      aria-label={t('doc.formatAriaLabel')}
      data-text-format-bar
      className="inline-flex items-center gap-1 rounded-xl p-1 surface-glass shadow-node-chrome"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('doc.heading')}
            data-text-format="heading"
            onMouseDown={(event) => event.preventDefault()}
            className={CELL_CLASS}
          >
            T ▾
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-32">
          {HEADING_FORMATS.map((format) => (
            <DropdownMenuItem
              key={format}
              data-text-format-heading={format}
              onSelect={() => onFormat(format)}
            >
              {t(`doc.${format}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden className="mx-1 h-4.5 w-px bg-border" />
      {cell('bulleted', t('doc.bulleted'), '≡')}
      {cell('numbered', t('doc.numbered'), '1.')}
      <span aria-hidden className="mx-1 h-4.5 w-px bg-border" />
      {cell('bold', t('doc.bold'), <b>B</b>)}
      {cell('strike', t('doc.strike'), <s>S</s>)}
      {cell('italic', t('doc.italic'), <i>I</i>)}
      {cell('underline', t('doc.underline'), <u>U</u>)}
    </div>
  )
}
