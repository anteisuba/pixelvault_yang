import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: vi.fn(),
}))
vi.mock('@/lib/api-client/generation', () => ({
  evaluateGenerationAPI: vi.fn(),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    if (key === 'scoreLabel' && typeof opts?.score === 'string') {
      return opts.score
    }
    return opts ? `${key}:${JSON.stringify(opts)}` : key
  },
}))

import { StudioResultFeedback } from './StudioResultFeedback'
import { useStudioForm } from '@/contexts/studio-context'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import type { GenerationEvaluation, GenerationRecord } from '@/types'

const mockDispatch = vi.fn()
const FAKE_GEN = {
  id: 'gen_1',
  url: 'https://example.com/img.png',
  outputType: 'IMAGE',
} as GenerationRecord

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

beforeEach(() => {
  vi.clearAllMocks()
  ;(useStudioForm as ReturnType<typeof vi.fn>).mockReturnValue({
    dispatch: mockDispatch,
  })
})

describe('StudioResultFeedback', () => {
  it('renders 5 feedback buttons', () => {
    render(<StudioResultFeedback generation={FAKE_GEN} />)

    expect(screen.getByText('satisfied')).toBeInTheDocument()
    expect(screen.getByText('subjectMismatch')).toBeInTheDocument()
    expect(screen.getByText('styleMismatch')).toBeInTheDocument()
    expect(screen.getByText('compositionMismatch')).toBeInTheDocument()
    expect(screen.getByText('lightingMismatch')).toBeInTheDocument()
  })

  it('calls evaluateGenerationAPI on satisfied click and shows score', async () => {
    ;(evaluateGenerationAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: MOCK_EVALUATION,
    })

    render(<StudioResultFeedback generation={FAKE_GEN} />)
    fireEvent.click(screen.getByText('satisfied'))

    await waitFor(() => {
      expect(evaluateGenerationAPI).toHaveBeenCalledWith('gen_1')
    })
    await waitFor(() => {
      expect(screen.getByText('8.8/10')).toBeInTheDocument()
    })
  })

  it('displays overall score as /10 format', async () => {
    ;(evaluateGenerationAPI as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { ...MOCK_EVALUATION, overall: 8.8 },
    })

    render(<StudioResultFeedback generation={FAKE_GEN} />)
    fireEvent.click(screen.getByText('satisfied'))

    expect(await screen.findByText('8.8/10')).toBeInTheDocument()
  })

  it('opens keepChange panel on mismatch button click', () => {
    render(<StudioResultFeedback generation={FAKE_GEN} />)

    fireEvent.click(screen.getByText('subjectMismatch'))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      payload: 'keepChange',
    })
  })

  it('shows evaluating state while API is loading', async () => {
    let resolve: (v: unknown) => void
    const pending = new Promise((r) => {
      resolve = r
    })
    ;(evaluateGenerationAPI as ReturnType<typeof vi.fn>).mockReturnValue(
      pending,
    )

    render(<StudioResultFeedback generation={FAKE_GEN} />)
    fireEvent.click(screen.getByText('satisfied'))

    expect(screen.getByText('evaluating')).toBeInTheDocument()

    resolve!({ success: false, error: 'fail' })
    await waitFor(() => expect(screen.queryByText('evaluating')).toBeNull())
  })
})
