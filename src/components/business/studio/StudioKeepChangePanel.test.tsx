import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock contexts
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: vi.fn(),
  useStudioGen: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioKeepChangePanel } from './StudioKeepChangePanel'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'

const mockDispatch = vi.fn()
const mockGenerate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(useStudioForm as ReturnType<typeof vi.fn>).mockReturnValue({
    state: {
      prompt: 'a cat on a rooftop',
      outputType: 'image',
      aspectRatio: '1:1',
    },
    dispatch: mockDispatch,
  })
  ;(useStudioGen as ReturnType<typeof vi.fn>).mockReturnValue({
    generate: mockGenerate,
    isGenerating: false,
  })
})

describe('StudioKeepChangePanel', () => {
  it('renders keep and change chip groups', () => {
    render(<StudioKeepChangePanel />)

    expect(screen.getByText('keepLabel')).toBeInTheDocument()
    expect(screen.getByText('changeLabel')).toBeInTheDocument()
    // dimension chips appear in both keep and change groups
    expect(screen.getAllByText('subject')).toHaveLength(2)
  })

  it('toggles a keep chip on click', () => {
    render(<StudioKeepChangePanel />)

    const keepChips = screen.getAllByText('style')
    fireEvent.click(keepChips[0])

    // Chip should be selected (aria-pressed or class change — test for aria-pressed)
    expect(keepChips[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls dispatch CLOSE_ALL_PANELS and generate on confirm', async () => {
    render(<StudioKeepChangePanel />)

    fireEvent.click(screen.getByText('generateRefined'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLOSE_ALL_PANELS' })
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'image' }),
    )
  })

  it('cancel button dispatches CLOSE_ALL_PANELS', () => {
    render(<StudioKeepChangePanel />)

    fireEvent.click(screen.getByText('cancel'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLOSE_ALL_PANELS' })
    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('disables generate button while generating', () => {
    ;(useStudioGen as ReturnType<typeof vi.fn>).mockReturnValue({
      generate: mockGenerate,
      isGenerating: true,
    })

    render(<StudioKeepChangePanel />)

    expect(screen.getByText('generateRefined').closest('button')).toBeDisabled()
  })
})
