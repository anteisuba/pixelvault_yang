import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WORKFLOW_MEDIA_GROUPS } from '@/constants/workflows'

import { StudioWorkflowGroupTabs } from './StudioWorkflowGroupTabs'

const setSelectedWorkflowId = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioContext: () => ({
    getSelectedWorkflow: () => ({
      mediaGroup: WORKFLOW_MEDIA_GROUPS.VIDEO,
    }),
    setSelectedWorkflowId,
  }),
}))

describe('StudioWorkflowGroupTabs', () => {
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

  it('switching tab only changes local expanded group', () => {
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
    expect(setSelectedWorkflowId).not.toHaveBeenCalled()
  })
})
