'use client'

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  type ReactNode,
} from 'react'

import type { AdvancedParams } from '@/types'
import type { AspectRatio } from '@/constants/config'
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

// ─── Reducer State ───────────────────────────────────────────────

export type PanelName =
  | 'cardManagement'
  | 'projectHistory'
  | 'civitai'
  | 'enhance'
  | 'reverse'
  | 'advanced'
  | 'refImage'

type StudioMode = 'image' | 'video'

interface StudioState {
  mode: StudioMode
  prompt: string
  aspectRatio: AspectRatio
  advancedParams: AdvancedParams
  tokenInput: string
  panels: Record<PanelName, boolean>
}

// ─── Actions ─────────────────────────────────────────────────────

type StudioAction =
  | { type: 'SET_MODE'; payload: StudioMode }
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_ASPECT_RATIO'; payload: AspectRatio }
  | { type: 'SET_ADVANCED_PARAMS'; payload: AdvancedParams }
  | { type: 'SET_TOKEN_INPUT'; payload: string }
  | { type: 'TOGGLE_PANEL'; payload: PanelName }
  | { type: 'CLOSE_PANEL'; payload: PanelName }
  | { type: 'RESET_FORM' }

const initialPanels: Record<PanelName, boolean> = {
  cardManagement: false,
  projectHistory: false,
  civitai: false,
  enhance: false,
  reverse: false,
  advanced: false,
  refImage: false,
}

const initialState: StudioState = {
  mode: 'image',
  prompt: '',
  aspectRatio: '1:1',
  advancedParams: {},
  tokenInput: '',
  panels: { ...initialPanels },
}

function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload }
    case 'SET_PROMPT':
      return { ...state, prompt: action.payload }
    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.payload }
    case 'SET_ADVANCED_PARAMS':
      return { ...state, advancedParams: action.payload }
    case 'SET_TOKEN_INPUT':
      return { ...state, tokenInput: action.payload }
    case 'TOGGLE_PANEL':
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.payload]: !state.panels[action.payload],
        },
      }
    case 'CLOSE_PANEL':
      return {
        ...state,
        panels: { ...state.panels, [action.payload]: false },
      }
    case 'RESET_FORM':
      return {
        ...state,
        prompt: '',
        aspectRatio: '1:1',
        advancedParams: {},
        panels: { ...initialPanels },
      }
    default:
      return state
  }
}

// ─── Context Shape ───────────────────────────────────────────────

interface StudioContextValue {
  // Reducer state + dispatch
  state: StudioState
  dispatch: React.Dispatch<StudioAction>

  // Composed hooks
  characters: UseCharacterCardsReturn
  backgrounds: UseBackgroundCardsReturn
  styles: UseStyleCardsReturn
  generation: UseUnifiedGenerateReturn
  projects: ReturnType<typeof useProjects>
  imageUpload: ReturnType<typeof useImageUpload>
  promptEnhance: ReturnType<typeof usePromptEnhance>
  civitai: ReturnType<typeof useCivitaiToken>
  onboarding: ReturnType<typeof useOnboarding>
  usageSummary: ReturnType<typeof useUsageSummary>
}

const StudioContext = createContext<StudioContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────────

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(studioReducer, initialState)

  // Compose existing hooks
  const projects = useProjects()
  const characters = useCharacterCards()
  const backgrounds = useBackgroundCards(projects.activeProjectId)
  const styles = useStyleCards(projects.activeProjectId)
  const generation = useUnifiedGenerate()
  const imageUpload = useImageUpload()
  const promptEnhance = usePromptEnhance()
  const civitai = useCivitaiToken()
  const onboarding = useOnboarding()
  const usageSummary = useUsageSummary()

  const value = useMemo<StudioContextValue>(
    () => ({
      state,
      dispatch,
      characters,
      backgrounds,
      styles,
      generation,
      projects,
      imageUpload,
      promptEnhance,
      civitai,
      onboarding,
      usageSummary,
    }),
    [
      state,
      characters,
      backgrounds,
      styles,
      generation,
      projects,
      imageUpload,
      promptEnhance,
      civitai,
      onboarding,
      usageSummary,
    ],
  )

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  )
}

// ─── Consumer Hook ───────────────────────────────────────────────

export function useStudioContext(): StudioContextValue {
  const ctx = useContext(StudioContext)
  if (!ctx) {
    throw new Error('useStudioContext must be used within <StudioProvider>')
  }
  return ctx
}
