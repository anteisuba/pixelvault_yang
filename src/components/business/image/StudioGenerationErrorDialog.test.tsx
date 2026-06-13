import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'

const TRANSLATIONS: Record<string, string> = {
  'generationError.title': 'Generation Failed',
  'generationError.retry': 'Retry',
  'generationError.switchModel': 'Switch Model',
  'generationError.configureKey': 'Set up API key',
  'generationError.editPrompt': 'Edit prompt',
  'generationError.viewDetails': 'View Details',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => TRANSLATIONS[key] ?? key,
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title and reason when open', () => {
    render(<StudioGenerationErrorDialog {...defaultProps} />)

    expect(screen.getByText('Generation Failed')).toBeInTheDocument()
    expect(screen.getByText('generation.provider_timeout')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

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

    fireEvent.click(screen.getByRole('button', { name: 'Switch Model' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSwitchModel).toHaveBeenCalled()
  })

  it('expands error details on view details click', () => {
    render(<StudioGenerationErrorDialog {...defaultProps} />)

    const detailsButton = screen.getByRole('button', { name: 'View Details' })
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

    expect(screen.getByText('generation.content_filtered')).toBeInTheDocument()
  })

  it('uses configure key as the primary action for invalid API keys when wired', () => {
    const onConfigureKey = vi.fn()
    const onRetry = vi.fn()
    const onSwitchModel = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Invalid API key', code: 'invalid_api_key' }}
        onConfigureKey={onConfigureKey}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
        onOpenChange={onOpenChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Set up API key' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfigureKey).toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
    expect(onSwitchModel).not.toHaveBeenCalled()
  })

  it('uses edit prompt as the primary action for content filtered errors when wired', () => {
    const onEditPrompt = vi.fn()
    const onRetry = vi.fn()
    const onSwitchModel = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{
          message: 'Safety filter blocked it',
          code: 'content_filtered',
        }}
        onEditPrompt={onEditPrompt}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }))

    expect(onEditPrompt).toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
    expect(onSwitchModel).not.toHaveBeenCalled()
  })

  it('keeps retry as the primary action for provider timeouts', () => {
    const onRetry = vi.fn()
    const onSwitchModel = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Provider timed out', code: 'provider_timeout' }}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalled()
    expect(onSwitchModel).not.toHaveBeenCalled()
  })

  it('falls back invalid API key primary action to switch model when configure key is not wired', () => {
    const onSwitchModel = vi.fn()
    const onRetry = vi.fn()
    render(
      <StudioGenerationErrorDialog
        {...defaultProps}
        error={{ message: 'Invalid API key', code: 'invalid_api_key' }}
        onRetry={onRetry}
        onSwitchModel={onSwitchModel}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Set up API key' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Switch Model' }),
    ).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Switch Model' }))

    expect(onSwitchModel).toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
  })
})
