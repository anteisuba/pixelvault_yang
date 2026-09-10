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

  // ⚠ 调用方是 ReactFlow 的节点元素（`transform` 定位祖先）：不 portal 出去，
  // 压暗层就只有一张卡那么大（真机 2026-09-10 实拍）。
  it('自己 portal 到 document.body，压暗层是 fixed 铺满视口', () => {
    const { container } = setup()
    expect(container.querySelector('[data-node-chrome="frame"]')).toBeNull()
    const scrim = document.body.querySelector<HTMLElement>(
      '[data-node-chrome="frame-scrim"]',
    )!
    expect(scrim.parentElement).toBe(document.body)
    expect(scrim.className).toContain('fixed')
    expect(scrim.className).not.toContain('absolute')
  })

  it('顶栏名字是 13px（text-2sm）+ semibold，⛔ 不是画板那版 14', () => {
    setup()
    const heading = screen.getByRole('heading', { name: 'S02 · 站台独白' })
    expect(heading.className).toContain('text-2sm')
    expect(heading.className).toContain('font-semibold')
  })

  it('宽度由调用方给（视频 720），走 spring-expand', () => {
    setup({ width: NODE_V4_CHROME.frameWidth.video })
    const frame = document.body.querySelector<HTMLElement>(
      '[data-node-chrome="frame"]',
    )!
    expect(frame.style.width).toBe('720px')
    expect(frame.className).toContain('ease-spring-expand')
  })

  // 文本卡的展开态（owner 2026-09-11）：全屏铺满，⛔ 不吃 `width`。
  it('fullscreen 档铺满视口、忽略 width、顶栏可加文件图标', () => {
    setup({
      variant: 'fullscreen',
      width: NODE_V4_CHROME.frameWidth.video,
      titleLeading: <span data-testid="doc-icon" />,
    })
    const frame = document.body.querySelector<HTMLElement>(
      '[data-node-chrome="frame"]',
    )!
    expect(frame.style.width).toBe('')
    expect(frame.className).toContain('h-full')
    expect(frame.className).not.toContain('rounded-node')
    expect(screen.getByTestId('doc-icon')).toBeInTheDocument()
  })

  it('open=false 时什么都不渲染', () => {
    const { container } = setup({ open: false })
    expect(container.firstChild).toBeNull()
  })
})
