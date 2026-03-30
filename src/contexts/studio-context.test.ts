import { describe, it, expect } from 'vitest'

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
    mode: 'image',
    prompt: '',
    aspectRatio: '1:1',
    advancedParams: {},
    tokenInput: '',
    panels: {
      cardManagement: false,
      projectHistory: false,
      civitai: false,
      enhance: false,
      reverse: false,
      advanced: false,
      refImage: false,
    },
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('studioFormReducer', () => {
  // ── SET_MODE ──

  it('SET_MODE changes mode', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_MODE',
      payload: 'video',
    })
    expect(next.mode).toBe('video')
  })

  it('SET_MODE does not mutate other fields', () => {
    const state = makeInitialState({ prompt: 'hello' })
    const next = studioFormReducer(state, {
      type: 'SET_MODE',
      payload: 'video',
    })
    expect(next.prompt).toBe('hello')
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

  it('TOGGLE_PANEL does not affect other panels', () => {
    const state = makeInitialState()
    state.panels.enhance = true
    const next = studioFormReducer(state, {
      type: 'TOGGLE_PANEL',
      payload: 'advanced',
    })
    expect(next.panels.enhance).toBe(true)
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

  // ── RESET_FORM ──

  it('RESET_FORM resets prompt, aspectRatio, advancedParams, and panels', () => {
    const state = makeInitialState({
      prompt: 'something long',
      aspectRatio: '16:9',
      advancedParams: { guidanceScale: 12 },
    })
    state.panels.advanced = true
    state.panels.enhance = true

    const next = studioFormReducer(state, { type: 'RESET_FORM' })

    expect(next.prompt).toBe('')
    expect(next.aspectRatio).toBe('1:1')
    expect(next.advancedParams).toEqual({})
    // All panels should be closed
    const allPanelsClosed = Object.values(next.panels).every((v) => v === false)
    expect(allPanelsClosed).toBe(true)
  })

  it('RESET_FORM preserves mode', () => {
    const state = makeInitialState({ mode: 'video', prompt: 'test' })
    const next = studioFormReducer(state, { type: 'RESET_FORM' })
    expect(next.mode).toBe('video')
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
