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
    // ⚠ 属性存**完整字面量**（含前缀）—— 阶段 4 加了第二种前缀 `▤` 之后，
    // 只存名字就还原不出它是 `@小林` 还是 `▤小林`，而序列化/光标偏移/原子删除
    // 三处都按这个属性算长度，还原错一个字符光标就错位。
    chip.setAttribute('data-mention', '@角色A')
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
    expect(chips[0].getAttribute('data-mention')).toBe('@角色A')
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
    const chip = container.querySelector('[data-mention="@角色A"]')
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

describe('文本胶囊 ▤ 已整套退役（owner 2026-08-10）', () => {
  /**
   * ⚠ **策略反转，不是测试坏了。** 这一族原本有四条，守的是「素材 `@` 与文本
   * 胶囊 `▤` 两个前缀各认各的名单」。owner 真机试完当场推翻：文本改成「点一下
   * 把内容原文粘进输入框」，正文里不再有任何文本占位符 —— `▤`、`capsuleNames`、
   * `mentionPrefixOf`、`kind: 'text'` 一起删掉。
   *
   * 留这一条反向断言，是因为删掉的代码不会报警：如果哪天有人凭直觉再把 `▤`
   * 当成特殊字符处理，这里会红。
   */
  it('▤ 在正文里就是一个普通字符，不再被认成任何引用', () => {
    expect(parseMentions('▤小林 和 @小林', ['小林'])).toEqual([
      { type: 'text', text: '▤小林 和 ' },
      { type: 'token', name: '小林' },
    ])
  })

  it('序列化只吐 @ 一种字面量（发送链路拿到的就是这一串）', () => {
    const { container } = render(
      <MentionInput
        value="前 @角色A 中 ▤开场 后"
        onValueChange={() => {}}
        tokens={[{ name: '角色A', kind: 'character' }]}
      />,
    )
    const editor = container.querySelector('[contenteditable="true"]')!
    expect(serializeEditor(editor as HTMLElement)).toBe('前 @角色A 中 ▤开场 后')
  })
})

/**
 * `@` 的合法起点（owner 2026-08-10 拍板改判据）。
 *
 * ⚠ 旧规则「`@` 前必须是行首或空白」在中文里几乎等于关掉了这个功能：
 * `前半句。@开` 一声不响什么都不弹，因为句号不是空白 —— 而中文本来就不在标点后
 * 打空格。新判据只挡**邮箱局部名**的字符（ASCII 字母数字与 `._%+-`）。
 *
 * 这一族直接驱动真实编辑器（`readMentionQuery` 读的是 selection，不是纯函数），
 * 所以断言的是「菜单开没开」。
 */
describe('MentionInput · `@` 在什么字符后面才算提及', () => {
  if (!Range.prototype.getBoundingClientRect) {
    // jsdom 不排版，缺它会让 syncMention 抛异常、菜单永远打不开（见 VideoComposer.test）。
    Range.prototype.getBoundingClientRect = (): DOMRect => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    })
  }

  const CANDIDATES = [{ id: 'n1', name: '开场设定' }]

  /** 在编辑器里打出 `text`（光标停在末尾），返回菜单里的候选条数。 */
  function optionCountAfterTyping(text: string): number {
    const { container } = render(
      <MentionInput
        value=""
        onValueChange={() => {}}
        tokens={[]}
        mentionCandidates={CANDIDATES}
        onMentionSelect={() => {}}
      />,
    )
    const editor = container.querySelector('[role="textbox"]') as HTMLElement
    const textNode = document.createTextNode('')
    editor.appendChild(textNode)
    editor.focus()
    const selection = document.getSelection()
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    textNode.data = text
    selection?.collapse(textNode, textNode.data.length)
    fireEvent.input(editor)
    return document.querySelectorAll('[role="option"]').length
  }

  it.each([
    ['行首', '@开'],
    ['空格后', '前半句 @开'],
    ['中文句号后（旧规则下这条是死的）', '前半句。@开'],
    ['中文逗号后', '前半句，@开'],
    ['汉字后', '前半句@开'],
    ['右括号后', '（旁白）@开'],
    ['换行后', '第一行\n@开'],
  ])('%s → 弹菜单', (_label, typed) => {
    expect(optionCountAfterTyping(typed)).toBe(1)
  })

  it.each([
    ['邮箱：字母后', 'xiuruisu@开'],
    ['邮箱：数字后', 'user123@开'],
    ['邮箱：点后', 'first.last@开'],
    ['邮箱：下划线后', 'a_b@开'],
    ['邮箱：加号后', 'a+tag@开'],
  ])('%s → 不弹（这正是那条守卫要挡的）', (_label, typed) => {
    expect(optionCountAfterTyping(typed)).toBe(0)
  })

  it('`@` 后打了空格就不再是提及（用户已经写完这一段）', () => {
    expect(optionCountAfterTyping('@开 场')).toBe(0)
  })
})
