import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WORKFLOW_IDS } from '@/constants/workflows'
import type { StudioDraft } from '@/hooks/use-studio-draft'
import { message } from '@/test/app-harness'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'

import { StudioWorkflowSummary } from './StudioWorkflowSummary'

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

const EMPTY_HINT = () => message('StudioPage.workflowEmptyHint')

describe('StudioWorkflowSummary', () => {
  it('shows the selected workflow name and description', () => {
    const { studio } = renderWithStudio(<StudioWorkflowSummary />)
    act(() => {
      studio.current.setSelectedWorkflowId(WORKFLOW_IDS.QUICK_IMAGE)
      studio.current.dispatch({
        type: 'SET_PROMPT',
        payload: 'already started',
      })
    })

    expect(
      screen.getByText(message('workflows.QUICK_IMAGE.name')),
    ).toBeInTheDocument()
    expect(
      screen.getByText(message('workflows.QUICK_IMAGE.description')),
    ).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_HINT())).not.toBeInTheDocument()
  })

  it('shows the workflow empty hint when workflow is missing', () => {
    const { studio } = renderWithStudio(<StudioWorkflowSummary />)
    // 旧草稿里存着一个已经不在的工作流 id。
    act(() => {
      studio.current.dispatch({
        type: 'RESTORE_WORKSPACE_DRAFT',
        payload: {
          draft: {
            selectedWorkflowId: 'MISSING_WORKFLOW',
          } as unknown as StudioDraft,
          applyTransfer: false,
        },
      })
    })

    expect(screen.getByText(EMPTY_HINT())).toBeInTheDocument()
  })

  it('shows the workflow empty hint in the initial prompt state', () => {
    renderWithStudio(<StudioWorkflowSummary />)

    expect(
      screen.getByText(message('workflows.QUICK_IMAGE.name')),
    ).toBeInTheDocument()
    expect(screen.getByText(EMPTY_HINT())).toBeInTheDocument()
  })
})
