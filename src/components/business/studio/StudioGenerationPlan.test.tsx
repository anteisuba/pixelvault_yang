import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-client/generation', () => ({
  fetchGenerationPlanAPI: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioGenerationPlan } from './StudioGenerationPlan'
import { fetchGenerationPlanAPI } from '@/lib/api-client/generation'

const MOCK_PLAN = {
  intent: { subject: 'cat' },
  recommendedModels: [
    {
      modelId: 'flux-2-pro',
      score: 0.95,
      reason: 'Great for portraits',
      matchedBestFor: ['portrait'],
    },
    {
      modelId: 'flux-schnell',
      score: 0.7,
      reason: 'Fast generation',
      matchedBestFor: ['general'],
    },
  ],
  promptDraft: 'a cute cat sitting on a wooden floor, soft lighting',
  negativePromptDraft: 'blurry, low quality',
  variationCount: 4,
}

const mockOnGenerate = vi.fn()
const mockOnClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StudioGenerationPlan', () => {
  it('shows loading state while fetching plan', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}), // never resolves
    )

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('shows plan data after successful fetch', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: MOCK_PLAN,
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByText('a cute cat sitting on a wooden floor, soft lighting'),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('flux-2-pro')).toBeInTheDocument()
  })

  it('calls onGenerate with selected model and compiled prompt on confirm', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: MOCK_PLAN,
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => screen.getByText('generateNow'))
    fireEvent.click(screen.getByText('generateNow'))

    expect(mockOnGenerate).toHaveBeenCalledWith({
      modelId: 'flux-2-pro',
      compiledPrompt: 'a cute cat sitting on a wooden floor, soft lighting',
      negativePrompt: 'blurry, low quality',
    })
  })

  it('calls onClose on cancel button click', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: MOCK_PLAN,
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => screen.getByText('cancel'))
    fireEvent.click(screen.getByText('cancel'))

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows loadFailed and allows generate anyway on API error', async () => {
    ;(fetchGenerationPlanAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Server error',
    })

    render(
      <StudioGenerationPlan
        open
        prompt="a cute cat"
        onGenerate={mockOnGenerate}
        onClose={mockOnClose}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('loadFailed')).toBeInTheDocument()
    })
    // generateNow button still available (generates with original prompt)
    fireEvent.click(screen.getByText('generateNow'))
    expect(mockOnGenerate).toHaveBeenCalledWith({
      modelId: null,
      compiledPrompt: 'a cute cat',
      negativePrompt: undefined,
    })
  })
})
