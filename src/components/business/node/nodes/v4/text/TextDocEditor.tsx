'use client'

/**
 * 全屏文档的**编辑面**（spec §2，画板 `TextJimeng.dc.html`；owner 2026-09-12 改）。
 *
 * ── 为什么从「往正文里插 Markdown 记号」改成所见即所得 ────────────────────
 * 上一版工具条只把 `**` `#` `<u>` 写进一只 `textarea`：记号原样躺在正文里、标题
 * 不变大、加粗不变粗 —— owner 真机一句话定性「编辑没有效果，字号也不能改」。
 * 纯文本框这条路走不到底：一只 `textarea` 里做不出两种字号。
 *
 * ⚠ **存的仍是同一段 Markdown 纯文本**（`editor.storage.markdown.getMarkdown()`）。
 * 所以提示词编译、`@` 引用、助手读写、剧本投影全都不动 —— 变的只有编辑时的样子。
 * ⛔ 不引入结构化文档存储：那要改数据层与上述四条路径。
 *
 * ⚠ 编辑器本体交给 tiptap（ProseMirror）：中文输入法的合成、撤销栈、粘贴、选区
 * 这几件事手写 `contentEditable` 做不对，而它们每一件出错都是「打不了字」。
 * 画布的快捷键不会被抢走 —— `WorkbenchShortcutsV4` 的忽略名单里本来就有
 * `[contenteditable="true"]`，ProseMirror 的根正是它。
 */

import { useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'

import { readMentionQuery } from '../chrome'

/** 工具条上那几颗键 —— 与画板同序：标题三档 ‖ 列表两档 ‖ 行内四档。 */
export const TEXT_DOC_FORMATS = [
  'h1',
  'h2',
  'h3',
  'bulleted',
  'numbered',
  'bold',
  'strike',
  'italic',
  'underline',
] as const

export type TextDocFormat = (typeof TEXT_DOC_FORMATS)[number]

export interface UseTextDocEditorOptions {
  /** 落库的那段 Markdown。外面改了（助手 `set_text`）会同步进来。 */
  readonly body: string
  readonly ariaLabel: string
  /** 失焦即存 —— 与上一版同一条纪律（⛔ 不做自动保存计时器）。 */
  onBlurSave(markdown: string): void
  /** 正文或选区变了 —— 宿主据此重算 `@` 候选与工具条的高亮。 */
  onEditorChange(): void
}

/** 当前这段正文的 Markdown。⛔ 别在组件里另存一份草稿：编辑器自己就是那份。 */
export function readTextDocMarkdown(editor: Editor | null): string {
  if (!editor) return ''
  // ⚠ `tiptap-markdown` 不做类型合并，`editor.storage` 上没有 `markdown` 这一格；
  // 显式收窄成它的实际形状，⛔ 不用 `any` 糊过去。
  const storage = editor.storage as {
    readonly markdown?: { getMarkdown?: () => string }
  }
  const markdown = storage.markdown?.getMarkdown?.()
  return typeof markdown === 'string' ? markdown : ''
}

/**
 * 扩展清单 —— **导出**是为了让测试拿真配置建一个无头编辑器，⛔ 不在测试里
 * 另抄一份（抄的那份绿了不代表这一份也绿）。
 */
export const TEXT_DOC_EXTENSIONS = [
  StarterKit,
  // `html: true` 是下划线能活下来的理由：Markdown 没有下划线语法，
  // 它来回都走 `<u>`。⛔ 关掉它等于按了下划线、存完再打开就没了。
  Markdown.configure({
    html: true,
    breaks: true,
    transformPastedText: true,
    transformCopiedText: false,
  }),
]

export function useTextDocEditor({
  body,
  ariaLabel,
  onBlurSave,
  onEditorChange,
}: UseTextDocEditorOptions): Editor | null {
  return useEditor({
    // ⚠ SSR 下必须关掉首帧立即渲染，否则 Next 的服务端渲染会和水合打架。
    immediatelyRender: false,
    extensions: TEXT_DOC_EXTENSIONS,
    content: body,
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        'data-text-doc-input': '',
        // 与收起卡的预览共用一套字号 / 列表样式（`canvas.css` 的 `data-text-rich`）。
        'data-text-rich': '',
        // `nodrag nopan`：全屏文档浮在画布上，选字的拖动⛔不能变成平移画布。
        class: 'nodrag nopan focus-visible:outline-none',
      },
    },
    onBlur: ({ editor }) => onBlurSave(readTextDocMarkdown(editor)),
    onUpdate: onEditorChange,
    onSelectionUpdate: onEditorChange,
  })
}

/** 按下工具条那一颗 —— 每一档都是 toggle（再按一次撤掉，⛔ 不叠第二层）。 */
export function applyTextDocFormat(
  editor: Editor | null,
  format: TextDocFormat,
): void {
  if (!editor) return
  const chain = editor.chain().focus()
  switch (format) {
    case 'h1':
      chain.toggleHeading({ level: 1 }).run()
      return
    case 'h2':
      chain.toggleHeading({ level: 2 }).run()
      return
    case 'h3':
      chain.toggleHeading({ level: 3 }).run()
      return
    case 'bulleted':
      chain.toggleBulletList().run()
      return
    case 'numbered':
      chain.toggleOrderedList().run()
      return
    case 'bold':
      chain.toggleBold().run()
      return
    case 'strike':
      chain.toggleStrike().run()
      return
    case 'italic':
      chain.toggleItalic().run()
      return
    case 'underline':
      chain.toggleUnderline().run()
      return
  }
}

/** 工具条的按下态 —— 光标所在处已经是哪几档。 */
export function readTextDocActiveFormats(
  editor: Editor | null,
): ReadonlySet<TextDocFormat> {
  const active = new Set<TextDocFormat>()
  if (!editor) return active
  if (editor.isActive('heading', { level: 1 })) active.add('h1')
  if (editor.isActive('heading', { level: 2 })) active.add('h2')
  if (editor.isActive('heading', { level: 3 })) active.add('h3')
  if (editor.isActive('bulletList')) active.add('bulleted')
  if (editor.isActive('orderedList')) active.add('numbered')
  if (editor.isActive('bold')) active.add('bold')
  if (editor.isActive('strike')) active.add('strike')
  if (editor.isActive('italic')) active.add('italic')
  if (editor.isActive('underline')) active.add('underline')
  return active
}

export interface TextDocMentionRange {
  /** `@` 那一格的文档坐标。 */
  readonly from: number
  /** 光标的文档坐标。 */
  readonly to: number
  readonly query: string
}

/**
 * 光标前面那半截 `@查询`（没有就是 `null`）。
 *
 * ⚠ 判据复用提示词栏那一份 `readMentionQuery`（`@` 前必须是行首或空白），⛔ 不
 * 在这里另写一条正则 —— 两处判据不一样的话，同一句话在栏里弹、在文档里不弹。
 */
export function readTextDocMention(
  editor: Editor | null,
): TextDocMentionRange | null {
  if (!editor) return null
  const { selection } = editor.state
  if (!selection.empty) return null
  const $from = selection.$from
  const before = $from.parent.textBetween(0, $from.parentOffset, '\n', ' ')
  const found = readMentionQuery(before, before.length)
  if (!found) return null
  return {
    from: $from.start() + found.start,
    to: selection.from,
    query: found.query,
  }
}

/** 把 `@查询` 整段换成落定的那串字（与提示词栏同一套落字）。 */
export function replaceTextDocRange(
  editor: Editor | null,
  range: { readonly from: number; readonly to: number },
  text: string,
): void {
  editor?.chain().focus().insertContentAt(range, text).run()
}
