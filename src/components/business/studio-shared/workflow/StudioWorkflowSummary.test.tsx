import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WORKFLOW_IDS } from '@/constants/workflows'

import { StudioWorkflowSummary } from './StudioWorkflowSummary'

const contextState = vi.hoisted(() => ({
  selectedWorkflowId: '',
  prompt: '',
  selectedWorkflow: undefined as
    | {
        publicNameKey: string
        descriptionKey: string
      }
    | undefined,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioContext: () => ({
    state: { prompt: contextState.prompt },
    selectedWorkflowId: contextState.selectedWorkflowId,
    getSelectedWorkflow: () => contextState.selectedWorkflow,
  }),
}))

describe('StudioWorkflowSummary', () => {
  it('shows the selected workflow name and description', () => {
    contextState.selectedWorkflowId = WORKFLOW_IDS.QUICK_IMAGE
    contextState.prompt = 'already started'
    contextState.selectedWorkflow = {
      publicNameKey: 'workflows.QUICK_IMAGE.name',
      descriptionKey: 'workflows.QUICK_IMAGE.description',
    }

    render(<StudioWorkflowSummary />)

    expect(screen.getByText('workflows.QUICK_IMAGE.name')).toBeInTheDocument()
    expect(
      screen.getByText('workflows.QUICK_IMAGE.description'),
    ).toBeInTheDocument()
  })

  it('shows the workflow empty hint when workflow is missing', () => {
    contextState.selectedWorkflowId = 'MISSING_WORKFLOW'
    contextState.prompt = ''
    contextState.selectedWorkflow = undefined

    render(<StudioWorkflowSummary />)

    expect(screen.getByText('workflowEmptyHint')).toBeInTheDocument()
  })

  it('shows the workflow empty hint in the initial prompt state', () => {
    contextState.selectedWorkflowId = WORKFLOW_IDS.QUICK_IMAGE
    contextState.prompt = ''
    contextState.selectedWorkflow = {
      publicNameKey: 'workflows.QUICK_IMAGE.name',
      descriptionKey: 'workflows.QUICK_IMAGE.description',
    }

    render(<StudioWorkflowSummary />)

    expect(screen.getByText('workflowEmptyHint')).toBeInTheDocument()
  })
})
