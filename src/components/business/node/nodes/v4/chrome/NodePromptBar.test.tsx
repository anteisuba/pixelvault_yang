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

  it('单行是 44px 胶囊；超一行原地长高并把 chip 挪到底行', () => {
    stubScrollHeight(20)
    const { container, rerender } = setup()
    const bar = container.querySelector('[data-node-chrome="prompt-bar"]')
    expect(bar).toHaveAttribute('data-expanded', 'false')
    expect(bar?.className).toContain('h-11')

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
    expect(
      container.querySelector('[data-node-chrome="prompt-bar"]'),
    ).toHaveAttribute('data-expanded', 'true')
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

  it('生成中：正文只读，发送换成取消', () => {
    const onCancel = vi.fn()
    setup({ generating: true, onCancel })
    expect(screen.getByLabelText('提示词')).toHaveAttribute('readonly')
    expect(screen.queryByLabelText('send')).toBeNull()
    fireEvent.click(screen.getByLabelText('cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})
