'use client'

/**
 * Studio Context — split into 3 providers by update frequency to prevent
 * unnecessary re-renders (per Eng Review finding).
 *
 * StudioFormContext  (HOT)  — prompt, aspectRatio, panels — changes on every keystroke
 * StudioDataContext  (WARM) — cards, projects, civitai, upload, enhance — changes on user actions
 * StudioGenContext   (COLD) — generation state — changes only during generation
 *
 * Usage: import { useStudioForm, useStudioData, useStudioGen } from '@/contexts/studio-context'
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type {
  AdvancedParams,
  GenerationEvaluation,
  GenerationPlanResponse,
} from '@/types'
import {
  DEFAULT_WORKFLOW_ID,
  getWorkflowById,
  getWorkflowStudioDefaults,
  type Workflow,
  type WorkflowId,
} from '@/constants/workflows'
import { NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import type { AspectRatio } from '@/constants/config'
import { VIDEO_GENERATION } from '@/constants/config'
import {
  DEFAULT_AUDIO_FORMAT,
  DEFAULT_AUDIO_LATENCY,
  DEFAULT_AUDIO_MP3_BITRATE,
  DEFAULT_AUDIO_OPUS_BITRATE,
  DEFAULT_AUDIO_SAMPLE_RATE,
  TTS_CHUNK_LENGTH_RANGE,
  TTS_REPETITION_PENALTY_RANGE,
  TTS_TEMPERATURE_RANGE,
  TTS_TOP_P_RANGE,
  TTS_VOLUME_RANGE,
  type AudioFormat,
  type AudioLatency,
} from '@/constants/audio-options'
import {
  AUDIO_DEFAULT_EMOTION,
  AUDIO_DEFAULT_PACE,
} from '@/constants/voice-cards'
import { useCharacterCards } from '@/hooks/use-character-cards'
import { useBackgroundCards } from '@/hooks/use-background-cards'
import { useStyleCards } from '@/hooks/use-style-cards'
import { useProjects } from '@/hooks/use-projects'
import { useCivitaiToken } from '@/hooks/use-civitai-token'
import { usePromptEnhance } from '@/hooks/use-prompt-enhance'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { useOnboarding } from '@/hooks/use-onboarding'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import type { UseCharacterCardsReturn } from '@/hooks/use-character-cards'
import type { UseBackgroundCardsReturn } from '@/hooks/use-background-cards'
import type { UseStyleCardsReturn } from '@/hooks/use-style-cards'
import type { UseUnifiedGenerateReturn } from '@/hooks/use-unified-generate'

// ═══════════════════════════════════════════════════════════════════
// 1. FORM CONTEXT (HOT — changes on every keystroke)
// ═══════════════════════════════════════════════════════════════════

export type PanelName =
  | 'cardManagement'
  | 'projectHistory'
  | 'modelSelector'
  | 'civitai'
  | 'enhance'
  | 'reverse'
  | 'advanced'
  | 'refImage'
  | 'layerDecompose'
  | 'aspectRatio'
  | 'voiceSelector'
  | 'voiceTrainer'
  | 'transform'
  | 'videoParams'
  | 'script'
  | 'keepChange'
  | 'planPreview'

type OutputType = 'image' | 'video' | 'audio'
type WorkflowMode = 'quick' | 'card'

export interface StudioFormState {
  selectedWorkflowId: WorkflowId
  outputType: OutputType
  workflowMode: WorkflowMode
  selectedOptionId: string | null
  prompt: string
  aspectRatio: AspectRatio
  advancedParams: AdvancedParams
  tokenInput: string
  /** Fish Audio voice model ID for TTS */
  voiceId: string | null
  /** Persisted VoiceCard ID for TTS */
  voiceCardId: string | null
  /** Audio-specific — user-facing emotion control */
  audioEmotion: string
  /** Audio-specific — user-facing pace control */
  audioPace: string
  /** Audio-specific — sentence pause marker IDs */
  audioPauseMarkers: string[]
  /** Audio-specific — word pronunciation overrides */
  pronunciationDictionary: Record<string, string>
  /** Audio-specific — prosody volume adjustment */
  audioVolume: number
  /** Audio-specific — Fish Audio loudness normalization */
  audioNormalizeLoudness: boolean
  /** Audio-specific — provider text normalization */
  audioNormalizeText: boolean
  /** Audio-specific — request timestamp alignment from Fish Audio */
  audioWithTimestamps: boolean
  /** Audio-specific — output format */
  audioFormat: AudioFormat
  /** Audio-specific — sample rate in Hz */
  audioSampleRate: number
  /** Audio-specific — MP3 bitrate in kbps */
  audioMp3Bitrate: number
  /** Audio-specific — Opus bitrate in bps */
  audioOpusBitrate: number
  /** Audio-specific — latency profile */
  audioLatency: AudioLatency
  /** Audio-specific — expressiveness */
  audioTemperature: number
  /** Audio-specific — nucleus sampling */
  audioTopP: number
  /** Audio-specific — provider chunk length */
  audioChunkLength: number
  /** Audio-specific — repetition penalty */
  audioRepetitionPenalty: number
  /** Audio-specific — ordered voice IDs for <|speaker:n|> dialogue tags */
  audioSpeakerVoiceIds: string[]
  /** Style preset ID (empty string = no preset) */
  stylePresetId: string
  /** Video-specific — duration in seconds per clip */
  videoDuration: number
  /** Video-specific — output resolution; null means provider default */
  videoResolution: string | null
  /** Video-specific — long-video pipeline on/off */
  longVideoMode: boolean
  /** Video-specific — total target duration when long-video is on */
  longVideoTargetDuration: number
  generateRequestId: number
  panels: Record<PanelName, boolean>
}

export type StudioAction =
  | {
      type: 'SET_SELECTED_WORKFLOW_ID'
      payload: WorkflowId
      openDefaultPanel?: boolean
    }
  | { type: 'SET_OUTPUT_TYPE'; payload: OutputType }
  | { type: 'SET_WORKFLOW_MODE'; payload: WorkflowMode }
  | { type: 'SET_OPTION_ID'; payload: string | null }
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_ASPECT_RATIO'; payload: AspectRatio }
  | { type: 'SET_ADVANCED_PARAMS'; payload: AdvancedParams }
  | { type: 'RESET_ADVANCED_PARAMS' }
  | { type: 'SET_TOKEN_INPUT'; payload: string }
  | { type: 'SET_VOICE_ID'; payload: string | null }
  | { type: 'SET_VOICE_CARD_ID'; payload: string | null }
  | { type: 'SET_AUDIO_EMOTION'; payload: string }
  | { type: 'SET_AUDIO_PACE'; payload: string }
  | { type: 'SET_AUDIO_PAUSE_MARKERS'; payload: string[] }
  | { type: 'SET_AUDIO_VOLUME'; payload: number }
  | { type: 'SET_AUDIO_NORMALIZE_LOUDNESS'; payload: boolean }
  | { type: 'SET_AUDIO_NORMALIZE_TEXT'; payload: boolean }
  | { type: 'SET_AUDIO_WITH_TIMESTAMPS'; payload: boolean }
  | { type: 'SET_AUDIO_FORMAT'; payload: AudioFormat }
  | { type: 'SET_AUDIO_SAMPLE_RATE'; payload: number }
  | { type: 'SET_AUDIO_MP3_BITRATE'; payload: number }
  | { type: 'SET_AUDIO_OPUS_BITRATE'; payload: number }
  | { type: 'SET_AUDIO_LATENCY'; payload: AudioLatency }
  | { type: 'SET_AUDIO_TEMPERATURE'; payload: number }
  | { type: 'SET_AUDIO_TOP_P'; payload: number }
  | { type: 'SET_AUDIO_CHUNK_LENGTH'; payload: number }
  | { type: 'SET_AUDIO_REPETITION_PENALTY'; payload: number }
  | { type: 'SET_AUDIO_SPEAKER_VOICE_IDS'; payload: string[] }
  | {
      type: 'SET_PRONUNCIATION_DICTIONARY'
      payload: Record<string, string>
    }
  | { type: 'SET_STYLE_PRESET'; payload: string }
  | { type: 'SET_VIDEO_DURATION'; payload: number }
  | { type: 'SET_VIDEO_RESOLUTION'; payload: string | null }
  | { type: 'SET_LONG_VIDEO_MODE'; payload: boolean }
  | { type: 'SET_LONG_VIDEO_TARGET_DURATION'; payload: number }
  | { type: 'REQUEST_GENERATE' }
  | { type: 'TOGGLE_PANEL'; payload: PanelName }
  | { type: 'OPEN_PANEL'; payload: PanelName }
  | { type: 'CLOSE_PANEL'; payload: PanelName }
  | { type: 'CLOSE_ALL_PANELS' }
  | { type: 'RESET_FORM' }

const initialPanels: Record<PanelName, boolean> = {
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
  keepChange: false,
  planPreview: false,
}

const initialWorkflowDefaults = getWorkflowStudioDefaults(DEFAULT_WORKFLOW_ID)

const initialFormState: StudioFormState = {
  selectedWorkflowId: DEFAULT_WORKFLOW_ID,
  outputType: initialWorkflowDefaults.outputType,
  workflowMode: initialWorkflowDefaults.workflowMode ?? 'quick',
  selectedOptionId: null,
  prompt: '',
  aspectRatio: '1:1',
  advancedParams: {},
  tokenInput: '',
  voiceId: null,
  voiceCardId: null,
  audioEmotion: AUDIO_DEFAULT_EMOTION,
  audioPace: AUDIO_DEFAULT_PACE,
  audioPauseMarkers: [],
  pronunciationDictionary: {},
  audioVolume: TTS_VOLUME_RANGE.default,
  audioNormalizeLoudness: true,
  audioNormalizeText: true,
  audioWithTimestamps: false,
  audioFormat: DEFAULT_AUDIO_FORMAT,
  audioSampleRate: DEFAULT_AUDIO_SAMPLE_RATE,
  audioMp3Bitrate: DEFAULT_AUDIO_MP3_BITRATE,
  audioOpusBitrate: DEFAULT_AUDIO_OPUS_BITRATE,
  audioLatency: DEFAULT_AUDIO_LATENCY,
  audioTemperature: TTS_TEMPERATURE_RANGE.default,
  audioTopP: TTS_TOP_P_RANGE.default,
  audioChunkLength: TTS_CHUNK_LENGTH_RANGE.default,
  audioRepetitionPenalty: TTS_REPETITION_PENALTY_RANGE.default,
  audioSpeakerVoiceIds: [],
  stylePresetId: NO_STYLE_PRESET_ID,
  videoDuration: VIDEO_GENERATION.DEFAULT_DURATION,
  videoResolution: null,
  longVideoMode: false,
  longVideoTargetDuration: VIDEO_GENERATION.LONG_VIDEO_DURATION_OPTIONS[1], // 30s
  generateRequestId: 0,
  panels: { ...initialPanels },
}

export function studioFormReducer(
  state: StudioFormState,
  action: StudioAction,
): StudioFormState {
  switch (action.type) {
    case 'SET_SELECTED_WORKFLOW_ID': {
      const defaults = getWorkflowStudioDefaults(action.payload)
      const isChangingMediaGroup = state.outputType !== defaults.outputType
      const panels =
        action.openDefaultPanel !== false && defaults.openPanel
          ? { ...state.panels, [defaults.openPanel]: true }
          : state.panels

      return {
        ...state,
        selectedWorkflowId: action.payload,
        outputType: defaults.outputType,
        workflowMode: defaults.workflowMode ?? state.workflowMode,
        prompt: isChangingMediaGroup ? '' : state.prompt,
        panels,
      }
    }
    case 'SET_OUTPUT_TYPE':
      return { ...state, outputType: action.payload }
    case 'SET_VOICE_ID':
      return { ...state, voiceId: action.payload }
    case 'SET_VOICE_CARD_ID':
      return { ...state, voiceCardId: action.payload }
    case 'SET_AUDIO_EMOTION':
      return { ...state, audioEmotion: action.payload }
    case 'SET_AUDIO_PACE':
      return { ...state, audioPace: action.payload }
    case 'SET_AUDIO_PAUSE_MARKERS':
      return { ...state, audioPauseMarkers: action.payload }
    case 'SET_AUDIO_VOLUME':
      return { ...state, audioVolume: action.payload }
    case 'SET_AUDIO_NORMALIZE_LOUDNESS':
      return { ...state, audioNormalizeLoudness: action.payload }
    case 'SET_AUDIO_NORMALIZE_TEXT':
      return { ...state, audioNormalizeText: action.payload }
    case 'SET_AUDIO_WITH_TIMESTAMPS':
      return { ...state, audioWithTimestamps: action.payload }
    case 'SET_AUDIO_FORMAT':
      return { ...state, audioFormat: action.payload }
    case 'SET_AUDIO_SAMPLE_RATE':
      return { ...state, audioSampleRate: action.payload }
    case 'SET_AUDIO_MP3_BITRATE':
      return { ...state, audioMp3Bitrate: action.payload }
    case 'SET_AUDIO_OPUS_BITRATE':
      return { ...state, audioOpusBitrate: action.payload }
    case 'SET_AUDIO_LATENCY':
      return { ...state, audioLatency: action.payload }
    case 'SET_AUDIO_TEMPERATURE':
      return { ...state, audioTemperature: action.payload }
    case 'SET_AUDIO_TOP_P':
      return { ...state, audioTopP: action.payload }
    case 'SET_AUDIO_CHUNK_LENGTH':
      return { ...state, audioChunkLength: action.payload }
    case 'SET_AUDIO_REPETITION_PENALTY':
      return { ...state, audioRepetitionPenalty: action.payload }
    case 'SET_AUDIO_SPEAKER_VOICE_IDS':
      return { ...state, audioSpeakerVoiceIds: action.payload }
    case 'SET_PRONUNCIATION_DICTIONARY':
      return { ...state, pronunciationDictionary: action.payload }
    case 'SET_STYLE_PRESET':
      return { ...state, stylePresetId: action.payload }
    case 'SET_WORKFLOW_MODE':
      return { ...state, workflowMode: action.payload }
    case 'SET_OPTION_ID':
      return { ...state, selectedOptionId: action.payload }
    case 'SET_PROMPT':
      return { ...state, prompt: action.payload }
    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.payload }
    case 'SET_ADVANCED_PARAMS':
      return { ...state, advancedParams: action.payload }
    case 'RESET_ADVANCED_PARAMS':
      return { ...state, advancedParams: {} }
    case 'SET_TOKEN_INPUT':
      return { ...state, tokenInput: action.payload }
    case 'SET_VIDEO_DURATION':
      return { ...state, videoDuration: action.payload }
    case 'SET_VIDEO_RESOLUTION':
      return { ...state, videoResolution: action.payload }
    case 'SET_LONG_VIDEO_MODE':
      return { ...state, longVideoMode: action.payload }
    case 'SET_LONG_VIDEO_TARGET_DURATION':
      return { ...state, longVideoTargetDuration: action.payload }
    case 'REQUEST_GENERATE':
      return { ...state, generateRequestId: state.generateRequestId + 1 }
    case 'TOGGLE_PANEL': {
      const target = action.payload
      const isOpening = !state.panels[target]
      // Toolbar panels are mutually exclusive — opening one closes the others
      const toolbarPanels: PanelName[] = [
        'enhance',
        'reverse',
        'advanced',
        'refImage',
        'layerDecompose',
        'civitai',
        'aspectRatio',
        'transform',
        'script',
      ]
      const isToolbarPanel = toolbarPanels.includes(target)
      const newPanels = { ...state.panels }
      if (isOpening && isToolbarPanel) {
        for (const p of toolbarPanels) {
          if (p !== target) newPanels[p] = false
        }
      }
      newPanels[target] = isOpening
      return { ...state, panels: newPanels }
    }
    case 'OPEN_PANEL':
      return {
        ...state,
        panels: { ...state.panels, [action.payload]: true },
      }
    case 'CLOSE_PANEL':
      return {
        ...state,
        panels: { ...state.panels, [action.payload]: false },
      }
    case 'CLOSE_ALL_PANELS':
      return {
        ...state,
        panels: { ...initialPanels },
      }
    case 'RESET_FORM':
      return {
        ...state,
        prompt: '',
        aspectRatio: '1:1',
        advancedParams: {},
        selectedOptionId: null,
        voiceId: null,
        voiceCardId: null,
        audioEmotion: AUDIO_DEFAULT_EMOTION,
        audioPace: AUDIO_DEFAULT_PACE,
        audioPauseMarkers: [],
        pronunciationDictionary: {},
        audioVolume: TTS_VOLUME_RANGE.default,
        audioNormalizeLoudness: true,
        audioNormalizeText: true,
        audioWithTimestamps: false,
        audioFormat: DEFAULT_AUDIO_FORMAT,
        audioSampleRate: DEFAULT_AUDIO_SAMPLE_RATE,
        audioMp3Bitrate: DEFAULT_AUDIO_MP3_BITRATE,
        audioOpusBitrate: DEFAULT_AUDIO_OPUS_BITRATE,
        audioLatency: DEFAULT_AUDIO_LATENCY,
        audioTemperature: TTS_TEMPERATURE_RANGE.default,
        audioTopP: TTS_TOP_P_RANGE.default,
        audioChunkLength: TTS_CHUNK_LENGTH_RANGE.default,
        audioRepetitionPenalty: TTS_REPETITION_PENALTY_RANGE.default,
        audioSpeakerVoiceIds: [],
        stylePresetId: NO_STYLE_PRESET_ID,
        videoDuration: VIDEO_GENERATION.DEFAULT_DURATION,
        videoResolution: null,
        longVideoMode: false,
        longVideoTargetDuration:
          VIDEO_GENERATION.LONG_VIDEO_DURATION_OPTIONS[1],
        generateRequestId: 0,
        panels: { ...initialPanels },
      }
    default:
      return state
  }
}

interface StudioFormContextValue {
  state: StudioFormState
  dispatch: React.Dispatch<StudioAction>
  selectedWorkflowId: WorkflowId
  setSelectedWorkflowId: (workflowId: WorkflowId) => void
  getSelectedWorkflow: () => Workflow | undefined
}

const StudioFormContext = createContext<StudioFormContextValue | null>(null)

// ═══════════════════════════════════════════════════════════════════
// 2. DATA CONTEXT (WARM — changes on user card/project actions)
// ═══════════════════════════════════════════════════════════════════

interface StudioDataContextValue {
  characters: UseCharacterCardsReturn
  backgrounds: UseBackgroundCardsReturn
  styles: UseStyleCardsReturn
  projects: ReturnType<typeof useProjects>
  imageUpload: ReturnType<typeof useImageUpload>
  promptEnhance: ReturnType<typeof usePromptEnhance>
  civitai: ReturnType<typeof useCivitaiToken>
  onboarding: ReturnType<typeof useOnboarding>
  usageSummary: ReturnType<typeof useUsageSummary>
}

const StudioDataContext = createContext<StudioDataContextValue | null>(null)

// ═══════════════════════════════════════════════════════════════════
// 3. GENERATION CONTEXT (COLD — changes only during generation)
// ═══════════════════════════════════════════════════════════════════

interface StudioGenContextValue extends UseUnifiedGenerateReturn {
  currentPlan: GenerationPlanResponse | null
  lastEvaluation: GenerationEvaluation | null
  setCurrentPlan: (plan: GenerationPlanResponse | null) => void
  setLastEvaluation: (evaluation: GenerationEvaluation | null) => void
}

const StudioGenContext = createContext<StudioGenContextValue | null>(null)

// ═══════════════════════════════════════════════════════════════════
// COMBINED PROVIDER
// ═══════════════════════════════════════════════════════════════════

export function StudioProvider({ children }: { children: ReactNode }) {
  // HOT — form state
  const [formState, dispatch] = useReducer(studioFormReducer, initialFormState)
  const setSelectedWorkflowId = useCallback((workflowId: WorkflowId) => {
    dispatch({ type: 'SET_SELECTED_WORKFLOW_ID', payload: workflowId })
  }, [])
  const getSelectedWorkflow = useCallback(
    () => getWorkflowById(formState.selectedWorkflowId),
    [formState.selectedWorkflowId],
  )
  const formValue = useMemo(
    () => ({
      state: formState,
      dispatch,
      selectedWorkflowId: formState.selectedWorkflowId,
      setSelectedWorkflowId,
      getSelectedWorkflow,
    }),
    [formState, getSelectedWorkflow, setSelectedWorkflowId],
  )

  // WARM — data hooks
  const projects = useProjects()
  const characters = useCharacterCards()
  const backgrounds = useBackgroundCards(projects.activeProjectId)
  const styles = useStyleCards(projects.activeProjectId)
  const imageUpload = useImageUpload()
  const promptEnhance = usePromptEnhance()
  const civitai = useCivitaiToken()
  const onboarding = useOnboarding()
  const usageSummary = useUsageSummary()

  const dataValue = useMemo<StudioDataContextValue>(
    () => ({
      characters,
      backgrounds,
      styles,
      projects,
      imageUpload,
      promptEnhance,
      civitai,
      onboarding,
      usageSummary,
    }),
    [
      characters,
      backgrounds,
      styles,
      projects,
      imageUpload,
      promptEnhance,
      civitai,
      onboarding,
      usageSummary,
    ],
  )

  // COLD — generation
  const generation = useUnifiedGenerate()
  const [currentPlan, setCurrentPlan] = useState<GenerationPlanResponse | null>(
    null,
  )
  const [lastEvaluation, setLastEvaluation] =
    useState<GenerationEvaluation | null>(null)
  const generationValue = useMemo<StudioGenContextValue>(
    () => ({
      ...generation,
      currentPlan,
      lastEvaluation,
      setCurrentPlan,
      setLastEvaluation,
    }),
    [generation, currentPlan, lastEvaluation],
  )

  // Refresh usage summary when a generation completes
  const prevGenerationRef = useRef(generation.lastGeneration)
  useEffect(() => {
    if (
      generation.lastGeneration &&
      generation.lastGeneration !== prevGenerationRef.current
    ) {
      prevGenerationRef.current = generation.lastGeneration
      usageSummary.refresh()
    }
  }, [generation.lastGeneration, usageSummary])

  return (
    <StudioFormContext.Provider value={formValue}>
      <StudioDataContext.Provider value={dataValue}>
        <StudioGenContext.Provider value={generationValue}>
          {children}
        </StudioGenContext.Provider>
      </StudioDataContext.Provider>
    </StudioFormContext.Provider>
  )
}

// ═══════════════════════════════════════════════════════════════════
// CONSUMER HOOKS — each component only subscribes to what it needs
// ═══════════════════════════════════════════════════════════════════

/** Form state (prompt, mode, panels, aspect ratio) — re-renders on keystrokes */
export function useStudioForm(): StudioFormContextValue {
  const ctx = useContext(StudioFormContext)
  if (!ctx) {
    throw new Error('useStudioForm must be used within <StudioProvider>')
  }
  return ctx
}

/** Data state (cards, projects, upload, enhance, civitai) — re-renders on CRUD actions */
export function useStudioData(): StudioDataContextValue {
  const ctx = useContext(StudioDataContext)
  if (!ctx) {
    throw new Error('useStudioData must be used within <StudioProvider>')
  }
  return ctx
}

/** Generation state — re-renders only during generation */
export function useStudioGen(): StudioGenContextValue {
  const ctx = useContext(StudioGenContext)
  if (!ctx) {
    throw new Error('useStudioGen must be used within <StudioProvider>')
  }
  return ctx
}

/** Convenience: get all 3 contexts at once (use sparingly — causes re-renders from all 3) */
export function useStudioContext() {
  return {
    ...useStudioForm(),
    ...useStudioData(),
    generation: useStudioGen(),
  }
}
