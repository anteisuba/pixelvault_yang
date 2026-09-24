import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CodeBlockCopyButton } from './code-block'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string =>
      key,
}))

describe('CodeBlockCopyButton（拆分与反推 X2 / X3）', () => {
  const writeText = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    writeText.mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  })
  afterEach(() => vi.useRealTimers())

  it('copies the block, shows 已复制 for 1.5s, then goes back', async () => {
    render(<CodeBlockCopyButton code="1girl, solo" />)
    const button = screen.getByTestId('code-block-copy')
    expect(button).toHaveAttribute('aria-label', 'copy')

    await act(async () => {
      fireEvent.click(button)
    })
    expect(writeText).toHaveBeenCalledWith('1girl, solo')
    expect(button).toHaveAttribute('data-copied', 'true')
    expect(button).toHaveTextContent('copied')

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(button).toHaveAttribute('data-copied', 'false')
  })

  it('stays put when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<CodeBlockCopyButton code="x" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('code-block-copy'))
    })
    expect(screen.getByTestId('code-block-copy')).toHaveAttribute(
      'data-copied',
      'false',
    )
  })
})
