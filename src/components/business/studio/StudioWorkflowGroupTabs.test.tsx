import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WORKFLOWS,
  WORKFLOW_IDS,
  WORKFLOW_MEDIA_GROUPS,
} from '@/constants/workflows'

import { StudioWorkflowGroupTabs } from './StudioWorkflowGroupTabs'

const mockStudioContext = vi.hoisted(() => ({
  selectedWorkflow: {
    id: 'CINEMATIC_SHORT_VIDEO',
    mediaGroup: 'video',
  },
  setSelectedWorkflowId: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioContext: () => ({
    getSelectedWorkflow: () => mockStudioContext.selectedWorkflow,
    setSelectedWorkflowId: mockStudioContext.setSelectedWorkflowId,
  }),
}))

describe('StudioWorkflowGroupTabs', () => {
  beforeEach(() => {
    mockStudioContext.selectedWorkflow = {
      id: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
      mediaGroup: WORKFLOW_MEDIA_GROUPS.VIDEO,
    }
    mockStudioContext.setSelectedWorkflowId.mockClear()
  })

  it('renders three media group tabs', () => {
    render(<StudioWorkflowGroupTabs />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('defaults to the selected workflow media group', () => {
    render(
      <StudioWorkflowGroupTabs>
        {(currentMediaGroup) => (
          <div data-testid="current-group">{currentMediaGroup}</div>
        )}
      </StudioWorkflowGroupTabs>,
    )

    expect(screen.getByTestId('current-group')).toHaveTextContent(
      WORKFLOW_MEDIA_GROUPS.VIDEO,
    )
  })

  it('onValueChange triggers setSelectedWorkflowId with first workflow of group', () => {
    render(
      <StudioWorkflowGroupTabs>
        {(currentMediaGroup) => (
          <div data-testid="current-group">{currentMediaGroup}</div>
        )}
      </StudioWorkflowGroupTabs>,
    )

    fireEvent.click(screen.getByRole('tab', { name: /modeAudio/ }))

    expect(screen.getByTestId('current-group')).toHaveTextContent(
      WORKFLOW_MEDIA_GROUPS.AUDIO,
    )
    expect(mockStudioContext.setSelectedWorkflowId).toHaveBeenCalledWith(
      WORKFLOWS.find(
        (workflow) => workflow.mediaGroup === WORKFLOW_MEDIA_GROUPS.AUDIO,
      )?.id,
    )
  })

  it('does not reset when selectedWorkflowId already belongs to target group', () => {
    mockStudioContext.selectedWorkflow = {
      id: WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE,
      mediaGroup: WORKFLOW_MEDIA_GROUPS.AUDIO,
    }

    render(<StudioWorkflowGroupTabs />)

    fireEvent.click(screen.getByRole('tab', { name: /modeAudio/ }))

    expect(mockStudioContext.setSelectedWorkflowId).not.toHaveBeenCalled()
  })
})
