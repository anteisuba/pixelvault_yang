import { createRef } from 'react'
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
      width={NODE_V4_CHROME.frameWidth.video}
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
    const { onClose } = setup()
    fireEvent.pointerDown(screen.getByText('正文'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(
      document.body.querySelector('[data-node-chrome="frame-scrim"]')!,
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('有画布来源时 portal 到 stage，压暗层只铺画布', () => {
    const stage = document.createElement('div')
    stage.setAttribute('data-canvas-stage', '')
    const card = document.createElement('div')
    stage.append(card)
    document.body.append(stage)
    const origin = createRef<HTMLDivElement>()
    origin.current = card
    const { container, unmount } = setup({ origin })
    expect(container.querySelector('[data-node-chrome="frame"]')).toBeNull()
    const scrim = stage.querySelector<HTMLElement>(
      '[data-node-chrome="frame-scrim"]',
    )!
    expect(scrim.parentElement).toBe(stage)
    expect(scrim.className).toContain('absolute')
    expect(scrim.className).not.toContain('fixed')
    expect(stage.querySelector('[data-node-chrome-scrim]')).toHaveClass(
      'bg-foreground/24',
    )
    unmount()
    stage.remove()
  })

  it('顶栏名字用 15px，读数紧随名字，操作留在右侧', () => {
    setup()
    const heading = screen.getByRole('heading', { name: 'S02 · 站台独白' })
    expect(heading.className).toContain('text-md')
    expect(heading.className).toContain('font-semibold')
    expect(
      screen.getByRole('dialog').querySelector('[data-node-frame-header]'),
    ).toHaveClass('h-13')
  })

  it('宽度由调用方给（视频 720）', () => {
    setup({ width: NODE_V4_CHROME.frameWidth.video })
    const frame = document.body.querySelector<HTMLElement>(
      '[data-node-chrome="frame"]',
    )!
    expect(frame.style.width).toBe('720px')
  })

  it('document 档是一张宽 880 的纸，带文件图标和顶栏底线', () => {
    setup({
      variant: 'document',
      width: 880,
      titleLeading: <span data-testid="doc-icon" />,
    })
    const frame = document.body.querySelector<HTMLElement>(
      '[data-node-chrome="frame"]',
    )!
    expect(frame.style.width).toBe('880px')
    expect(frame.className).toContain('h-full')
    expect(frame.className).toContain('rounded-node')
    expect(frame.querySelector('[data-node-frame-header]')).toHaveClass(
      'border-b',
    )
    expect(screen.getByTestId('doc-icon')).toBeInTheDocument()
  })

  it('open=false 时什么都不渲染', () => {
    const { container } = setup({ open: false })
    expect(container.firstChild).toBeNull()
  })
})
