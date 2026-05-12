import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CardifyPreview } from './CardifyPreview'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))

const MESSAGES = {
  Cardify: {
    toggleLabel: 'Render as card with AI',
    toggleHint: 'Hint',
    title: 'Card render preview',
    subtitle: 'Compare and pick',
    original: 'Original',
    rendered: 'AI card',
    renderingHint: 'Rendering…',
    accept: 'Use this card',
    regenerate: 'Regenerate',
    useOriginal: 'Use original',
    close: 'Close preview',
    errorRender: 'Render failed',
  },
}

function renderPreview(
  props: Partial<React.ComponentProps<typeof CardifyPreview>> = {},
) {
  const defaults = {
    originalImage: 'data:image/png;base64,aaa',
    renderedImage: 'https://cdn.example.com/rendered.png',
    isRendering: false,
    isSubmitting: false,
    error: null,
    onAccept: vi.fn(),
    onRegenerate: vi.fn(),
    onUseOriginal: vi.fn(),
    onCancel: vi.fn(),
  }
  const merged = { ...defaults, ...props }
  return {
    ...merged,
    ...render(
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <CardifyPreview {...merged} />
      </NextIntlClientProvider>,
    ),
  }
}

describe('CardifyPreview', () => {
  it('renders both original and rendered panes when renderedImage is ready', () => {
    renderPreview()
    expect(screen.getByAltText('Original')).toBeInTheDocument()
    expect(screen.getByAltText('AI card')).toHaveAttribute(
      'src',
      'https://cdn.example.com/rendered.png',
    )
  })

  it('shows loading spinner in rendered pane while rendering', () => {
    renderPreview({ isRendering: true, renderedImage: null })
    expect(screen.getByText('Rendering…')).toBeInTheDocument()
  })

  it('disables accept when renderedImage is null', () => {
    renderPreview({ renderedImage: null })
    expect(
      screen.getByRole('button', { name: /use this card/i }),
    ).toBeDisabled()
  })

  it('fires onAccept / onRegenerate / onUseOriginal', () => {
    const onAccept = vi.fn()
    const onRegenerate = vi.fn()
    const onUseOriginal = vi.fn()
    renderPreview({ onAccept, onRegenerate, onUseOriginal })
    fireEvent.click(screen.getByRole('button', { name: /use this card/i }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /use original/i }))
    expect(onUseOriginal).toHaveBeenCalledTimes(1)
  })

  it('shows error and disables accept on failure', () => {
    renderPreview({ error: 'Render failed', renderedImage: null })
    expect(screen.getByText('Render failed')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /use this card/i }),
    ).toBeDisabled()
  })

  it('fires onCancel via close button', () => {
    const onCancel = vi.fn()
    renderPreview({ onCancel })
    fireEvent.click(screen.getByRole('button', { name: /close preview/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
