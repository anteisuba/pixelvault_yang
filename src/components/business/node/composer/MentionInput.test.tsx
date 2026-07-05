import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  MentionInput,
  parseMentions,
  serializeEditor,
  type MentionInputHandle,
  type MentionToken,
} from './MentionInput'

describe('parseMentions', () => {
  it('returns a single text segment when there are no tokens', () => {
    expect(parseMentions('just some prompt', ['角色A'])).toEqual([
      { type: 'text', text: 'just some prompt' },
    ])
  })

  it('splits a known @name into a token segment', () => {
    expect(parseMentions('前 @角色A 后', ['角色A'])).toEqual([
      { type: 'text', text: '前 ' },
      { type: 'token', name: '角色A' },
      { type: 'text', text: ' 后' },
    ])
  })

  it('prefers the longest matching name', () => {
    const segs = parseMentions('@角色A2 走过', ['角色A', '角色A2'])
    expect(segs[0]).toEqual({ type: 'token', name: '角色A2' })
  })

  it('leaves an @ that matches no known name as plain text (renamed → degrades)', () => {
    expect(parseMentions('@旧名字 走过', ['新名字'])).toEqual([
      { type: 'text', text: '@旧名字 走过' },
    ])
  })

  it('handles multiple tokens back to back', () => {
    const segs = parseMentions('@A@B', ['A', 'B'])
    expect(segs).toEqual([
      { type: 'token', name: 'A' },
      { type: 'token', name: 'B' },
    ])
  })
})

describe('serializeEditor', () => {
  it('turns chips back into @name and keeps surrounding text', () => {
    const host = document.createElement('div')
    host.appendChild(document.createTextNode('前 '))
    const chip = document.createElement('span')
    chip.setAttribute('data-mention', '角色A')
    chip.textContent = '@角色A'
    host.appendChild(chip)
    host.appendChild(document.createTextNode(' 后'))
    expect(serializeEditor(host)).toBe('前 @角色A 后')
  })

  it('turns <br> into a newline', () => {
    const host = document.createElement('div')
    host.appendChild(document.createTextNode('a'))
    host.appendChild(document.createElement('br'))
    host.appendChild(document.createTextNode('b'))
    expect(serializeEditor(host)).toBe('a\nb')
  })
})

const TOKENS: MentionToken[] = [
  { name: '角色A', kind: 'character' },
  { name: '教室', kind: 'background' },
]

describe('MentionInput component', () => {
  it('renders known @names as atomic contenteditable=false chips', () => {
    const { container } = render(
      <MentionInput
        value="参考 @角色A 在 @教室"
        onValueChange={vi.fn()}
        tokens={TOKENS}
      />,
    )
    const chips = container.querySelectorAll('[data-mention]')
    expect(chips).toHaveLength(2)
    expect(chips[0].getAttribute('data-mention')).toBe('角色A')
    expect(chips[0].getAttribute('contenteditable')).toBe('false')
    expect(chips[0].textContent).toBe('@角色A')
  })

  it('emits the serialized plain text on input', () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <MentionInput value="" onValueChange={onValueChange} tokens={TOKENS} />,
    )
    const editor = container.querySelector('[role="textbox"]') as HTMLElement
    editor.textContent = 'hello world'
    fireEvent.input(editor)
    expect(onValueChange).toHaveBeenCalledWith('hello world')
  })

  it('inserts a chip and emits @name when insertToken is called', () => {
    const onValueChange = vi.fn()
    const ref = createRef<MentionInputHandle>()
    const { container } = render(
      <MentionInput
        ref={ref}
        value=""
        onValueChange={onValueChange}
        tokens={TOKENS}
      />,
    )
    ref.current?.insertToken('角色A')
    const chip = container.querySelector('[data-mention="角色A"]')
    expect(chip).not.toBeNull()
    expect(onValueChange).toHaveBeenCalledWith('@角色A ')
  })

  it('inserts plain text (no chip) via insertText — used by 运镜语法', () => {
    const onValueChange = vi.fn()
    const ref = createRef<MentionInputHandle>()
    const { container } = render(
      <MentionInput
        ref={ref}
        value=""
        onValueChange={onValueChange}
        tokens={TOKENS}
      />,
    )
    ref.current?.insertText('推镜头 ')
    expect(container.querySelectorAll('[data-mention]')).toHaveLength(0)
    expect(onValueChange).toHaveBeenCalledWith('推镜头 ')
  })

  it('does not re-render (reset) the DOM when value echoes the last edit', () => {
    const onValueChange = vi.fn()
    const { container, rerender } = render(
      <MentionInput value="" onValueChange={onValueChange} tokens={TOKENS} />,
    )
    const editor = container.querySelector('[role="textbox"]') as HTMLElement
    editor.textContent = 'typed'
    fireEvent.input(editor)
    // Parent echoes the emitted value back — DOM must not be wiped/re-rendered.
    rerender(
      <MentionInput
        value="typed"
        onValueChange={onValueChange}
        tokens={TOKENS}
      />,
    )
    expect(editor.textContent).toBe('typed')
  })
})
