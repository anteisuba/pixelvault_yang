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
