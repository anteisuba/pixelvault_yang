import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOutpaintEditor } from './StudioOutpaintEditor'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderEditor(overrides?: {
  onApply?: (
    padding: { top: number; right: number; bottom: number; left: number },
    prompt: string,
  ) => void
  onCancel?: () => void
}) {
  const props = {
    imageUrl: 'https://example.com/source.png',
    imageWidth: 640,
    imageHeight: 480,
    onApply: overrides?.onApply ?? vi.fn(),
    onCancel: overrides?.onCancel ?? vi.fn(),
  }

  render(<StudioOutpaintEditor {...props} />)
  return props
}

describe('StudioOutpaintEditor', () => {
  it('renders padding controls', () => {
    renderEditor()

    expect(screen.getByLabelText('top')).toBeInTheDocument()
    expect(screen.getByLabelText('right')).toBeInTheDocument()
    expect(screen.getByLabelText('bottom')).toBeInTheDocument()
    expect(screen.getByLabelText('left')).toBeInTheDocument()
  })

  it('sets all padding values from a preset', () => {
    renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'presetUniform128' }))

    expect(screen.getByLabelText('top')).toHaveValue(128)
    expect(screen.getByLabelText('right')).toHaveValue(128)
    expect(screen.getByLabelText('bottom')).toHaveValue(128)
    expect(screen.getByLabelText('left')).toHaveValue(128)
  })

  it('passes padding and prompt to onApply', () => {
    const onApply = vi.fn()
    renderEditor({ onApply })

    fireEvent.change(screen.getByLabelText('right'), {
      target: { value: '200' },
    })
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Continue the landscape' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'apply' }))

    expect(onApply).toHaveBeenCalledWith(
      { top: 64, right: 200, bottom: 64, left: 64 },
      'Continue the landscape',
    )
  })
})
