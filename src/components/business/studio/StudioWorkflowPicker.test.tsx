import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  WORKFLOWS,
  WORKFLOW_IDS,
  WORKFLOW_MEDIA_GROUPS,
} from '@/constants/workflows'

import { StudioWorkflowPicker } from './StudioWorkflowPicker'

const setSelectedWorkflowId = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioContext: () => ({
    selectedWorkflowId: WORKFLOW_IDS.QUICK_IMAGE,
    setSelectedWorkflowId,
  }),
}))

describe('StudioWorkflowPicker', () => {
  it('renders one card for each workflow in the current media group', () => {
    render(
      <StudioWorkflowPicker currentMediaGroup={WORKFLOW_MEDIA_GROUPS.IMAGE} />,
    )

    const expectedCount = WORKFLOWS.filter(
      (workflow) => workflow.mediaGroup === WORKFLOW_MEDIA_GROUPS.IMAGE,
    ).length

    expect(screen.getAllByRole('button')).toHaveLength(expectedCount)
  })

  it('clicking a workflow card calls setSelectedWorkflowId', () => {
    render(
      <StudioWorkflowPicker currentMediaGroup={WORKFLOW_MEDIA_GROUPS.VIDEO} />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /workflows.CINEMATIC_SHORT_VIDEO.name/,
      }),
    )

    expect(setSelectedWorkflowId).toHaveBeenCalledWith(
      WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    )
  })

  it('marks the active workflow card with aria-pressed and data-selected', () => {
    render(
      <StudioWorkflowPicker currentMediaGroup={WORKFLOW_MEDIA_GROUPS.IMAGE} />,
    )

    const activeCard = screen.getByTestId(
      `workflow-card-${WORKFLOW_IDS.QUICK_IMAGE}`,
    )

    expect(activeCard).toHaveAttribute('aria-pressed', 'true')
    expect(activeCard).toHaveAttribute('data-selected', 'true')
  })
})
