import { screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WORKFLOWS,
  WORKFLOW_IDS,
  WORKFLOW_MEDIA_GROUPS,
} from '@/constants/workflows'
import { message } from '@/test/app-harness'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'

import { StudioWorkflowPicker } from './StudioWorkflowPicker'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

beforeEach(() => {
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

describe('StudioWorkflowPicker', () => {
  it('renders one card for each workflow in the current media group', () => {
    renderWithStudio(
      <StudioWorkflowPicker currentMediaGroup={WORKFLOW_MEDIA_GROUPS.IMAGE} />,
    )

    const expectedCount = WORKFLOWS.filter(
      (workflow) => workflow.mediaGroup === WORKFLOW_MEDIA_GROUPS.IMAGE,
    ).length

    expect(screen.getAllByRole('button')).toHaveLength(expectedCount)
  })

  it('clicking a workflow card selects it in the studio', () => {
    const { studio } = renderWithStudio(
      <StudioWorkflowPicker currentMediaGroup={WORKFLOW_MEDIA_GROUPS.VIDEO} />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(message('workflows.CINEMATIC_SHORT_VIDEO.name')),
      }),
    )

    expect(studio.current.selectedWorkflowId).toBe(
      WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    )
    expect(studio.current.state.outputType).toBe('video')
    expect(
      screen.getByTestId(`workflow-card-${WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO}`),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks the active workflow card with aria-pressed and data-selected', () => {
    renderWithStudio(
      <StudioWorkflowPicker currentMediaGroup={WORKFLOW_MEDIA_GROUPS.IMAGE} />,
    )

    const activeCard = screen.getByTestId(
      `workflow-card-${WORKFLOW_IDS.QUICK_IMAGE}`,
    )

    expect(activeCard).toHaveAttribute('aria-pressed', 'true')
    expect(activeCard).toHaveAttribute('data-selected', 'true')
  })
})
