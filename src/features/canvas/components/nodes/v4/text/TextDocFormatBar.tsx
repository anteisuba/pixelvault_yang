'use client'

/**
 * 文档纸顶下居中的格式工具条（node-polish-2 §8）：
 * 标题级下拉 · 无序 · 有序 ‖ 加粗 · 删除线 · 斜体 · 下划线。
 *
 * ⛔ **不引入富文本存储**：每一颗都是一条编辑器命令（`applyTextDocFormat`），
 * 落库的仍是同一段 Markdown 纯文本。这一层只有形状与「按下不抢焦点」。
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

import type { TextDocFormat } from './TextDocEditor'

const HEADING_FORMATS = ['h1', 'h2', 'h3'] as const

export interface TextDocFormatBarProps {
  onFormat(format: TextDocFormat): void
  /** 光标所在处已经是哪几档 —— 按下去的那颗要看得出来。 */
  readonly activeFormats: ReadonlySet<TextDocFormat>
}

const CELL_CLASS = cn(
  'flex h-7.5 w-8 shrink-0 items-center justify-center rounded-lg text-2sm font-semibold text-foreground',
  'transition-[background-color,transform] duration-spring-press ease-spring-press active:scale-96',
  'hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
)

export function TextDocFormatBar({
  onFormat,
  activeFormats,
}: TextDocFormatBarProps) {
  const t = useTranslations('StudioNode.v4.text')

  const cell = (format: TextDocFormat, label: string, content: ReactNode) => {
    const active = activeFormats.has(format)
    return (
      <button
        key={format}
        type="button"
        aria-label={label}
        aria-pressed={active}
        title={label}
        data-text-format={format}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onFormat(format)}
        className={cn(CELL_CLASS, active && 'bg-surface-fill-hover')}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      role="toolbar"
      aria-label={t('doc.formatAriaLabel')}
      data-text-format-bar
      className="inline-flex items-center gap-0.5 rounded-node-thumb bg-card p-1 shadow-node-chrome"
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
            T
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="min-w-32">
          {HEADING_FORMATS.map((format) => (
            <DropdownMenuItem
              key={format}
              data-text-format-heading={format}
              data-active={activeFormats.has(format)}
              onSelect={() => onFormat(format)}
            >
              {t(`doc.${format}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {cell('bulleted', t('doc.bulleted'), '≡')}
      {cell('numbered', t('doc.numbered'), '1.')}
      {cell('bold', t('doc.bold'), <b>B</b>)}
      {cell('strike', t('doc.strike'), <s>S</s>)}
      {cell('italic', t('doc.italic'), <i>I</i>)}
      {cell('underline', t('doc.underline'), <u>U</u>)}
    </div>
  )
}
