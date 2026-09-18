import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MentionInput } from './mention-input'

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
