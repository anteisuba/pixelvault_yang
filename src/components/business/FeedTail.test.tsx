import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { FeedTail } from './FeedTail'

const placeholder = <div data-testid="gray-row" />

describe('FeedTail', () => {
  it('appends a row of gray blocks while the next batch loads (no spinner)', () => {
    const { container } = render(
      <FeedTail
        loading
        error={null}
        ended={false}
        onRetry={vi.fn()}
        placeholder={placeholder}
      />,
    )
    expect(screen.getByTestId('gray-row')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('loadingMore')
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('keeps the gray blocks and writes one line with a retry when a batch fails', () => {
    const onRetry = vi.fn()
    render(
      <FeedTail
        loading={false}
        error="network down"
        ended={false}
        onRetry={onRetry}
        placeholder={placeholder}
      />,
    )
    expect(screen.getByTestId('gray-row')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('batchFailed')
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says there is nothing more at the very bottom', () => {
    render(
      <FeedTail
        loading={false}
        error={null}
        ended
        onRetry={vi.fn()}
        placeholder={placeholder}
      />,
    )
    expect(screen.getByTestId('feed-tail-end')).toHaveTextContent('endOfList')
    expect(screen.queryByTestId('gray-row')).toBeNull()
  })
})
