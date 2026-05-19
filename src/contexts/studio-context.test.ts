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
    recipeUsage: null,
    aspectRatio: '1:1',
    advancedParams: {},
    tokenInput: '',
    voiceId: null,
    voiceCardId: null,
    audioEmotion: 'none',
    audioPace: 'normal',
    audioPauseMarkers: [],
    pronunciationDictionary: {},
    audioVolume: 0,
    audioNormalizeLoudness: true,
    audioNormalizeText: true,
    audioWithTimestamps: false,
    audioFormat: 'mp3',
    audioSampleRate: 44100,
    audioMp3Bitrate: 128,
    audioOpusBitrate: 32000,
    audioLatency: 'normal',
    audioTemperature: 0.7,
    audioTopP: 0.7,
    audioChunkLength: 300,
    audioRepetitionPenalty: 1.2,
    audioSpeakerVoiceIds: [],
    audioReferenceUrl: null,
    audioReferenceFileName: null,
    audioReferenceText: '',
    stylePresetId: '',
    videoDuration: 5,
    videoResolution: null,
    longVideoMode: false,
    longVideoTargetDuration: 30,
    generateRequestId: 0,
    panels: {
      cardManagement: false,
      projectHistory: false,
      modelSelector: false,
      civitai: false,
      cardSelector: false,
      enhance: false,
      reverse: false,
      advanced: false,
      refImage: false,
      layerDecompose: false,
      aspectRatio: false,
      voiceSelector: false,
      voiceTrainer: false,
      audioTranscribe: false,
      transform: false,
      videoParams: false,
      script: false,
      keepChange: false,
      planPreview: false,
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

  it('SET_SELECTED_WORKFLOW_ID can suppress the default panel for route sync', () => {
    const state = makeInitialState()

    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
      openDefaultPanel: false,
    })

    expect(next.outputType).toBe('video')
    expect(next.panels.videoParams).toBe(false)
  })

  it('SET_SELECTED_WORKFLOW_ID keeps prompt when staying in the same media group', () => {
    const state = makeInitialState({ prompt: 'keep this image prompt' })

    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: WORKFLOW_IDS.ANIME_ILLUSTRATION,
    })

    expect(next.outputType).toBe('image')
    expect(next.prompt).toBe('keep this image prompt')
  })

  it('SET_SELECTED_WORKFLOW_ID clears prompt when switching media group', () => {
    const state = makeInitialState({ prompt: 'old image prompt' })

    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    })

    expect(next.outputType).toBe('video')
    expect(next.prompt).toBe('')
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

  it('SET_RECIPE_USAGE stores prompt template lineage', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_RECIPE_USAGE',
      payload: {
        recipeId: 'recipe_abc',
        recipeVersion: 2,
        useMode: 'apply',
      },
    })

    expect(next.recipeUsage).toEqual({
      recipeId: 'recipe_abc',
      recipeVersion: 2,
      useMode: 'apply',
    })
  })

  it('SET_SELECTED_WORKFLOW_ID clears recipe lineage when switching media group', () => {
    const state = makeInitialState({
      recipeUsage: {
        recipeId: 'recipe_abc',
        useMode: 'apply',
      },
    })
    const next = studioFormReducer(state, {
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
    })

    expect(next.recipeUsage).toBeNull()
  })

  it('REQUEST_GENERATE increments generateRequestId', () => {
    const state = makeInitialState({ generateRequestId: 2 })
    const next = studioFormReducer(state, { type: 'REQUEST_GENERATE' })

    expect(next.generateRequestId).toBe(3)
  })

  it('updates audio-specific form state', () => {
    const state = makeInitialState()
    const withEmotion = studioFormReducer(state, {
      type: 'SET_AUDIO_EMOTION',
      payload: 'narration',
    })
    const withPace = studioFormReducer(withEmotion, {
      type: 'SET_AUDIO_PACE',
      payload: 'fast',
    })
    const withVoiceCard = studioFormReducer(withPace, {
      type: 'SET_VOICE_CARD_ID',
      payload: 'voice-card-1',
    })
    const withPauseMarkers = studioFormReducer(withVoiceCard, {
      type: 'SET_AUDIO_PAUSE_MARKERS',
      payload: ['after_sentence_1'],
    })
    const withDictionary = studioFormReducer(withPauseMarkers, {
      type: 'SET_PRONUNCIATION_DICTIONARY',
      payload: { Codex: 'koh-decks' },
    })
    const audioActions = [
      { type: 'SET_AUDIO_VOLUME' as const, payload: 2 },
      { type: 'SET_AUDIO_NORMALIZE_LOUDNESS' as const, payload: false },
      { type: 'SET_AUDIO_NORMALIZE_TEXT' as const, payload: false },
      { type: 'SET_AUDIO_WITH_TIMESTAMPS' as const, payload: true },
      { type: 'SET_AUDIO_FORMAT' as const, payload: 'opus' },
      { type: 'SET_AUDIO_SAMPLE_RATE' as const, payload: 48000 },
      { type: 'SET_AUDIO_MP3_BITRATE' as const, payload: 192 },
      { type: 'SET_AUDIO_OPUS_BITRATE' as const, payload: 64000 },
      { type: 'SET_AUDIO_LATENCY' as const, payload: 'balanced' },
      { type: 'SET_AUDIO_TEMPERATURE' as const, payload: 0.8 },
      { type: 'SET_AUDIO_TOP_P' as const, payload: 0.75 },
      { type: 'SET_AUDIO_CHUNK_LENGTH' as const, payload: 120 },
      { type: 'SET_AUDIO_REPETITION_PENALTY' as const, payload: 1.25 },
      {
        type: 'SET_AUDIO_SPEAKER_VOICE_IDS' as const,
        payload: ['voice-a', 'voice-b'],
      },
    ] satisfies StudioAction[]

    const withAdvancedAudio = audioActions.reduce(
      (currentState, action) => studioFormReducer(currentState, action),
      withDictionary,
    )

    expect(withAdvancedAudio.audioEmotion).toBe('narration')
    expect(withAdvancedAudio.audioPace).toBe('fast')
    expect(withAdvancedAudio.voiceCardId).toBe('voice-card-1')
    expect(withAdvancedAudio.audioPauseMarkers).toEqual(['after_sentence_1'])
    expect(withAdvancedAudio.pronunciationDictionary).toEqual({
      Codex: 'koh-decks',
    })
    expect(withAdvancedAudio).toMatchObject({
      audioVolume: 2,
      audioNormalizeLoudness: false,
      audioNormalizeText: false,
      audioWithTimestamps: true,
      audioFormat: 'opus',
      audioSampleRate: 48000,
      audioMp3Bitrate: 192,
      audioOpusBitrate: 64000,
      audioLatency: 'balanced',
      audioTemperature: 0.8,
      audioTopP: 0.75,
      audioChunkLength: 120,
      audioRepetitionPenalty: 1.25,
      audioSpeakerVoiceIds: ['voice-a', 'voice-b'],
    })
  })

  // ── SET_AUDIO_SPEAKER_VOICE_IDS normalization ──

  it('SET_AUDIO_SPEAKER_VOICE_IDS trims, drops empties, and de-duplicates', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_AUDIO_SPEAKER_VOICE_IDS',
      payload: ['  voice-a ', '', 'voice-b', 'voice-a', '   '],
    })
    expect(next.audioSpeakerVoiceIds).toEqual(['voice-a', 'voice-b'])
  })

  it('SET_AUDIO_SPEAKER_VOICE_IDS caps the payload at the speaker limit', () => {
    const state = makeInitialState()
    const oversized = Array.from({ length: 12 }, (_, index) => `voice-${index}`)
    const next = studioFormReducer(state, {
      type: 'SET_AUDIO_SPEAKER_VOICE_IDS',
      payload: oversized,
    })
    expect(next.audioSpeakerVoiceIds).toHaveLength(8)
    expect(next.audioSpeakerVoiceIds).toEqual(oversized.slice(0, 8))
  })

  // ── SET_AUDIO_REFERENCE_UPLOAD / SET_AUDIO_REFERENCE_TEXT ──

  it('SET_AUDIO_REFERENCE_UPLOAD stores url and fileName', () => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'SET_AUDIO_REFERENCE_UPLOAD',
      payload: { url: 'https://cdn.example.com/r.mp3', fileName: 'voice.mp3' },
    })
    expect(next.audioReferenceUrl).toBe('https://cdn.example.com/r.mp3')
    expect(next.audioReferenceFileName).toBe('voice.mp3')
  })

  it('SET_AUDIO_REFERENCE_UPLOAD with null clears url, fileName, and text', () => {
    const state = makeInitialState({
      audioReferenceUrl: 'https://cdn.example.com/r.mp3',
      audioReferenceFileName: 'voice.mp3',
      audioReferenceText: 'hello world',
    })
    const next = studioFormReducer(state, {
      type: 'SET_AUDIO_REFERENCE_UPLOAD',
      payload: null,
    })
    expect(next.audioReferenceUrl).toBeNull()
    expect(next.audioReferenceFileName).toBeNull()
    expect(next.audioReferenceText).toBe('')
  })

  it('SET_AUDIO_REFERENCE_TEXT updates only the transcript field', () => {
    const state = makeInitialState({
      audioReferenceUrl: 'https://cdn.example.com/r.mp3',
      audioReferenceFileName: 'voice.mp3',
    })
    const next = studioFormReducer(state, {
      type: 'SET_AUDIO_REFERENCE_TEXT',
      payload: 'Hello world.',
    })
    expect(next.audioReferenceText).toBe('Hello world.')
    expect(next.audioReferenceUrl).toBe('https://cdn.example.com/r.mp3')
    expect(next.audioReferenceFileName).toBe('voice.mp3')
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
    'cardSelector',
    'enhance',
    'reverse',
    'advanced',
    'refImage',
    'keepChange',
    'planPreview',
  ])('TOGGLE_PANEL works for panel "%s"', (panel) => {
    const state = makeInitialState()
    const next = studioFormReducer(state, {
      type: 'TOGGLE_PANEL',
      payload: panel,
    })
    expect(next.panels[panel]).toBe(true)
  })
})
