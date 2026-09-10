'use client'

/**
 * 文本节点的**展开态 = 全屏文档**（spec §2，画板 `TextJimeng.dc.html` 方向 A，
 * owner 2026-09-11 定稿）。
 *
 * 画布压暗；顶栏 文件图标 · `名字.md` · 下载 · ×；居中一条格式工具条；正文 1100 宽
 * 可编辑、可 `@`（弹层同栏内，复用 `chrome/MentionPicker`）；最底那条只属于写作
 * 助手（同收起态那条，⛔ 两种模型不混）。
 *
 * ⚠ 640 的画中框已随本片退役 —— 长文档在 640 里读不完正是这一版重做的起因。
 * 壳仍是 `chrome/NodeFrame`（`variant='fullscreen'`），⛔ 不另写一层浮层与 Esc。
 *
 * 存：**失焦即存**（`set_text`），Esc / × 关闭前再存一次。⛔ 不做自动保存计时器：
 * 每一次落值都进撤销栈，定时器会把一段连续输入拆成一串谁也撤不回的条目。
 */

import { FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLayoutEffect, useRef, useState } from 'react'

import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import {
  MentionPicker,
  matchMentionOptions,
  readMentionQuery,
  NodeFrame,
  type MentionPickerOption,
} from '../chrome'
import { TextAssistantBar } from './TextAssistantBar'
import { TextDocFormatBar } from './TextDocFormatBar'
import {
  applyTextMarkdownFormat,
  type TextMarkdownFormat,
} from './text-markdown'

export interface TextDocOverlayProps {
  readonly open: boolean
  onClose(): void
  readonly nodeId: string
  /** 卡的名字（顶栏显示成 `名字.md`）。 */
  readonly title: string
  readonly body: string
  onSave(body: string): void
  onDownload(): void
  /** `@` 候选（画布上的别的卡）。空数组 = 不弹。 */
  readonly mentionOptions: readonly MentionPickerOption[]
  /** 点中一个候选之后的副作用（文本节点粘原文 / 素材插 `@名字`）由调用方决定。 */
  onMentionSelect(
    option: MentionPickerOption,
    insertText: (text: string) => void,
  ): void
}

export function TextDocOverlay({
  open,
  onClose,
  nodeId,
  title,
  body,
  onSave,
  onDownload,
  mentionOptions,
  onMentionSelect,
}: TextDocOverlayProps) {
  const t = useTranslations('StudioNode.v4.text')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(body)
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  /** Esc 关掉的是**这一个** `@`（下标）——再键一个字不该又弹回来。 */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  /** 自己落完字之后要把光标放回哪（渲染后统一设一次）。 */
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  // 助手 `set_text` 落下来时把草稿跟上——渲染期同步（React 官方的「派生 state」
  // 写法），⛔ 不放 effect 里：那是一次多余的级联渲染。
  const [syncedBody, setSyncedBody] = useState(body)
  if (syncedBody !== body) {
    setSyncedBody(body)
    setDraft(body)
  }

  // 正文原地长高：⛔ 不给固定高 + 内滚 —— 全屏文档滚的是整栏，不是栏里再套一只框。
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    const pending = pendingSelection.current
    if (pending) {
      pendingSelection.current = null
      el.focus()
      el.setSelectionRange(pending.start, pending.end)
      setSelection(pending)
    }
  }, [draft, open])

  const mentionQuery =
    mentionOptions.length > 0 && selection.start === selection.end
      ? readMentionQuery(draft, selection.start)
      : null
  const mentionMatches =
    mentionQuery && mentionQuery.start !== dismissedAt
      ? matchMentionOptions(mentionOptions, mentionQuery.query)
      : []
  const mentionOpen = mentionMatches.length > 0
  const activeIndex = Math.max(
    0,
    mentionMatches.findIndex((option) => option.id === activeId),
  )
  const activeOption = mentionMatches[activeIndex]

  const commit = (next: string) => {
    if (next !== body) onSave(next)
  }

  const replaceRange = (start: number, end: number, text: string) => {
    const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`
    pendingSelection.current = {
      start: start + text.length,
      end: start + text.length,
    }
    setDraft(next)
  }

  /** 把 `@查询` 整段换成 `@名字 `（与提示词栏同一套落字）。 */
  const commitMention = (option: MentionPickerOption) => {
    if (!mentionQuery) return
    setActiveId(null)
    onMentionSelect(option, (text) =>
      replaceRange(mentionQuery.start, selection.start, text),
    )
  }

  const runFormat = (format: TextMarkdownFormat) => {
    const result = applyTextMarkdownFormat(draft, selection, format)
    pendingSelection.current = result.selection
    setDraft(result.value)
  }

  const readSelection = (element: HTMLTextAreaElement) => {
    setSelection({ start: element.selectionStart, end: element.selectionEnd })
  }

  return (
    <NodeFrame
      open={open}
      variant="fullscreen"
      onClose={() => {
        commit(draft)
        onClose()
      }}
      title={t('doc.title', { name: title })}
      titleLeading={
        <FileText
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      }
      titleExtra={
        <button
          type="button"
          data-text-doc-download
          onClick={onDownload}
          className="rounded-md border px-2 py-0.5 text-2xs text-muted-foreground transition-colors duration-fast hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('toolbar.download')}
        </button>
      }
      assistantBar={<TextAssistantBar nodeId={nodeId} />}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 justify-center py-2">
          <TextDocFormatBar onFormat={runFormat} />
        </div>
        <div
          data-text-doc-scroll
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-4"
        >
          <textarea
            ref={textareaRef}
            value={draft}
            aria-label={t('editAriaLabel')}
            placeholder={t('empty')}
            data-text-doc-input
            autoFocus
            onChange={(event) => {
              setDismissedAt(null)
              setDraft(event.target.value)
              readSelection(event.currentTarget)
            }}
            onSelect={(event) => readSelection(event.currentTarget)}
            onClick={(event) => readSelection(event.currentTarget)}
            onKeyUp={(event) => readSelection(event.currentTarget)}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (!mentionOpen || !mentionQuery) return
              // `@` 候选开着时键盘归它 —— 尤其 Esc：那一下该关候选，
              // ⛔ 不能穿到 `NodeFrame` 把整篇文档收起来。
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const step = event.key === 'ArrowDown' ? 1 : -1
                const next =
                  (activeIndex + step + mentionMatches.length) %
                  mentionMatches.length
                setActiveId(mentionMatches[next]?.id ?? null)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                if (activeOption) commitMention(activeOption)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setDismissedAt(mentionQuery.start)
              }
            }}
            style={{ maxWidth: NODE_V4_CHROME.textDocWidth }}
            className={cn(
              'nodrag nopan mx-auto block w-full resize-none bg-transparent',
              'text-2sm leading-relaxed tracking-node-body',
              'placeholder:text-muted-foreground focus-visible:outline-none',
            )}
          />
        </div>
        {/* `@` 弹层**同栏内**（画板）：贴着正文栏的左下角浮起，
            ⛔ 不跟着光标飞 —— 全屏文档里那会把列表甩出视口。 */}
        {mentionOpen && (
          <div className="pointer-events-none absolute inset-x-6 bottom-2 z-30 flex justify-center">
            <div
              className="pointer-events-auto relative w-full"
              style={{ maxWidth: NODE_V4_CHROME.textDocWidth }}
            >
              <MentionPicker
                options={mentionMatches}
                activeId={activeOption?.id ?? null}
                onActiveChange={setActiveId}
                onSelect={commitMention}
                ariaLabel={t('doc.mentionAriaLabel')}
                emptyLabel={t('doc.mentionEmpty')}
                className="relative bottom-auto mb-0"
              />
            </div>
          </div>
        )}
      </div>
    </NodeFrame>
  )
}
