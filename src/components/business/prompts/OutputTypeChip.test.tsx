import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { OutputTypeChip } from './OutputTypeChip'

describe('OutputTypeChip', () => {
  it.each([
    ['IMAGE', 'border-modality-image/45'],
    ['VIDEO', 'border-modality-video/45'],
    ['AUDIO', 'border-modality-audio/45'],
  ] as const)(
    'tints the %s chip with its modality border color',
    (outputType, borderClass) => {
      render(<OutputTypeChip outputType={outputType} label={outputType} />)
      const chip = screen.getByText(outputType)
      expect(chip).toHaveClass(borderClass)
    },
  )

  it('falls back to neutral styling for legacy MODEL_3D', () => {
    render(<OutputTypeChip outputType="MODEL_3D" label="3D" />)
    expect(screen.getByText('3D')).toHaveClass('border-border/60')
  })
})
