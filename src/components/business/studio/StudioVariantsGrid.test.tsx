import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { StudioVariantsGrid } from './StudioVariantsGrid'
import type { TransformOutput } from '@/types/transform'

const messages = {
  Transform: {
    errors: { allFailed: 'All variants failed.' },
    variants: { retry: 'Retry' },
  },
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

const MOCK_OUTPUT: TransformOutput = {
  original: { url: 'data:image/png;base64,orig', width: 512, height: 512 },
  variants: [
    {
      status: 'success',
      result: {
        url: 'https://r2.example/1.png',
        width: 512,
        height: 512,
        cost: 1,
      },
    },
    {
      status: 'failed',
      error: {
        code: 'PROVIDER_ERROR',
        i18nKey: 'Transform.errors.allFailed',
        retryable: true,
        displayMessage: 'Provider timeout',
      },
    },
  ],
  totalCost: 1,
}

describe('StudioVariantsGrid', () => {
  it('renders skeletons when transforming', () => {
    const { container } = renderWithIntl(
      <StudioVariantsGrid
        output={null}
        isTransforming
        variantCount={4}
        onRetry={vi.fn()}
      />,
    )

    const skeletons = container.querySelectorAll('[class*="animate-pulse"]')
    expect(skeletons).toHaveLength(4)
  })

  it('renders nothing when no output and not transforming', () => {
    const { container } = renderWithIntl(
      <StudioVariantsGrid
        output={null}
        isTransforming={false}
        variantCount={4}
        onRetry={vi.fn()}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders success variant as image', () => {
    renderWithIntl(
      <StudioVariantsGrid
        output={MOCK_OUTPUT}
        isTransforming={false}
        variantCount={4}
        onRetry={vi.fn()}
      />,
    )

    const img = screen.getByAltText('Variant 1')
    expect(img).toHaveAttribute('src', 'https://r2.example/1.png')
  })

  it('renders failed variant with retry button', () => {
    const onRetry = vi.fn()
    renderWithIntl(
      <StudioVariantsGrid
        output={MOCK_OUTPUT}
        isTransforming={false}
        variantCount={4}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('Provider timeout')).toBeInTheDocument()
    const retryBtn = screen.getByText('Retry')
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledWith(1)
  })

  it('uses single column for fast mode', () => {
    const { container } = renderWithIntl(
      <StudioVariantsGrid
        output={null}
        isTransforming
        variantCount={1}
        onRetry={vi.fn()}
      />,
    )

    const grid = container.firstChild as HTMLElement
    expect(grid).toHaveClass('grid-cols-1')
  })
})
