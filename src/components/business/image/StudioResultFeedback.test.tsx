import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { StudioResultFeedback } from './StudioResultFeedback'
import type { GenerationEvaluation } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const MOCK_EVALUATION: GenerationEvaluation = {
  overall: 8.8,
  subjectMatch: 9,
  styleMatch: 8.5,
  compositionMatch: 8.2,
  artifactScore: 9.5,
  promptAdherence: 8.8,
  detectedIssues: [],
  suggestedFixes: [],
}

describe('StudioResultFeedback', () => {
  it('notifies the parent once per click without updating it during render', () => {
    const onFeedback = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Parent() {
      const [tags, setTags] = useState<string[]>([])
      return (
        <>
          <output>{tags.join(',')}</output>
          <StudioResultFeedback
            generationId="gen-1"
            evaluation={null}
            onFeedback={(next) => {
              onFeedback(next)
              setTags(next)
            }}
          />
        </>
      )
    }
    try {
      render(
        <StrictMode>
          <Parent />
        </StrictMode>,
      )
      for (const label of [
        'subjectMismatch',
        'styleMismatch',
        'satisfied',
        'satisfied',
      ]) {
        fireEvent.click(screen.getByRole('button', { name: label }))
      }
      expect(onFeedback.mock.calls).toEqual([
        [['subject_mismatch']],
        [['subject_mismatch', 'style_mismatch']],
        [['satisfied']],
        [[]],
      ])
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })
  it('renders feedback chips', () => {
    render(
      <StudioResultFeedback
        generationId="gen-1"
        evaluation={null}
        onFeedback={vi.fn()}
      />,
    )

    expect(screen.getByText('subjectMismatch')).toBeInTheDocument()
    expect(screen.getByText('styleMismatch')).toBeInTheDocument()
    expect(screen.getByText('compositionMismatch')).toBeInTheDocument()
    expect(screen.getByText('lightingIssue')).toBeInTheDocument()
    expect(screen.getByText('satisfied')).toBeInTheDocument()
  })

  it('calls onFeedback with selected tags', () => {
    const onFeedback = vi.fn()

    render(
      <StudioResultFeedback
        generationId="gen-1"
        evaluation={null}
        onFeedback={onFeedback}
      />,
    )

    fireEvent.click(screen.getByText('subjectMismatch'))

    expect(onFeedback).toHaveBeenCalledWith(['subject_mismatch'])
    expect(screen.getByText('subjectMismatch')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('displays overall score as /10 format', () => {
    render(
      <StudioResultFeedback
        generationId="gen-1"
        evaluation={{ ...MOCK_EVALUATION, overall: 8.8 }}
        onFeedback={vi.fn()}
      />,
    )

    expect(screen.getByText('8.8/10')).toBeInTheDocument()
  })

  it('resets selected tags when generationId changes', () => {
    const onFeedback = vi.fn()
    const { rerender } = render(
      <StudioResultFeedback
        generationId="gen-1"
        evaluation={null}
        onFeedback={onFeedback}
      />,
    )

    fireEvent.click(screen.getByText('subjectMismatch'))
    expect(screen.getByText('subjectMismatch')).toHaveAttribute(
      'data-active',
      'true',
    )

    rerender(
      <StudioResultFeedback
        generationId="gen-2"
        evaluation={null}
        onFeedback={onFeedback}
      />,
    )

    expect(screen.getByText('subjectMismatch')).not.toHaveAttribute(
      'data-active',
      'true',
    )
  })
})
