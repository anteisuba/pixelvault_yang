import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { StudioInputImage } from './StudioInputImage'

// Minimal messages for tests
const messages = {
  Transform: {
    errors: {
      uploadRequired: 'Upload an image to transform.',
      inputTooLarge: 'Image must be under 10 MB and 2048×2048.',
    },
  },
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

describe('StudioInputImage', () => {
  it('renders upload area when no image', () => {
    renderWithIntl(
      <StudioInputImage
        imageData={null}
        onImageSelect={vi.fn()}
        onImageRemove={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Upload an image to transform.'),
    ).toBeInTheDocument()
  })

  it('renders image preview when imageData provided', () => {
    renderWithIntl(
      <StudioInputImage
        imageData="data:image/png;base64,abc"
        onImageSelect={vi.fn()}
        onImageRemove={vi.fn()}
      />,
    )

    const img = screen.getByAltText('Transform input')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc')
  })

  it('calls onImageRemove when remove button clicked', () => {
    const onRemove = vi.fn()
    renderWithIntl(
      <StudioInputImage
        imageData="data:image/png;base64,abc"
        onImageSelect={vi.fn()}
        onImageRemove={onRemove}
      />,
    )

    // Button is hidden by group-hover, but still in DOM
    const removeButton = screen.getByRole('button')
    fireEvent.click(removeButton)
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('disables upload when disabled prop is true', () => {
    renderWithIntl(
      <StudioInputImage
        imageData={null}
        onImageSelect={vi.fn()}
        onImageRemove={vi.fn()}
        disabled
      />,
    )

    const dropZone = screen.getByRole('button')
    expect(dropZone).toHaveClass('pointer-events-none')
  })
})
