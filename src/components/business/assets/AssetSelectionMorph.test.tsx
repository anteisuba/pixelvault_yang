import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SelectionArmButton } from './AssetSelectionMorph'

describe('SelectionArmButton', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks once more in place before deleting', () => {
    const onConfirm = vi.fn()
    render(
      <SelectionArmButton
        label="删除"
        armedLabel="确认删除 2 张"
        resetKey="2"
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onConfirm).not.toHaveBeenCalled()
    const armed = screen.getByRole('button', { name: '确认删除 2 张' })
    expect(armed).toHaveAttribute('data-armed', 'true')

    fireEvent.click(armed)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  })

  it('backs out after a pause or when the selection changes', () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <SelectionArmButton
        label="删除"
        armedLabel="确认删除 2 张"
        resetKey="2"
        onConfirm={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    rerender(
      <SelectionArmButton
        label="删除"
        armedLabel="确认删除 3 张"
        resetKey="3"
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  })
})
