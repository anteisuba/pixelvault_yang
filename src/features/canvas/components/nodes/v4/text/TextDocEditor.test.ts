/**
 * 全屏文档编辑面的**行为闸**（owner 2026-09-12：「编辑没有效果，字号也不能改」）。
 *
 * ⚠ 这一组建的是**无头编辑器**，用的是 `TEXT_DOC_EXTENSIONS`（生产那一份配置）：
 * ProseMirror 的输入在 jsdom 里敲不出来，但命令与序列化是真的 —— 而「按下去有没有
 * 效果」「存下来还在不在」正是这两件事。DOM 层那几条在 `TextNodeV4.test.tsx`。
 */

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'

import {
  TEXT_DOC_EXTENSIONS,
  applyTextDocFormat,
  readTextDocActiveFormats,
  readTextDocMarkdown,
  readTextDocMention,
} from './TextDocEditor'

let editor: Editor | null = null

function open(content: string): Editor {
  editor = new Editor({ extensions: TEXT_DOC_EXTENSIONS, content })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('全屏文档 · Markdown 进出', () => {
  it('读进来的 Markdown 原样存得回去（⛔ 不把记号吃掉）', () => {
    const source = '# 标题\n\n正文一段 **加粗** 与 *斜体*\n\n- 甲\n- 乙'
    const instance = open(source)
    expect(readTextDocMarkdown(instance)).toBe(source)
  })

  it('标题不是插一个 `#` 了事 —— 文档里真的是 h2', () => {
    const instance = open('一句话')
    instance.commands.selectAll()
    applyTextDocFormat(instance, 'h2')

    expect(instance.getHTML()).toContain('<h2')
    // 存下来仍是 Markdown 纯文本。
    expect(readTextDocMarkdown(instance)).toBe('## 一句话')
    // 工具条的按下态读的是**光标所在处**，所以先把光标放进这一行。
    instance.commands.setTextSelection(2)
    expect(readTextDocActiveFormats(instance).has('h2')).toBe(true)
  })

  it('加粗 / 斜体 / 删除线 / 下划线来回都不丢', () => {
    const instance = open('一句话')
    instance.commands.selectAll()

    applyTextDocFormat(instance, 'bold')
    expect(readTextDocMarkdown(instance)).toBe('**一句话**')
    expect(readTextDocActiveFormats(instance).has('bold')).toBe(true)

    applyTextDocFormat(instance, 'bold')
    expect(readTextDocMarkdown(instance)).toBe('一句话')

    applyTextDocFormat(instance, 'strike')
    expect(readTextDocMarkdown(instance)).toContain('~~')

    applyTextDocFormat(instance, 'strike')
    applyTextDocFormat(instance, 'underline')
    // Markdown 没有下划线语法 —— 它走 `<u>`（`html: true` 的存在理由）。
    expect(readTextDocMarkdown(instance)).toContain('<u>')
  })

  it('两档列表各自成真列表', () => {
    const instance = open('甲')
    applyTextDocFormat(instance, 'bulleted')
    expect(instance.getHTML()).toContain('<ul')
    expect(readTextDocMarkdown(instance)).toBe('- 甲')

    applyTextDocFormat(instance, 'bulleted')
    applyTextDocFormat(instance, 'numbered')
    expect(instance.getHTML()).toContain('<ol')
    instance.commands.setTextSelection(2)
    expect(readTextDocActiveFormats(instance).has('numbered')).toBe(true)
  })
})

describe('全屏文档 · `@` 查询', () => {
  it('光标停在 `@查询` 后面时报出那一段的坐标', () => {
    const instance = open('开场 @莫')
    instance.commands.focus('end')

    const mention = readTextDocMention(instance)
    expect(mention?.query).toBe('莫')
    // `from` 指着 `@` 那一格，`to` 是光标 —— 落字时整段换掉。
    expect(mention && mention.to - mention.from).toBe(2)
  })

  it('选区不是一个点时不弹（⛔ 选着字还去猜 `@`）', () => {
    const instance = open('开场 @莫')
    instance.commands.selectAll()
    expect(readTextDocMention(instance)).toBeNull()
  })

  it('邮箱那样的 `@` 不算提及', () => {
    const instance = open('写给 a@b')
    instance.commands.focus('end')
    expect(readTextDocMention(instance)).toBeNull()
  })
})
