import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioGenerationErrorDialog } from './StudioGenerationErrorDialog'

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  error: { message: 'AI provider timed out. Please try again.' },
  onRetry: vi.fn(),
  onSwitchModel: vi.fn(),
}

describe('StudioGenerationErrorDialog', () => {
  it('renders title and reason when open', () => {
    render(<StudioGenerationErrorDialog {...defaultProps} />)

    expect(screen.getByText('generationError.title')).toBeInTheDocument()
    expect(
      screen.getByText('generationError.reasons.provider_timeout'),
    ).toBeInTheDocument()
  })

  it('calls onRetry and closes on retry button click', () => {
    const onRetry = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        onRetry={onRetry}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByText('generationError.retry'))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onRetry).toHaveBeenCalled()
  })

  it('calls onSwitchModel and closes on switch model button click', () => {
    const onSwitchModel = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        onSwitchModel={onSwitchModel}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByText('generationError.switchModel'))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSwitchModel).toHaveBeenCalled()
  })

  it('expands error details on view details click', () => {
    render(<StudioGenerationErrorDialog {...defaultProps} />)

    const detailsButton = screen.getByText('generationError.viewDetails')
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(detailsButton)

    expect(detailsButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('AI provider timed out. Please try again.'),
    ).toBeInTheDocument()
  })

  it('uses explicit error code when provided', () => {
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Something went wrong', code: 'content_filtered' }}
      />,
    )

    expect(
      screen.getByText('generationError.reasons.content_filtered'),
    ).toBeInTheDocument()
  })
})
