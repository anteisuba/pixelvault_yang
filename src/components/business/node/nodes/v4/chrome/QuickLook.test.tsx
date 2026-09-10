import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { QuickLook } from './QuickLook'

function setup(props: Partial<React.ComponentProps<typeof QuickLook>> = {}) {
  const onClose = vi.fn()
  const onVersionChange = vi.fn()
  const onDownload = vi.fn()
  const view = render(
    <QuickLook
      open
      onClose={onClose}
      ariaLabel="快速看"
      readout="2 / 3 · 1792×1024 · Seedream"
      versionCount={3}
      versionIndex={1}
      onVersionChange={onVersionChange}
      onDownload={onDownload}
      {...props}
    >
      <div data-testid="media" />
    </QuickLook>,
  )
  return { onClose, onVersionChange, onDownload, ...view }
}

describe('QuickLook', () => {
  it('只有版本 / 读数 / 下载 / 关闭，⛔ 没有参数', () => {
    setup()
    expect(screen.getByTestId('media')).toBeInTheDocument()
    expect(screen.getByText('2 / 3 · 1792×1024 · Seedream')).toBeInTheDocument()
    expect(screen.getByLabelText('download')).toBeInTheDocument()
    expect(screen.getByLabelText('close')).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('压暗 55%（画布看得见但退到后面）', () => {
    const { container } = setup()
    expect(
      container.querySelector('[data-node-chrome="quick-look"]')?.className,
    ).toContain('bg-background/55')
  })

  it('Esc 关闭；←→ 切版本并在两端停住', () => {
    const { onClose, onVersionChange } = setup()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onVersionChange).toHaveBeenCalledWith(2)
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onVersionChange).toHaveBeenCalledWith(0)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('点空白关闭，点内容不关（⛔ 不认冒泡上来的点击）', () => {
    const { onClose, container } = setup()
    fireEvent.pointerDown(screen.getByTestId('media'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(
      container.querySelector('[data-node-chrome="quick-look"]')!,
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('open=false 时什么都不渲染，键盘也不再挂', () => {
    const { container, onClose } = setup({ open: false })
    expect(container.firstChild).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
