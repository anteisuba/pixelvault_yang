import { createRef, useState } from 'react'
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
    // The 16px thumb contributes no text, so textContent stays the clean @name.
    expect(chips[0].textContent).toBe('@角色A')
    expect(chips[0].querySelector('.mention-chip-thumb')).not.toBeNull()
  })

  it('embeds the token thumbnail image inside the chip (§9 V2-2)', () => {
    const { container } = render(
      <MentionInput
        value="参考 @角色A"
        onValueChange={vi.fn()}
        tokens={[
          {
            name: '角色A',
            kind: 'character',
            thumbnailUrl: 'https://r2.example/face.jpg',
          },
        ]}
      />,
    )
    const img = container.querySelector('.mention-chip-thumb img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('https://r2.example/face.jpg')
  })

  it('marks a video chip with a ▶ overlay and no image when thumbless', () => {
    const { container } = render(
      <MentionInput
        value="参考 @视频1"
        onValueChange={vi.fn()}
        tokens={[{ name: '视频1', kind: 'video' }]}
      />,
    )
    const thumb = container.querySelector('.mention-chip-thumb')
    expect(thumb?.querySelector('img')).toBeNull()
    expect(thumb?.querySelector('svg polygon')).not.toBeNull()
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

  it('preserves the caret when a controlled parent echoes input with an equivalent token list', () => {
    function Harness() {
      const [value, setValue] = useState('@ssd')
      return (
        <MentionInput
          value={value}
          onValueChange={setValue}
          tokens={[...TOKENS]}
        />
      )
    }

    const { container } = render(<Harness />)
    const editor = container.querySelector('[role="textbox"]') as HTMLElement
    const textNode = editor.firstChild as Text
    editor.focus()
    const selection = document.getSelection()
    const range = document.createRange()
    range.setStart(textNode, textNode.data.length)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    textNode.data += 'X'
    selection?.collapse(textNode, textNode.data.length)
    fireEvent.input(editor)

    expect(editor.textContent).toBe('@ssdX')
    expect(document.activeElement).toBe(editor)
    expect(document.getSelection()?.anchorOffset).toBe(5)
  })

  it('lets navigation keys reach the native contenteditable target before stopping canvas bubbling', () => {
    const nativeKeyDown = vi.fn()
    const { container } = render(
      <MentionInput
        value="@ssd"
        onValueChange={vi.fn()}
        tokens={TOKENS}
        onKeyDown={(event) => event.stopPropagation()}
      />,
    )
    const editor = container.querySelector('[role="textbox"]') as HTMLElement
    editor.addEventListener('keydown', nativeKeyDown)

    fireEvent.keyDown(editor, { key: 'ArrowRight' })

    expect(nativeKeyDown).toHaveBeenCalledOnce()
  })
})

describe('MentionInput 光标保持（外部改 value 时不许弹回开头）', () => {
  /** 把光标放到编辑器序列化文本的第 `offset` 个字符处（测试侧的粗略定位：
   *  只处理纯文本节点，够用来验「光标没被扔回 0」这件事）。 */
  function placeCaret(editor: HTMLElement, offset: number) {
    const textNode = Array.from(editor.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE,
    ) as Text | undefined
    if (!textNode) throw new Error('no text node')
    const range = document.createRange()
    range.setStart(textNode, Math.min(offset, textNode.length))
    range.collapse(true)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }

  /** 光标当前落在序列化文本的第几个字符（同上，纯文本口径）。 */
  function caretOffset(): number {
    const selection = document.getSelection()!
    return selection.rangeCount ? selection.getRangeAt(0).endOffset : -1
  }

  /**
   * ⭐ 这条钉的是 owner 真机报的那个 bug 的**根因**。
   *
   * 受控回流是异步的：连打 `ABCDEFGH`，打到 B 时 A 的那次回流才带着旧值回来。
   * 旧实现照着那个旧值重建 DOM，把刚打进去的字冲掉 —— 屏幕上出来 `BCDEFGHA`，
   * 首字符被甩到末尾（真机实拍）。
   *
   * 所以：**光标在编辑器里时，DOM 是真相**，外部 value 只是滞后镜像，不许拿它
   * 重建。这里直接模拟那个时序。
   */
  it('聚焦时外部 value 变化不覆盖正在编辑的内容', () => {
    function Harness() {
      const [value, setValue] = useState('abcdef')
      return (
        <>
          <button type="button" onClick={() => setValue('STALE')}>
            stale
          </button>
          <MentionInput value={value} onValueChange={vi.fn()} tokens={[]} />
        </>
      )
    }
    const { container, getByRole } = render(<Harness />)
    const editor = container.querySelector('[contenteditable]') as HTMLElement
    editor.focus()
    placeCaret(editor, 3)

    // 一次滞后回流 / 外部改写打进来
    fireEvent.click(getByRole('button', { name: 'stale' }))

    // 用户正在打的内容必须原样留着，光标也不动。
    expect(editor.textContent).toBe('abcdef')
    expect(caretOffset()).toBe(3)
  })

  /**
   * 失焦那一支仍然要重建（外部改写是真相），且重建**不许把光标扔回开头** ——
   * 用户点回来时应该还在原处。
   */
  it('失焦时按外部 value 重建，并保住光标位置', () => {
    function Harness() {
      const [value, setValue] = useState('abcdefghij')
      return (
        <>
          <button type="button" onClick={() => setValue('abcXdefghij')}>
            external
          </button>
          <MentionInput value={value} onValueChange={vi.fn()} tokens={[]} />
        </>
      )
    }
    const { container, getByRole } = render(<Harness />)
    const editor = container.querySelector('[contenteditable]') as HTMLElement
    // 光标落在编辑器里，但焦点在别处（外部改写的典型场景）
    placeCaret(editor, 6)

    fireEvent.click(getByRole('button', { name: 'external' }))

    expect(editor.textContent).toBe('abcXdefghij')
    // 修复前这里是 0。
    expect(caretOffset()).toBe(6)
  })

  it('失焦时外部把正文改短到光标之前 → 光标落末尾而不是开头', () => {
    function Harness() {
      const [value, setValue] = useState('abcdefghij')
      return (
        <>
          <button type="button" onClick={() => setValue('ab')}>
            shrink
          </button>
          <MentionInput value={value} onValueChange={vi.fn()} tokens={[]} />
        </>
      )
    }
    const { container, getByRole } = render(<Harness />)
    const editor = container.querySelector('[contenteditable]') as HTMLElement
    placeCaret(editor, 8)

    fireEvent.click(getByRole('button', { name: 'shrink' }))

    expect(caretOffset()).toBe(2)
  })

  it('编辑器没有焦点时不抢焦点', () => {
    function Harness() {
      const [value, setValue] = useState('abc')
      return (
        <>
          <button type="button" onClick={() => setValue('abcd')}>
            external
          </button>
          <MentionInput value={value} onValueChange={vi.fn()} tokens={[]} />
        </>
      )
    }
    const { container, getByRole } = render(<Harness />)
    const button = getByRole('button', { name: 'external' })
    button.focus()
    fireEvent.click(button)
    expect(document.activeElement).toBe(button)
    expect(container.querySelector('[contenteditable]')?.textContent).toBe(
      'abcd',
    )
  })
})
