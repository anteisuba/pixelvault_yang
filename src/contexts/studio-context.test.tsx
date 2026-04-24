import type { ReactNode } from 'react'

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_WORKFLOW_ID,
  getWorkflowById,
  WORKFLOW_IDS,
  type WorkflowId,
} from '@/constants/workflows'
import { StudioProvider, useStudioContext } from '@/contexts/studio-context'

vi.mock('@/hooks/use-character-cards', () => ({
  useCharacterCards: () => ({}),
}))

vi.mock('@/hooks/use-background-cards', () => ({
  useBackgroundCards: () => ({}),
}))

vi.mock('@/hooks/use-style-cards', () => ({
  useStyleCards: () => ({}),
}))

vi.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({ activeProjectId: null }),
}))

vi.mock('@/hooks/use-civitai-token', () => ({
  useCivitaiToken: () => ({}),
}))

vi.mock('@/hooks/use-prompt-enhance', () => ({
  usePromptEnhance: () => ({}),
}))

vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({}),
}))

vi.mock('@/hooks/use-unified-generate', () => ({
  useUnifiedGenerate: () => ({ lastGeneration: null }),
}))

vi.mock('@/hooks/use-onboarding', () => ({
  useOnboarding: () => ({}),
}))

vi.mock('@/hooks/use-usage-summary', () => ({
  useUsageSummary: () => ({ refresh: vi.fn() }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <StudioProvider>{children}</StudioProvider>
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
      result.current.setSelectedWorkflowId(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO)
    })

    expect(result.current.selectedWorkflowId).toBe(
      WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    )
    expect(result.current.state.outputType).toBe('video')
  })

  it('switches VOICE_NARRATION_DIALOGUE workflow to audio outputType', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.setSelectedWorkflowId(
        WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE,
      )
    })

    expect(result.current.selectedWorkflowId).toBe(
      WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE,
    )
    expect(result.current.state.outputType).toBe('audio')
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
      result.current.setSelectedWorkflowId(
        WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE,
      )
    })

    expect(result.current.state.outputType).toBe('audio')
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

  it('applies workflowMode defaults when switching workflow through the hook', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.setSelectedWorkflowId(
        WORKFLOW_IDS.CHARACTER_CONSISTENCY_IMAGE,
      )
    })

    expect(result.current.state.workflowMode).toBe('card')
  })

  it('opens default workflow panel when switching workflow through the hook', () => {
    const { result } = renderHook(() => useStudioContext(), { wrapper })

    act(() => {
      result.current.setSelectedWorkflowId(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO)
    })

    expect(result.current.state.panels.videoParams).toBe(true)
  })
})
