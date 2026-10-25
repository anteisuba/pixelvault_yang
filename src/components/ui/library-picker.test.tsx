import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LibraryPickBar, LibraryPickerHeader } from './library-picker'

describe('library-picker（ui-spec ㉔ 从库里挑）', () => {
  it('黑条挑了才浮出来：0 个不画', () => {
    const { container } = render(
      <LibraryPickBar
        count={0}
        countLabel="已选 0"
        cancelLabel="取消"
        confirmLabel="挂上 0 个"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('挑了：已选 · 取消 · 挂上，挑满了还点就地一句红字', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <LibraryPickBar
        count={2}
        countLabel="已选 2 / 4"
        warning="最多 4 张"
        cancelLabel="取消"
        confirmLabel="挂上 2 个"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('已选 2 / 4')
    expect(screen.getByText('最多 4 张')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '挂上 2 个' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('框顶：标题旁的灰药丸写锁着什么，× 关掉', () => {
    const onClose = vi.fn()
    render(
      <LibraryPickerHeader
        title="挑 LoRA"
        lock="和 WAI-Illustrious 装得上"
        closeLabel="关闭"
        onClose={onClose}
      />,
    )
    expect(screen.getByRole('heading', { name: '挑 LoRA' })).toBeInTheDocument()
    expect(screen.getByText('和 WAI-Illustrious 装得上')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
