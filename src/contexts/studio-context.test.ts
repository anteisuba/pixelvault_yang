import { describe, it, expect } from 'vitest'

import {
  DEFAULT_WORKFLOW_ID,
  getWorkflowStudioDefaults,
  WORKFLOW_IDS,
} from '@/constants/workflows'
import {
  studioFormReducer,
  type StudioFormState,
  type StudioAction,
  type PanelName,
} from '@/contexts/studio-context'

// ─── Helpers ─────────────────────────────────────────────────────

function makeInitialState(
  overrides?: Partial<StudioFormState>,
): StudioFormState {
  return {
    selectedWorkflowId: DEFAULT_WORKFLOW_ID,
    outputType: 'image',
    workflowMode: 'quick',
    selectedOptionId: null,
    prompt: '',
    aspectRatio: '1:1',
    advancedParams: {},
    tokenInput: '',
    voiceId: null,
    stylePresetId: '',
    videoDuration: 5,
    videoResolution: null,
    longVideoMode: false,
    longVideoTargetDuration: 30,
    panels: {
      cardManagement: false,
      projectHistory: false,
      modelSelector: false,
      civitai: false,
      enhance: false,
      reverse: false,
      advanced: false,
      refImage: false,
      layerDecompose: false,
      aspectRatio: false,
      voiceSelector: false,
      voiceTrainer: false,
      transform: false,
      videoParams: false,
      script: false,
    },
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('studioFormReducer', () => {
  // ── SET_SELECTED_WORKFLOW_ID ──

  it('SET_SELECTED_WORKFLOW_ID changes selectedWorkflowId', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    })
    expect(next.selectedWorkflowId).toBe(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO)
  })

  it('SET_SELECTED_WORKFLOW_ID syncs outputType from workflow defaults', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE,
    })
    expect(next.outputType).toBe('audio')
  })

  it('SET_SELECTED_WORKFLOW_ID syncs workflowMode from workflow defaults', () => {
    const state = makeInitialState()
    const workflowId = WORKFLOW_IDS.CHARACTER_CONSISTENCY_IMAGE
    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: workflowId,
    })

    expect(next.workflowMode).toBe(
      getWorkflowStudioDefaults(workflowId).workflowMode,
    )
  })

  it('SET_SELECTED_WORKFLOW_ID opens default panel without closing existing panels', () => {
    const state = makeInitialState()
    state.panels.advanced = true

    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    })

    expect(next.panels.videoParams).toBe(true)
    expect(next.panels.advanced).toBe(true)
  })

  // ── SET_OUTPUT_TYPE ──

  it('SET_OUTPUT_TYPE changes outputType', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_OUTPUT_TYPE',
      payload: 'video',
    })
    expect(next.outputType).toBe('video')
  })

  it('SET_OUTPUT_TYPE does not mutate other fields', () => {
    const state = makeInitialState({ prompt: 'hello' })
    const next = studioFormReducer(state, {
      type: 'SET_OUTPUT_TYPE',
      payload: 'video',
    })
    expect(next.prompt).toBe('hello')
  })

  // ── SET_WORKFLOW_MODE ──

  it('SET_WORKFLOW_MODE switches to card mode', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_WORKFLOW_MODE',
      payload: 'card',
    })
    expect(next.workflowMode).toBe('card')
  })

  it('SET_WORKFLOW_MODE switches back to quick mode', () => {
    const state = makeInitialState({ workflowMode: 'card' })
    const next = studioFormReducer(state, {
      type: 'SET_WORKFLOW_MODE',
      payload: 'quick',
    })
    expect(next.workflowMode).toBe('quick')
  })

  // ── SET_OPTION_ID ──

  it('SET_OPTION_ID sets selected model', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_OPTION_ID',
      payload: 'gemini-2.0-flash',
    })
    expect(next.selectedOptionId).toBe('gemini-2.0-flash')
  })

  it('SET_OPTION_ID clears selected model', () => {
    const state = makeInitialState({ selectedOptionId: 'some-model' })
    const next = studioFormReducer(state, {
      type: 'SET_OPTION_ID',
      payload: null,
    })
    expect(next.selectedOptionId).toBeNull()
  })

  // ── SET_PROMPT ──

  it('SET_PROMPT changes prompt', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_PROMPT',
      payload: 'a sunset over mountains',
    })
    expect(next.prompt).toBe('a sunset over mountains')
  })

  it('SET_PROMPT can set empty string', () => {
    const state = makeInitialState({ prompt: 'something' })
    const next = studioFormReducer(state, {
      type: 'SET_PROMPT',
      payload: '',
    })
    expect(next.prompt).toBe('')
  })

  // ── SET_ASPECT_RATIO ──

  it('SET_ASPECT_RATIO changes aspectRatio', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_ASPECT_RATIO',
      payload: '16:9',
    })
    expect(next.aspectRatio).toBe('16:9')
  })

  // ── SET_ADVANCED_PARAMS ──

  it('SET_ADVANCED_PARAMS changes advancedParams', () => {
    const state = makeInitialState()
    const params = { guidanceScale: 7.5, steps: 30, seed: 42 }
    const next = studioFormReducer(state, {
      type: 'SET_ADVANCED_PARAMS',
      payload: params,
    })
    expect(next.advancedParams).toEqual(params)
  })

  it('SET_ADVANCED_PARAMS replaces entire object', () => {
    const state = makeInitialState({
      advancedParams: { guidanceScale: 7.5, steps: 30 },
    })
    const next = studioFormReducer(state, {
      type: 'SET_ADVANCED_PARAMS',
      payload: { seed: 123 },
    })
    // Previous keys should be gone since it's a full replacement
    expect(next.advancedParams).toEqual({ seed: 123 })
  })

  // ── RESET_ADVANCED_PARAMS ──

  it('RESET_ADVANCED_PARAMS clears advancedParams to empty object', () => {
    const state = makeInitialState({
      advancedParams: { guidanceScale: 7.5, steps: 30 },
    })
    const next = studioFormReducer(state, { type: 'RESET_ADVANCED_PARAMS' })
    expect(next.advancedParams).toEqual({})
  })

  it('RESET_ADVANCED_PARAMS does not affect other fields', () => {
    const state = makeInitialState({
      prompt: 'keep me',
      advancedParams: { guidanceScale: 7.5 },
    })
    const next = studioFormReducer(state, { type: 'RESET_ADVANCED_PARAMS' })
    expect(next.prompt).toBe('keep me')
  })

  // ── SET_TOKEN_INPUT ──

  it('SET_TOKEN_INPUT changes tokenInput', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_TOKEN_INPUT',
      payload: 'abc123',
    })
    expect(next.tokenInput).toBe('abc123')
  })

  // ── TOGGLE_PANEL ──

  it('TOGGLE_PANEL opens a closed panel', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'TOGGLE_PANEL',
      payload: 'advanced',
    })
    expect(next.panels.advanced).toBe(true)
  })

  it('TOGGLE_PANEL closes an open panel', () => {
    const state = makeInitialState()
    state.panels.advanced = true
    const next = studioFormReducer(state, {
      type: 'TOGGLE_PANEL',
      payload: 'advanced',
    })
    expect(next.panels.advanced).toBe(false)
  })

  it('TOGGLE_PANEL does not affect non-toolbar panels', () => {
    const state = makeInitialState()
    state.panels.cardManagement = true
    const next = studioFormReducer(state, {
      type: 'TOGGLE_PANEL',
      payload: 'advanced',
    })
    // cardManagement is not a toolbar panel, so it stays open
    expect(next.panels.cardManagement).toBe(true)
    expect(next.panels.advanced).toBe(true)
  })

  it('TOGGLE_PANEL toolbar panels are mutually exclusive', () => {
    const state = makeInitialState()
    state.panels.enhance = true
    const next = studioFormReducer(state, {
      type: 'TOGGLE_PANEL',
      payload: 'advanced',
    })
    // Opening advanced should close enhance (both are toolbar panels)
    expect(next.panels.enhance).toBe(false)
    expect(next.panels.advanced).toBe(true)
  })

  // ── CLOSE_PANEL ──

  it('CLOSE_PANEL closes an open panel', () => {
    const state = makeInitialState()
    state.panels.civitai = true
    const next = studioFormReducer(state, {
      type: 'CLOSE_PANEL',
      payload: 'civitai',
    })
    expect(next.panels.civitai).toBe(false)
  })

  it('CLOSE_PANEL on already-closed panel is a no-op', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'CLOSE_PANEL',
      payload: 'civitai',
    })
    expect(next.panels.civitai).toBe(false)
  })

  // ── CLOSE_ALL_PANELS ──

  it('CLOSE_ALL_PANELS closes every open panel', () => {
    const state = makeInitialState()
    state.panels.advanced = true
    state.panels.enhance = true
    state.panels.cardManagement = true

    const next = studioFormReducer(state, {
      type: 'CLOSE_ALL_PANELS',
    })

    expect(Object.values(next.panels).every((value) => value === false)).toBe(
      true,
    )
  })

  it('CLOSE_ALL_PANELS preserves non-panel form state', () => {
    const state = makeInitialState({
      workflowMode: 'card',
      prompt: 'keep me',
      selectedOptionId: 'workspace:gemini',
    })
    state.panels.modelSelector = true

    const next = studioFormReducer(state, {
      type: 'CLOSE_ALL_PANELS',
    })

    expect(next.workflowMode).toBe('card')
    expect(next.prompt).toBe('keep me')
    expect(next.selectedOptionId).toBe('workspace:gemini')
  })

  // ── RESET_FORM ──

  it('RESET_FORM resets prompt, aspectRatio, advancedParams, selectedOptionId, and panels', () => {
    const state = makeInitialState({
      prompt: 'something long',
      aspectRatio: '16:9',
      advancedParams: { guidanceScale: 12 },
      selectedOptionId: 'some-model',
    })
    state.panels.advanced = true
    state.panels.enhance = true

    const next = studioFormReducer(state, { type: 'RESET_FORM' })

    expect(next.prompt).toBe('')
    expect(next.aspectRatio).toBe('1:1')
    expect(next.advancedParams).toEqual({})
    expect(next.selectedOptionId).toBeNull()
    // All panels should be closed
    const allPanelsClosed = Object.values(next.panels).every((v) => v === false)
    expect(allPanelsClosed).toBe(true)
  })

  it('RESET_FORM preserves outputType', () => {
    const state = makeInitialState({ outputType: 'video', prompt: 'test' })
    const next = studioFormReducer(state, { type: 'RESET_FORM' })
    expect(next.outputType).toBe('video')
  })

  it('RESET_FORM preserves workflowMode', () => {
    const state = makeInitialState({ workflowMode: 'card', prompt: 'test' })
    const next = studioFormReducer(state, { type: 'RESET_FORM' })
    expect(next.workflowMode).toBe('card')
  })

  it('RESET_FORM preserves tokenInput', () => {
    const state = makeInitialState({ tokenInput: 'mytoken' })
    const next = studioFormReducer(state, { type: 'RESET_FORM' })
    expect(next.tokenInput).toBe('mytoken')
  })

  // ── Unknown action ──

  it('unknown action returns same state', () => {
    const state = makeInitialState({ prompt: 'keep' })
    const next = studioFormReducer(state, {
      type: 'UNKNOWN_ACTION' as StudioAction['type'],
    } as StudioAction)
    expect(next).toBe(state)
  })

  // ── Immutability ──

  it('does not mutate original state', () => {
    const state = makeInitialState()
    const frozen = { ...state, panels: { ...state.panels } }
    studioFormReducer(state, { type: 'SET_PROMPT', payload: 'new' })
    expect(state.prompt).toBe(frozen.prompt)
  })

  // ── All panel names work with TOGGLE_PANEL ──

  it.each<PanelName>([
    'cardManagement',
    'projectHistory',
    'modelSelector',
    'civitai',
    'enhance',
    'reverse',
    'advanced',
    'refImage',
  ])('TOGGLE_PANEL works for panel "%s"', (panel) => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'TOGGLE_PANEL',
      payload: panel,
    })
    expect(next.panels[panel]).toBe(true)
  })
})
