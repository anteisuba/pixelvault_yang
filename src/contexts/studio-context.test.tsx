import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_WORKFLOW_ID,
  getWorkflowById,
  WORKFLOW_IDS,
  type WorkflowId,
} from '@/constants/workflows'
import { StudioProvider, useStudioContext } from '@/contexts/studio-context'
import type { GenerationEvaluation } from '@/types'
import { AppProviders } from '@/test/app-harness'
import { fakeStudioServer } from '@/test/studio-harness'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/studio/image' }))

const MOCK_EVALUATION: GenerationEvaluation = {
  subjectMatch: 8,
  styleMatch: 7,
  compositionMatch: 8,
  promptAdherence: 8,
  artifactScore: 9,
  overall: 8,
  detectedIssues: [],
  suggestedFixes: [],
}

// 真工作台里的 hook（角色卡、项目、上传、出图…）全是真的，只假网络：挂载时拉的几条接口回空。
beforeEach(() => {
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <StudioProvider>{children}</StudioProvider>
    </AppProviders>
  )
}

describe('StudioProvider workflow selection', () => {
  it('defaults selectedWorkflowId to DEFAULT_WORKFLOW_ID', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    const selectedWorkflowId: WorkflowId = result.current.selectedWorkflowId

    expect(selectedWorkflowId).toBe(DEFAULT_WORKFLOW_ID)
    expect(result.current.state.selectedWorkflowId).toBe(DEFAULT_WORKFLOW_ID)
  })

  it('switches CINEMATIC_SHORT_VIDEO workflow to video outputType', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.dispatch({
        type: 'SET_PROMPT',
        payload: 'Make a quiet image',
      })
    })

    act(() => {
      result.current.setSelectedWorkflowId(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO)
    })

    expect(result.current.selectedWorkflowId).toBe(
      WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    )
    expect(result.current.state.outputType).toBe('video')
    expect(result.current.state.prompt).toBe('')
  })

  it('keeps manual SET_OUTPUT_TYPE effective until the next workflow switch', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.setSelectedWorkflowId(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO)
    })
    act(() => {
      result.current.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'image' })
    })

    expect(result.current.selectedWorkflowId).toBe(
      WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    )
    expect(result.current.state.outputType).toBe('image')

    act(() => {
      result.current.setSelectedWorkflowId(WORKFLOW_IDS.CHARACTER_TO_VIDEO)
    })

    expect(result.current.state.outputType).toBe('video')
  })

  it('getSelectedWorkflow returns the current Workflow object', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.setSelectedWorkflowId(WORKFLOW_IDS.CHARACTER_TO_VIDEO)
    })

    expect(result.current.getSelectedWorkflow()).toEqual(
      getWorkflowById(WORKFLOW_IDS.CHARACTER_TO_VIDEO),
    )
  })

  it('opens default workflow panel when switching workflow through the hook', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.setSelectedWorkflowId(WORKFLOW_IDS.CHARACTER_TO_VIDEO)
    })

    expect(result.current.state.panels.refImage).toBe(true)
  })

  it('setLastEvaluation updates evaluation state', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.generation.setLastEvaluation(MOCK_EVALUATION)
    })

    expect(result.current.generation.lastEvaluation).toEqual(MOCK_EVALUATION)
  })
})

describe('StudioProvider panel state', () => {
  it('opens toolbar panels exclusively through OPEN_PANEL', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.dispatch({ type: 'OPEN_PANEL', payload: 'reverse' })
    })

    expect(result.current.state.panels.reverse).toBe(true)

    act(() => {
      result.current.dispatch({ type: 'OPEN_PANEL', payload: 'stylePreset' })
    })

    expect(result.current.state.panels.reverse).toBe(false)
    expect(result.current.state.panels.stylePreset).toBe(true)

    act(() => {
      result.current.dispatch({ type: 'OPEN_PANEL', payload: 'loraSelector' })
    })

    expect(result.current.state.panels.stylePreset).toBe(false)
    expect(result.current.state.panels.loraSelector).toBe(true)
  })

  it('keeps non-toolbar panels independent through OPEN_PANEL', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.dispatch({ type: 'OPEN_PANEL', payload: 'modelSelector' })
    })
    act(() => {
      result.current.dispatch({ type: 'OPEN_PANEL', payload: 'projectHistory' })
    })

    expect(result.current.state.panels.modelSelector).toBe(true)
    expect(result.current.state.panels.projectHistory).toBe(true)
  })
})
