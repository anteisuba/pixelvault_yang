import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import type { LoraTrainingRecord } from '@/types'

import { TrainingStatusCard } from './TrainingStatusCard'

import en from '@/messages/en.json'

function baseJob(
  overrides: Partial<LoraTrainingRecord> = {},
): LoraTrainingRecord {
  return {
    id: 'job-1',
    name: 'My Char',
    triggerWord: 'sks_char',
    loraType: 'subject',
    status: 'QUEUED',
    progress: 0,
    loraUrl: null,
    errorMessage: null,
    characterCardId: null,
    createdAt: new Date(),
    completedAt: null,
    loraStyleCode: null,
    ...overrides,
  }
}

function renderCard(
  job: LoraTrainingRecord,
  opts: {
    onRestoreConfig?: (job: LoraTrainingRecord) => void
    onDismiss?: () => void
  } = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TrainingStatusCard
        job={job}
        onRestoreConfig={opts.onRestoreConfig ?? vi.fn()}
        onDismiss={opts.onDismiss ?? vi.fn()}
      />
    </NextIntlClientProvider>,
  )
}

describe('TrainingStatusCard', () => {
  it('renders the queued copy and no progress bar', () => {
    renderCard(baseJob({ status: 'QUEUED' }))
    expect(
      screen.getByText(en.LoraTraining.statusCardQueuedTitle),
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders progress as a percentage of the 0–1 float', () => {
    renderCard(baseJob({ status: 'TRAINING', progress: 0.42 }))
    expect(
      screen.getByText(en.LoraTraining.statusCardTrainingTitle),
    ).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    // ⚠ 不断 aria-valuenow：共享原语 ui/progress.tsx 把 `value` 解构掉后从没
    // 传给 Radix Root，Root 因此不带 aria-valuenow（原语侧的既有 a11y 缺口，
    // 不在本组件的责任范围）。这里断真正驱动视觉的指示器位移。
    const indicator = document.querySelector(
      '[data-slot="progress-indicator"]',
    ) as HTMLElement | null
    expect(indicator?.style.transform).toBe('translateX(-58%)')
  })

  it('clamps out-of-range progress instead of overflowing the bar', () => {
    renderCard(baseJob({ status: 'TRAINING', progress: 1.8 }))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('prefers the upstream error message over the generic failure copy', () => {
    renderCard(
      baseJob({ status: 'FAILED', errorMessage: 'dataset validation failed' }),
    )
    expect(screen.getByText('dataset validation failed')).toBeInTheDocument()
    expect(
      screen.queryByText(en.LoraTraining.statusCardFailedBody),
    ).not.toBeInTheDocument()
  })

  it('hands the failed job back on "restore settings"', () => {
    const onRestoreConfig = vi.fn()
    const job = baseJob({ status: 'FAILED' })
    renderCard(job, { onRestoreConfig })
    fireEvent.click(
      screen.getByRole('button', { name: en.LoraTraining.statusCardRestore }),
    )
    expect(onRestoreConfig).toHaveBeenCalledWith(job)
  })

  it('offers no actions while the job is still running', () => {
    renderCard(baseJob({ status: 'TRAINING', progress: 0.1 }))
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
