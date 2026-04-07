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
  useEffect,
  useReducer,
  useRef,
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

type OutputType = 'image' | 'video'
type WorkflowMode = 'quick' | 'card'

export interface StudioFormState {
  outputType: OutputType
  workflowMode: WorkflowMode
  selectedOptionId: string | null
  prompt: string
  aspectRatio: AspectRatio
  advancedParams: AdvancedParams
  tokenInput: string
  panels: Record<PanelName, boolean>
}

export type StudioAction =
  | { type: 'SET_OUTPUT_TYPE'; payload: OutputType }
  | { type: 'SET_WORKFLOW_MODE'; payload: WorkflowMode }
  | { type: 'SET_OPTION_ID'; payload: string | null }
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_ASPECT_RATIO'; payload: AspectRatio }
  | { type: 'SET_ADVANCED_PARAMS'; payload: AdvancedParams }
  | { type: 'RESET_ADVANCED_PARAMS' }
  | { type: 'SET_TOKEN_INPUT'; payload: string }
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
}

const initialFormState: StudioFormState = {
  outputType: 'image',
  workflowMode: 'quick',
  selectedOptionId: null,
  prompt: '',
  aspectRatio: '1:1',
  advancedParams: {},
  tokenInput: '',
  panels: { ...initialPanels },
}

export function studioFormReducer(
  state: StudioFormState,
  action: StudioAction,
): StudioFormState {
  switch (action.type) {
    case 'SET_OUTPUT_TYPE':
      return { ...state, outputType: action.payload }
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
        panels: { ...initialPanels },
      }
    default:
      return state
  }
}

interface StudioFormContextValue {
  state: StudioFormState
  dispatch: React.Dispatch<StudioAction>
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

const StudioGenContext = createContext<UseUnifiedGenerateReturn | null>(null)

// ═══════════════════════════════════════════════════════════════════
// COMBINED PROVIDER
// ═══════════════════════════════════════════════════════════════════

export function StudioProvider({ children }: { children: ReactNode }) {
  // HOT — form state
  const [formState, dispatch] = useReducer(studioFormReducer, initialFormState)
  const formValue = useMemo(() => ({ state: formState, dispatch }), [formState])

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
        <StudioGenContext.Provider value={generation}>
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
export function useStudioGen(): UseUnifiedGenerateReturn {
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
