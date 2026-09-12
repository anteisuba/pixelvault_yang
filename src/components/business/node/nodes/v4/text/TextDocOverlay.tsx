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
 * ⚠ 正文是**所见即所得**的（`TextDocEditor`，owner 2026-09-12 改）：标题真的大、
 * 加粗真的粗。落库的仍是同一段 Markdown 纯文本，⛔ 编辑器不是第二份数据 ——
 * 所以这里没有 `draft` state，要取正文一律 `readTextDocMarkdown(editor)`。
 *
 * 存：**失焦即存**（`set_text`），Esc / × 关闭前再存一次。⛔ 不做自动保存计时器：
 * 每一次落值都进撤销栈，定时器会把一段连续输入拆成一串谁也撤不回的条目。
 */

import { EditorContent } from '@tiptap/react'
import { FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useReducer, useState } from 'react'

import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import {
  MentionPicker,
  matchMentionOptions,
  NodeFrame,
  type MentionPickerOption,
} from '../chrome'
import { TextAssistantBar } from './TextAssistantBar'
import { TextDocFormatBar } from './TextDocFormatBar'
import {
  applyTextDocFormat,
  readTextDocActiveFormats,
  readTextDocMarkdown,
  readTextDocMention,
  replaceTextDocRange,
  useTextDocEditor,
  type TextDocFormat,
} from './TextDocEditor'

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
  /** Esc 关掉的是**这一个** `@`（文档坐标）——再键一个字不该又弹回来。 */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  /** 正文 / 选区变了要重算候选与按下态 —— 编辑器不在 React state 里，自己敲一下。 */
  const [, bumpEditorVersion] = useReducer((tick: number) => tick + 1, 0)

  const commit = (markdown: string) => {
    if (markdown !== body) onSave(markdown)
  }

  const editor = useTextDocEditor({
    body,
    ariaLabel: t('editAriaLabel'),
    onBlurSave: commit,
    onEditorChange: bumpEditorVersion,
  })

  /**
   * 助手 `set_text` 落下来时把正文跟上。
   *
   * ⚠ 先比对再写：`setContent` 会清掉撤销栈与光标，自己刚存的那一轮回流进来时
   * 若照写一遍，用户正在打的字会被踢走。⛔ 也不 `emitUpdate` —— 那会把这一次
   * 同步当成用户编辑，转头又存一遍。
   */
  useEffect(() => {
    if (!editor) return
    if (readTextDocMarkdown(editor) === body) return
    editor.commands.setContent(body, { emitUpdate: false })
  }, [editor, body])

  const mention =
    editor && mentionOptions.length > 0 ? readTextDocMention(editor) : null
  const mentionMatches =
    mention && mention.from !== dismissedAt
      ? matchMentionOptions(mentionOptions, mention.query)
      : []
  const mentionOpen = mentionMatches.length > 0
  const activeIndex = Math.max(
    0,
    mentionMatches.findIndex((option) => option.id === activeId),
  )
  const activeOption = mentionMatches[activeIndex]

  /** 把 `@查询` 整段换成 `@名字 `（与提示词栏同一套落字）。 */
  const commitMention = (option: MentionPickerOption) => {
    if (!mention) return
    setActiveId(null)
    onMentionSelect(option, (text) =>
      replaceTextDocRange(editor, { from: mention.from, to: mention.to }, text),
    )
  }

  return (
    <NodeFrame
      open={open}
      variant="fullscreen"
      onClose={() => {
        commit(readTextDocMarkdown(editor))
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
          <TextDocFormatBar
            activeFormats={readTextDocActiveFormats(editor)}
            onFormat={(format: TextDocFormat) =>
              applyTextDocFormat(editor, format)
            }
          />
        </div>
        <div
          data-text-doc-scroll
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-4"
          // `@` 候选开着时键盘归它 —— 捕获阶段接住，⛔ 不能让 ProseMirror 先吃掉
          // 方向键（那会把光标挪走），也不能让 Esc 穿到 `NodeFrame` 收起整篇文档。
          onKeyDownCapture={(event) => {
            if (event.nativeEvent.isComposing) return
            if (!mentionOpen || !mention) return
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
              setDismissedAt(mention.from)
            }
          }}
        >
          <div
            data-text-doc-editor
            style={{ maxWidth: NODE_V4_CHROME.textDocWidth }}
            className={cn(
              'relative mx-auto w-full',
              'text-2sm leading-relaxed tracking-node-body',
            )}
          >
            {editor?.isEmpty ? (
              <p
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 text-muted-foreground"
              >
                {t('empty')}
              </p>
            ) : null}
            <EditorContent editor={editor} />
          </div>
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
