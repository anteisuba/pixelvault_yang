import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VIDEO_BRAND_IDS, VIDEO_VARIANT_IDS } from '@/constants/video-brands'

import { VideoModelSwitcher } from './VideoModelSwitcher'

const baseProps = {
  brands: [
    VIDEO_BRAND_IDS.seedance,
    VIDEO_BRAND_IDS.kling,
    VIDEO_BRAND_IDS.veo,
  ],
  currentBrand: VIDEO_BRAND_IDS.seedance as string | null,
  brandLabel: (brand: string) => brand,
  variants: [VIDEO_VARIANT_IDS.standard, VIDEO_VARIANT_IDS.fast],
  currentVariant: VIDEO_VARIANT_IDS.fast as
    | (typeof VIDEO_VARIANT_IDS)[keyof typeof VIDEO_VARIANT_IDS]
    | null,
  variantLabel: (variant: string) => variant,
  variantAriaLabel: 'variant',
  onSelectBrand: vi.fn(),
  onSelectVariant: vi.fn(),
}

describe('VideoModelSwitcher', () => {
  it('renders the surfaced brands and fires onSelectBrand', () => {
    const onSelectBrand = vi.fn()
    render(<VideoModelSwitcher {...baseProps} onSelectBrand={onSelectBrand} />)

    expect(screen.getByText('Seedance')).toBeInTheDocument()
    expect(screen.getByText('Kling')).toBeInTheDocument()
    expect(screen.getByText('Veo')).toBeInTheDocument()
    expect(screen.queryByText('LTX')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Kling'))
    expect(onSelectBrand).toHaveBeenCalledWith(VIDEO_BRAND_IDS.kling)
  })

  it('shows the variant dropdown for multi-variant brands and fires onSelectVariant', () => {
    const onSelectVariant = vi.fn()
    render(
      <VideoModelSwitcher {...baseProps} onSelectVariant={onSelectVariant} />,
    )

    const select = screen.getByLabelText('variant')
    expect(select).toBeInTheDocument()
    fireEvent.change(select, { target: { value: VIDEO_VARIANT_IDS.standard } })
    expect(onSelectVariant).toHaveBeenCalledWith(VIDEO_VARIANT_IDS.standard)
  })

  it('hides the variant dropdown for single-variant brands', () => {
    render(
      <VideoModelSwitcher
        {...baseProps}
        currentBrand={VIDEO_BRAND_IDS.kling}
        variants={[]}
        currentVariant={null}
      />,
    )
    expect(screen.queryByLabelText('variant')).not.toBeInTheDocument()
  })
})
