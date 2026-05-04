import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioGenerationPlan } from './StudioGenerationPlan'
import type { GenerationPlanResponse } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, unknown>): string => {
      if (key === 'requests') return `${values?.count ?? 0} requests`
      return key
    },
}))

const MOCK_PLAN: GenerationPlanResponse = {
  intent: {
    subject: 'cat',
  },
  recommendedModels: [
    {
      modelId: 'flux-2-pro',
      score: 0.95,
      reason: 'Great for portraits',
      matchedBestFor: ['portrait'],
    },
    {
      modelId: 'flux-2-schnell',
      score: 0.7,
      reason: 'Fast generation',
      matchedBestFor: ['general'],
    },
  ],
  promptDraft: 'a cute cat sitting on a wooden floor, soft lighting',
  negativePromptDraft: 'blurry, low quality',
  estimatedCost: 2,
  variationCount: 1,
}

describe('StudioGenerationPlan', () => {
  it('renders plan content with model badges, prompt, and estimated cost', () => {
    render(
      <StudioGenerationPlan
        plan={MOCK_PLAN}
        onConfirm={vi.fn()}
        onEditPrompt={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('flux-2-pro')).toBeInTheDocument()
    expect(screen.getByText('flux-2-schnell')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue(
        'a cute cat sitting on a wooden floor, soft lighting',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('2 requests')).toBeInTheDocument()
  })

  it('calls onConfirm from the confirm button', () => {
    const onConfirm = vi.fn()

    render(
      <StudioGenerationPlan
        plan={MOCK_PLAN}
        onConfirm={onConfirm}
        onEditPrompt={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'confirm' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel from the cancel button', () => {
    const onCancel = vi.fn()

    render(
      <StudioGenerationPlan
        plan={MOCK_PLAN}
        onConfirm={vi.fn()}
        onEditPrompt={vi.fn()}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onEditPrompt when the prompt textarea changes', () => {
    const onEditPrompt = vi.fn()

    render(
      <StudioGenerationPlan
        plan={MOCK_PLAN}
        onConfirm={vi.fn()}
        onEditPrompt={onEditPrompt}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByDisplayValue(MOCK_PLAN.promptDraft), {
      target: { value: 'updated compiled prompt' },
    })

    expect(onEditPrompt).toHaveBeenCalledWith('updated compiled prompt')
  })
})
