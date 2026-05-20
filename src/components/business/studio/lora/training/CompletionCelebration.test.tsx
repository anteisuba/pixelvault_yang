import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import type { LoraTrainingRecord } from '@/types'

import { CompletionCelebration } from './CompletionCelebration'

import en from '@/messages/en.json'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function baseJob(
  overrides: Partial<LoraTrainingRecord> = {},
): LoraTrainingRecord {
  return {
    id: 'job-1',
    name: 'My Char',
    triggerWord: 'sks_char',
    loraType: 'subject',
    status: 'COMPLETED',
    progress: 1,
    loraUrl: 'https://example.com/lora.safetensors',
    errorMessage: null,
    characterCardId: null,
    createdAt: new Date(),
    completedAt: new Date(),
    loraStyleCode: 'my-char-abc1',
    ...overrides,
  }
}

function renderCelebration(
  job: LoraTrainingRecord,
  opts: { onTrainAnother?: () => void; onDismiss?: () => void } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CompletionCelebration
        job={job}
        onTrainAnother={opts.onTrainAnother ?? vi.fn()}
        onDismiss={opts.onDismiss ?? vi.fn()}
      />
    </NextIntlClientProvider>,
  )
}

describe('CompletionCelebration', () => {
  beforeEach(() => {
    pushMock.mockReset()
  })

  it('renders the job name in the body copy', () => {
    renderCelebration(baseJob())
    expect(screen.getByText(/My Char/)).toBeInTheDocument()
  })

  it('routes to /studio/image?style=<code> on "use it now" click', () => {
    renderCelebration(baseJob({ loraStyleCode: 'my-char-abc1' }))
    fireEvent.click(
      screen.getByRole('button', { name: en.LoraTraining.completionCtaUse }),
    )
    expect(pushMock).toHaveBeenCalledWith('/studio/image?style=my-char-abc1')
  })

  it('falls back to bare /studio/image when no styleCode is present', () => {
    renderCelebration(baseJob({ loraStyleCode: null }))
    fireEvent.click(
      screen.getByRole('button', { name: en.LoraTraining.completionCtaUse }),
    )
    expect(pushMock).toHaveBeenCalledWith('/studio/image')
  })

  it('calls onTrainAnother when "train another" is clicked', () => {
    const onTrainAnother = vi.fn()
    renderCelebration(baseJob(), { onTrainAnother })
    fireEvent.click(
      screen.getByRole('button', {
        name: en.LoraTraining.completionCtaAnother,
      }),
    )
    expect(onTrainAnother).toHaveBeenCalled()
  })

  it('calls onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn()
    renderCelebration(baseJob(), { onDismiss })
    fireEvent.click(
      screen.getByRole('button', { name: en.LoraTraining.completionDismiss }),
    )
    expect(onDismiss).toHaveBeenCalled()
  })
})
