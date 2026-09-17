import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { NodePromptBar } from './NodePromptBar'

/**
 * jsdom 不排版，`scrollHeight` 永远是 0——长高判据要靠桩喂行高。
 * ⚠ 量的是**等宽隐藏镜像那个 div**，不是 textarea（见组件里的注释）。
 */
function stubScrollHeight(px: number) {
  Object.defineProperty(HTMLDivElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => px,
  })
}

afterEach(() => {
  Reflect.deleteProperty(HTMLDivElement.prototype, 'scrollHeight')
})

function setup(
  props: Partial<React.ComponentProps<typeof NodePromptBar>> = {},
) {
  const onSubmit = vi.fn()
  const onValueChange = vi.fn()
  const view = render(
    <NodePromptBar
      value="站台"
      onValueChange={onValueChange}
      onSubmit={onSubmit}
      placeholder="写点什么"
      ariaLabel="提示词"
      {...props}
    />,
  )
  return { onSubmit, onValueChange, ...view }
}

describe('NodePromptBar', () => {
  // `trailing` 是 chip 与发送钮之间那一格（画板：模型 chip · 规格 chip · 竖线 ·
  // 声音图标 · 竖线 · 生成）。⛔ 它不受 `promptChipMax` 那条 chip 上限管。
  it('trailing 给了才连同两条竖线一起渲染；空的时候不留孤零零的分隔线', () => {
    const { container, rerender } = setup()
    expect(screen.queryByTestId('trailing-slot')).toBeNull()
    expect(container.querySelectorAll('span[aria-hidden].w-px')).toHaveLength(0)

    rerender(
      <NodePromptBar
        value="站台"
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="写点什么"
        ariaLabel="提示词"
        trailing={<button data-testid="trailing-slot">sound</button>}
      />,
    )
    expect(screen.getByTestId('trailing-slot')).toBeInTheDocument()
    expect(container.querySelectorAll('span[aria-hidden].w-px')).toHaveLength(2)
  })

  it('leadingRow 有内容才占栏内首行', () => {
    const { container, rerender } = setup()
    expect(container.querySelector('[data-prompt-bar-leading]')).toBeNull()

    // `null` 与空数组都当没有——调用方常传一个「没东西时返回 null」的元素。
    rerender(
      <NodePromptBar
        value="站台"
        onValueChange={() => {}}
        onSubmit={() => {}}
        placeholder="写点什么"
        ariaLabel="提示词"
        leadingRow={null}
      />,
    )
    expect(container.querySelector('[data-prompt-bar-leading]')).toBeNull()

    rerender(
      <NodePromptBar
        value="站台"
        onValueChange={() => {}}
        onSubmit={() => {}}
        placeholder="写点什么"
        ariaLabel="提示词"
        leadingRow={<span data-testid="slot-chips">首帧</span>}
      />,
    )
    const row = container.querySelector('[data-prompt-bar-leading]')
    expect(row).not.toBeNull()
    expect(row?.contains(screen.getByTestId('slot-chips'))).toBe(true)
    // 首行与正文在**同一片玻璃**里：它是提示词栏自己的子节点。
    expect(row?.closest('[data-node-chrome="prompt-bar"]')).not.toBeNull()
  })

  it('Enter 发送、Shift+Enter 换行、IME 组字期间放行', () => {
    const { onSubmit } = setup()
    const input = screen.getByLabelText('提示词')

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('空提示词不发送', () => {
    const { onSubmit } = setup({ value: '   ' })
    fireEvent.keyDown(screen.getByLabelText('提示词'), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('send')).toBeDisabled()
  })

  it('chip 上限 3：多给的直接丢掉，⛔ 不挤进去把正文压没', () => {
    setup({
      chips: [
        <span key="1">c1</span>,
        <span key="2">c2</span>,
        <span key="3">c3</span>,
        <span key="4">c4</span>,
      ],
    })
    expect(screen.getByText('c3')).toBeInTheDocument()
    expect(screen.queryByText('c4')).toBeNull()
  })

  /**
   * 2026-09-10 owner 真机反馈第一条：一行的编辑区太小。正文**最小两行**（40px），
   * 随字数长到 4 行（80px）封顶 —— ⛔ 44px 单行胶囊那一形态已整个退役。
   */
  it('正文最小两行，随字数长高到 4 行封顶', () => {
    stubScrollHeight(20)
    const { rerender } = setup()
    expect(screen.getByLabelText('提示词').style.height).toBe('40px')

    stubScrollHeight(60)
    rerender(
      <NodePromptBar
        value="很长很长的一段"
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="写点什么"
        ariaLabel="提示词"
      />,
    )
    expect(screen.getByLabelText('提示词').style.height).toBe('60px')

    stubScrollHeight(200)
    rerender(
      <NodePromptBar
        value={'很长很长的一段'.repeat(40)}
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        placeholder="写点什么"
        ariaLabel="提示词"
      />,
    )
    expect(screen.getByLabelText('提示词').style.height).toBe('80px')
  })

  it('超 4 行内部滚动并显示字数（⛔ 不弹大编辑器）', () => {
    stubScrollHeight(120)
    const { container } = setup({ value: 'x'.repeat(128) })
    expect(screen.getByLabelText('提示词').className).toContain(
      'overflow-y-auto',
    )
    expect(
      container.querySelector('[data-prompt-bar-count]')?.textContent,
    ).toContain('charCount')
  })

  it('renderValue = 输入框内的等距镜像：字符逐字符相同、正文字色透明留光标', () => {
    const { container } = setup({
      value: '[愤怒]台词',
      renderValue: (text: string) => <span data-mirror>{text}</span>,
    })
    const overlay = container.querySelector('[data-prompt-bar-overlay]')!
    expect(overlay.textContent).toBe('[愤怒]台词')
    const input = screen.getByLabelText('提示词')
    expect(input.className).toContain('text-transparent')
    expect(input.className).toContain('caret-foreground')
  })

  it('不给 renderValue 就没有镜像层，正文字色照旧', () => {
    const { container } = setup()
    expect(container.querySelector('[data-prompt-bar-overlay]')).toBeNull()
    expect(screen.getByLabelText('提示词').className).toContain(
      'text-foreground',
    )
  })

  it('inputRef 拿得到 textarea；选区变化会报出来', () => {
    const inputRef = { current: null as HTMLTextAreaElement | null }
    const onSelectionChange = vi.fn()
    setup({ inputRef, onSelectionChange })
    const input = screen.getByLabelText('提示词') as HTMLTextAreaElement
    expect(inputRef.current).toBe(input)
    input.selectionStart = 2
    input.selectionEnd = 2
    fireEvent.select(input)
    expect(onSelectionChange).toHaveBeenCalledWith({ start: 2, end: 2 })
  })

  /**
   * 2026-09-10 owner 真机反馈第五条：在栏里双击选词，卡片把它当成「双击卡片」
   * 顺手展开 / 弹快速看。栏 / 轨 / 工具条三处根元素一起挡住冒泡。
   */
  it('栏内双击不冒泡到卡片', () => {
    const onCardDoubleClick = vi.fn()
    render(
      <div onDoubleClick={onCardDoubleClick}>
        <NodePromptBar
          value="站台"
          onValueChange={() => {}}
          onSubmit={() => {}}
          placeholder="写点什么"
          ariaLabel="提示词"
        />
      </div>,
    )
    fireEvent.doubleClick(screen.getByLabelText('提示词'))
    expect(onCardDoubleClick).not.toHaveBeenCalled()
  })

  it('生成中：正文只读，发送换成取消', () => {
    const onCancel = vi.fn()
    setup({ generating: true, onCancel })
    expect(screen.getByLabelText('提示词')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('send')).toBeNull()
    fireEvent.click(screen.getByLabelText('cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('NodePromptBar — 未选渠道闸门（D2 Q1）', () => {
  it('blockedLabel 把发送键换成「先选渠道」，点它走 onBlockedClick', () => {
    const onBlockedClick = vi.fn()
    const { onSubmit } = setup({
      blockedLabel: '先选渠道',
      onBlockedClick,
    })
    const send = document.querySelector(
      '[data-prompt-bar-send]',
    ) as HTMLButtonElement
    expect(send.getAttribute('data-prompt-bar-blocked')).toBe('true')
    expect(send.getAttribute('aria-label')).toBe('先选渠道')
    // ⛔ 不禁用：禁用的按钮收不到点击，用户只剩「点了没反应」。
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    expect(onBlockedClick).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('没挡住时照常发送', () => {
    const onBlockedClick = vi.fn()
    const { onSubmit } = setup({ onBlockedClick })
    fireEvent.click(document.querySelector('[data-prompt-bar-send]') as Element)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onBlockedClick).not.toHaveBeenCalled()
  })
})
