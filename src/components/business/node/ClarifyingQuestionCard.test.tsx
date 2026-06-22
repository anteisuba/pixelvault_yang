import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import type { ScriptDocClarifyingQuestion } from '@/types/script-doc'

import { ClarifyingQuestionCard } from './ClarifyingQuestionCard'

const QUESTIONS: ScriptDocClarifyingQuestion[] = [
  {
    id: 'q-1',
    question: 'How long?',
    options: [
      { id: 'o-1', label: '15s' },
      { id: 'o-2', label: '30s' },
    ],
    multiSelect: false,
    allowCustom: true,
    allowSkip: true,
  },
]

function renderCard(onSubmit = vi.fn()) {
  render(
    <ClarifyingQuestionCard
      questions={QUESTIONS}
      isSubmitting={false}
      onSubmit={onSubmit}
    />,
  )
  return onSubmit
}

describe('ClarifyingQuestionCard', () => {
  it('disables submit until every question is answered or skipped', () => {
    renderCard()
    const submit = screen.getByText('clarify.submit').closest('button')
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByText('15s'))
    expect(submit).not.toBeDisabled()
  })

  it('builds an answer summary from the selected option', () => {
    const onSubmit = renderCard()
    fireEvent.click(screen.getByText('30s'))
    fireEvent.click(screen.getByText('clarify.submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const summary = onSubmit.mock.calls[0]?.[0] as string
    expect(summary).toContain('How long?')
    expect(summary).toContain('30s')
  })

  it('single-select replaces the previous choice', () => {
    const onSubmit = renderCard()
    fireEvent.click(screen.getByText('15s'))
    fireEvent.click(screen.getByText('30s'))
    fireEvent.click(screen.getByText('clarify.submit'))
    const summary = onSubmit.mock.calls[0]?.[0] as string
    expect(summary).toContain('30s')
    expect(summary).not.toContain('15s')
  })

  it('lets a question be skipped', () => {
    const onSubmit = renderCard()
    fireEvent.click(screen.getByText('clarify.skip'))
    fireEvent.click(screen.getByText('clarify.submit'))
    const summary = onSubmit.mock.calls[0]?.[0] as string
    expect(summary).toContain('clarify.skipped')
  })
})
