import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { NODE_V4_CHROME } from '@/constants/node-studio'

import { NodeFrame } from './NodeFrame'

function setup(props: Partial<React.ComponentProps<typeof NodeFrame>> = {}) {
  const onClose = vi.fn()
  const view = render(
    <NodeFrame
      open
      onClose={onClose}
      title="S02 · 站台独白"
      width={NODE_V4_CHROME.frameWidth.text}
      footer={<div>182 字 · 3 段</div>}
      assistantBar={<div>让助手写一段…</div>}
      {...props}
    >
      <p>正文</p>
    </NodeFrame>,
  )
  return { onClose, ...view }
}

describe('NodeFrame', () => {
  it('顶栏只有名字与关闭，⛔ 没有全屏钮', () => {
    setup()
    expect(
      screen.getByRole('heading', { name: 'S02 · 站台独白' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('close')).toBeInTheDocument()
    expect(screen.queryByLabelText(/fullscreen|全屏/i)).toBeNull()
  })

  it('框底两条插槽分开渲染（生成行 / 助手栏，两种模型不混）', () => {
    setup()
    expect(screen.getByText('182 字 · 3 段')).toBeInTheDocument()
    expect(screen.getByText('让助手写一段…')).toBeInTheDocument()
  })

  it('Esc 收起', () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('点框外收起，点框内不收', () => {
    const { onClose, container } = setup()
    fireEvent.pointerDown(screen.getByText('正文'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(
      container.querySelector('[data-node-chrome="frame-scrim"]')!,
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('宽度由调用方给（文本 640 / 视频 720），走 spring-expand', () => {
    const { container } = setup({ width: NODE_V4_CHROME.frameWidth.video })
    const frame = container.querySelector<HTMLElement>(
      '[data-node-chrome="frame"]',
    )!
    expect(frame.style.width).toBe('720px')
    expect(frame.className).toContain('ease-spring-expand')
  })

  it('open=false 时什么都不渲染', () => {
    const { container } = setup({ open: false })
    expect(container.firstChild).toBeNull()
  })
})
