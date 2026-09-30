import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MentionInput, parseMentions } from './mention-input'

describe('MentionInput · IME', () => {
  it('compositionend 后立刻回车不当发送 —— 那是在确认候选', () => {
    const onKeyDown = vi.fn()
    render(
      <MentionInput
        value="夜"
        onValueChange={vi.fn()}
        tokens={[]}
        aria-label="editor"
        onKeyDown={onKeyDown}
      />,
    )
    const editor = screen.getByRole('textbox')
    fireEvent.compositionStart(editor)
    fireEvent.compositionEnd(editor)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('组字结束后过一会儿的回车才交给父级', () => {
    const now = vi.spyOn(performance, 'now')
    const onKeyDown = vi.fn()
    render(
      <MentionInput
        value="夜景"
        onValueChange={vi.fn()}
        tokens={[]}
        aria-label="editor"
        onKeyDown={onKeyDown}
      />,
    )
    const editor = screen.getByRole('textbox')
    now.mockReturnValue(0)
    fireEvent.compositionStart(editor)
    fireEvent.compositionEnd(editor)
    now.mockReturnValue(10)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onKeyDown).not.toHaveBeenCalled()
    now.mockReturnValue(150)
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    now.mockRestore()
  })

  it('正在组字且仍聚焦时，外部写入不冲掉拼音', () => {
    const { rerender } = render(
      <MentionInput
        value="ye"
        onValueChange={vi.fn()}
        tokens={[]}
        aria-label="editor"
      />,
    )
    const editor = screen.getByRole('textbox')
    editor.focus()
    editor.textContent = 'ye'
    fireEvent.compositionStart(editor)
    rerender(
      <MentionInput
        value="助手写好的提示词"
        onValueChange={vi.fn()}
        tokens={[]}
        aria-label="editor"
      />,
    )
    expect(editor.textContent).toBe('ye')
  })

  it('失焦后清掉组字旗，助手写入能进编辑器', () => {
    const { rerender } = render(
      <MentionInput
        value=""
        onValueChange={vi.fn()}
        tokens={[]}
        aria-label="editor"
      />,
    )
    const editor = screen.getByRole('textbox')
    fireEvent.compositionStart(editor)
    fireEvent.blur(editor)
    rerender(
      <MentionInput
        value="助手写好的提示词"
        onValueChange={vi.fn()}
        tokens={[]}
        aria-label="editor"
      />,
    )
    expect(editor.textContent).toBe('助手写好的提示词')
  })
})

/**
 * 不带 `@` 的原文引用（视频档按模型写：`图片1` / `Image 1`，owner 09-24）。
 */
describe('parseMentions · 原文引用', () => {
  it('原文编号成胶囊，后面紧跟数字的不算（图片12 ≠ 图片1）', () => {
    expect(parseMentions('将图片1中的女孩，图片12', [], ['图片1'])).toEqual([
      { type: 'text', text: '将' },
      { type: 'token', name: '图片1' },
      { type: 'text', text: '中的女孩，图片12' },
    ])
  })

  it('英文原文要求前面不是字母数字（MyImage 1 不算）', () => {
    expect(parseMentions('Image 1 walks; MyImage 1', [], ['Image 1'])).toEqual([
      { type: 'token', name: 'Image 1' },
      { type: 'text', text: ' walks; MyImage 1' },
    ])
  })

  it('@ 前缀那套照旧', () => {
    expect(parseMentions('@Image1 和 图片1', ['Image1'], ['图片1'])).toEqual([
      { type: 'token', name: 'Image1' },
      { type: 'text', text: ' 和 ' },
      { type: 'token', name: '图片1' },
    ])
  })
})

describe('MentionInput · 没有缩略图的胶囊', () => {
  it('音频画波形、视频画 ▶ —— 画布外端口色缺席时不能只剩一个空格子', () => {
    const { container } = render(
      <MentionInput
        value="音色参考音频1，参考视频1"
        onValueChange={vi.fn()}
        tokens={[
          { name: '音频1', kind: 'voice', literal: true },
          { name: '视频1', kind: 'video', literal: true },
        ]}
        aria-label="editor"
      />,
    )
    const voice = container.querySelector('[data-mention="音频1"]')
    const video = container.querySelector('[data-mention="视频1"]')
    expect(voice?.querySelectorAll('svg rect')).toHaveLength(3)
    expect(video?.querySelector('svg polygon')).not.toBeNull()
  })
})

describe('MentionInput · 这一枪不发的胶囊', () => {
  it('`dimmed` 的胶囊变淡；存储不变（序列化照旧读字面量）', () => {
    const { container } = render(
      <MentionInput
        value="照 视频1 的运镜，配上 音频1"
        onValueChange={vi.fn()}
        tokens={[
          { name: '视频1', kind: 'video', literal: true, dimmed: true },
          { name: '音频1', kind: 'voice', literal: true },
        ]}
        aria-label="editor"
      />,
    )
    const video = container.querySelector('[data-mention="视频1"]')
    const voice = container.querySelector('[data-mention="音频1"]')
    expect(video).toHaveClass('opacity-45')
    expect(voice).not.toHaveClass('opacity-45')
  })
})

/**
 * Chrome 全选删除后只剩一个占位 `<br>`：那是空，不是一行（09-27 视频台实拍：
 * 写回 "\n"、占位提示再也不回来）。
 */
describe('MentionInput · 只剩一个换行 = 空', () => {
  it.each([
    ['占位 <br>', '<br>'],
    ['块包装里的 <br>', '<div><br></div>'],
    ['换行字符', '\n'],
  ])('%s：写回空串，元素回到 :empty', (_, leftover) => {
    const onValueChange = vi.fn()
    render(
      <MentionInput
        value="hello world"
        onValueChange={onValueChange}
        tokens={[]}
        placeholder="描述动作"
        aria-label="editor"
      />,
    )
    const editor = screen.getByRole('textbox')
    editor.innerHTML = leftover
    fireEvent.input(editor)
    expect(onValueChange).toHaveBeenLastCalledWith('')
    expect(editor).toBeEmptyDOMElement()
    expect(editor.matches(':empty')).toBe(true)
  })

  it('文字后面的换行与多行照留', () => {
    const onValueChange = vi.fn()
    render(
      <MentionInput
        value=""
        onValueChange={onValueChange}
        tokens={[]}
        aria-label="editor"
      />,
    )
    const editor = screen.getByRole('textbox')
    for (const [html, value] of [
      // Chrome 在 pre-wrap 行尾按 Shift+Enter 写的就是两个换行。
      ['abc\n\n', 'abc\n\n'],
      ['abc<br>', 'abc\n'],
      ['第一行\n第二行', '第一行\n第二行'],
    ]) {
      editor.innerHTML = html
      fireEvent.input(editor)
      expect(onValueChange).toHaveBeenLastCalledWith(value)
      expect(editor.innerHTML).toBe(html)
    }
  })

  it('外面传进来的单个换行（清空修好前存下的）也画成空', () => {
    render(
      <MentionInput
        value={'\n'}
        onValueChange={vi.fn()}
        tokens={[]}
        placeholder="描述动作"
        aria-label="editor"
      />,
    )
    expect(screen.getByRole('textbox')).toBeEmptyDOMElement()
  })
})
