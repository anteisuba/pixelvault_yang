import type { ComponentProps, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import { WORKFLOW_IDS, type WorkflowId } from '@/constants/workflows'
import type { StudioFormState } from '@/contexts/studio-context'
import type { VoiceCardRecord } from '@/types'

import { StudioPromptArea } from './StudioPromptArea'

const mockDispatch = vi.hoisted(() => vi.fn())
const mockGenerate = vi.hoisted(() => vi.fn())
const mockSetCurrentPlan = vi.hoisted(() => vi.fn())
const mockUseStudioForm = vi.hoisted(() => vi.fn())
const mockUseImageModelOptions = vi.hoisted(() => vi.fn())
const mockUseAudioModelOptions = vi.hoisted(() => vi.fn())
const mockUseVoiceCards = vi.hoisted(() => vi.fn())
const mockFetchGenerationPlanAPI = vi.hoisted(() => vi.fn())
import { SAMPLE_PROMPT_STORAGE_KEY } from '@/constants/sample-prompts'
const SAMPLE_PROMPT_FLAG_KEY = SAMPLE_PROMPT_STORAGE_KEY

const EMPTY_PANELS: StudioFormState['panels'] = {
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: vi.fn(),
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: mockUseStudioForm,
  useStudioData: () => ({
    styles: {
      activeCard: null,
      activeCardId: null,
    },
    characters: {
      activeCardIds: [],
      activeCards: [],
    },
    backgrounds: {
      activeCardId: null,
    },
    imageUpload: {
      referenceImages: [],
    },
    projects: {
      activeProjectId: null,
    },
  }),
  useStudioGen: () => ({
    isGenerating: false,
    generate: mockGenerate,
    elapsedSeconds: 0,
    currentPlan: null,
    setCurrentPlan: mockSetCurrentPlan,
  }),
}))

vi.mock('@/hooks/use-studio-shortcuts', () => ({
  useStudioShortcuts: vi.fn(),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: mockUseImageModelOptions,
}))

vi.mock('@/lib/api-client/generation', () => ({
  fetchGenerationPlanAPI: mockFetchGenerationPlanAPI,
}))

vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: mockUseAudioModelOptions,
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => {
    const selectedModel = {
      optionId: 'video-option',
      modelId: 'fal-video-model',
      keyId: 'api-key-1',
      keyLabel: 'FAL video',
      adapterType: 'fal',
      providerConfig: {
        label: 'fal.ai',
        baseUrl: 'https://fal.ai',
      },
      sourceType: 'saved',
      requestCount: 2,
    }

    return {
      selectedModel,
      modelOptions: [selectedModel],
    }
  },
}))

vi.mock('@/hooks/use-voice-cards', () => ({
  useVoiceCards: mockUseVoiceCards,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: () => ({
    healthMap: {},
  }),
}))

vi.mock('@/components/business/ApiKeyHealthDot', () => ({
  ApiKeyHealthDot: () => <span data-testid="api-key-health-dot" />,
}))

vi.mock('@/components/business/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}))

vi.mock('@/components/business/studio/QuickSetupDialog', () => ({
  QuickSetupDialog: () => null,
}))

vi.mock('@/components/ui/prompt-input', () => ({
  PromptInput: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputTextarea: (props: ComponentProps<'textarea'>) => (
    <textarea {...props} />
  ),
  PromptInputActions: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

function setupStudioForm(
  workflowId: WorkflowId,
  overrides: Partial<StudioFormState> = {},
) {
  const state: StudioFormState = {
    selectedWorkflowId: workflowId,
    outputType: 'video',
    workflowMode: 'quick',
    selectedOptionId: 'video-option',
    prompt: 'Make a cinematic establishing shot',
    aspectRatio: '16:9',
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
    videoDuration: 5,
    videoResolution: '720p',
    longVideoMode: false,
    longVideoTargetDuration: 10,
    generateRequestId: 0,
    stylePresetId: NO_STYLE_PRESET_ID,
    panels: { ...EMPTY_PANELS },
    ...overrides,
  }

  mockUseStudioForm.mockReturnValue({
    state,
    dispatch: mockDispatch,
  })
}

function getSubmittedVideoPayload(): Record<string, unknown> {
  const payload = mockGenerate.mock.calls[0]?.[0]
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('generate was not called with an object payload')
  }
  if (!('video' in payload)) {
    throw new Error('generate payload did not include video input')
  }
  const video = payload.video
  if (typeof video !== 'object' || video === null) {
    throw new Error('generate payload video input was not an object')
  }
  return video
}

async function submitVideoFromPromptArea(workflowId: WorkflowId) {
  setupStudioForm(workflowId)
  render(<StudioPromptArea />)

  fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))

  await waitFor(() => expect(mockGenerate).toHaveBeenCalled())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface SetPromptAction {
  type: 'SET_PROMPT'
  payload: string
}

function isSetPromptAction(action: unknown): action is SetPromptAction {
  return (
    isRecord(action) &&
    action.type === 'SET_PROMPT' &&
    typeof action.payload === 'string'
  )
}

function getSetPromptActions(): SetPromptAction[] {
  return mockDispatch.mock.calls
    .map(([action]) => action)
    .filter(isSetPromptAction)
}

describe('StudioPromptArea', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockResolvedValue(null)
    mockFetchGenerationPlanAPI.mockResolvedValue({ success: false })
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: null,
      modelOptions: [],
    })
    mockUseImageModelOptions.mockReturnValue({
      selectedModel: null,
      modelOptions: [],
    })
    mockUseVoiceCards.mockReturnValue({
      cards: [],
      isLoading: false,
      error: null,
      findCard: () => null,
      refresh: vi.fn(),
    })
    localStorage.clear()
  })

  it('prefills the sample prompt on first visit when prompt is empty', async () => {
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: null,
      prompt: '',
    })

    render(<StudioPromptArea />)

    await waitFor(() => expect(getSetPromptActions()).toHaveLength(1))
    const [setPromptAction] = getSetPromptActions()
    expect(setPromptAction.payload.length).toBeGreaterThan(0)
    expect(localStorage.getItem(SAMPLE_PROMPT_FLAG_KEY)).toBe('1')
  })

  it('does not prefill the sample prompt after the first visit flag exists', () => {
    localStorage.setItem(SAMPLE_PROMPT_FLAG_KEY, '1')
    setupStudioForm(WORKFLOW_IDS.QUICK_IMAGE, {
      outputType: 'image',
      selectedOptionId: null,
      prompt: '',
    })

    render(<StudioPromptArea />)

    expect(getSetPromptActions()).toEqual([])
  })

  it('adds CINEMATIC_SHORT_VIDEO workflowId to the video submit payload', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO)

    expect(getSubmittedVideoPayload()).toEqual(
      expect.objectContaining({
        workflowId: WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO,
      }),
    )
  })

  it('adds CHARACTER_TO_VIDEO workflowId to the video submit payload', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.CHARACTER_TO_VIDEO)

    expect(getSubmittedVideoPayload()).toEqual(
      expect.objectContaining({
        workflowId: WORKFLOW_IDS.CHARACTER_TO_VIDEO,
      }),
    )
  })

  it('omits workflowId from the video submit payload for image workflows', async () => {
    await submitVideoFromPromptArea(WORKFLOW_IDS.QUICK_IMAGE)

    expect(getSubmittedVideoPayload()).not.toHaveProperty('workflowId')
  })

  it('builds audio payload from selected VoiceCard and audio form params', async () => {
    const audioModel = {
      optionId: 'audio-option',
      modelId: 'fish-audio-s2-pro',
      keyId: 'fish-key-1',
      keyLabel: 'Fish key',
      adapterType: 'fish_audio',
      providerConfig: {
        label: 'Fish Audio',
        baseUrl: 'https://api.fish.audio',
      },
      sourceType: 'saved',
      requestCount: 1,
    }
    const voiceCard: VoiceCardRecord = {
      id: 'voice-card-1',
      userId: 'user-1',
      name: 'Narrator',
      provider: 'fish_audio',
      modelId: 'fish-audio-s2-pro',
      voiceId: 'fish-voice-1',
      referenceAudioUrl: null,
      referenceAudioStorageKey: null,
      gender: null,
      age: null,
      tone: [],
      pace: 'normal',
      pitch: null,
      pronunciationDictionary: { AI: 'ay eye' },
      sampleText: null,
      isDeleted: false,
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
    }
    mockUseAudioModelOptions.mockReturnValue({
      selectedModel: audioModel,
      modelOptions: [audioModel],
    })
    mockUseVoiceCards.mockReturnValue({
      cards: [voiceCard],
      isLoading: false,
      error: null,
      findCard: (id: string) => (id === voiceCard.id ? voiceCard : null),
      refresh: vi.fn(),
    })
    setupStudioForm(WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE, {
      outputType: 'audio',
      selectedOptionId: 'audio-option',
      prompt: 'Hello AI',
      voiceCardId: voiceCard.id,
      audioEmotion: 'narration',
      audioPace: 'fast',
      audioPauseMarkers: ['after_sentence_1'],
      pronunciationDictionary: { Codex: 'koh-decks' },
      audioWithTimestamps: true,
      audioSpeakerVoiceIds: ['fish-voice-1', 'fish-voice-2'],
    })

    render(<StudioPromptArea />)
    fireEvent.click(screen.getByRole('button', { name: /^generate$/ }))

    await waitFor(() =>
      expect(mockGenerate).toHaveBeenCalledWith({
        mode: 'audio',
        audio: expect.objectContaining({
          modelId: 'fish-audio-s2-pro',
          apiKeyId: 'fish-key-1',
          freePrompt: 'Hello AI',
          voiceId: 'fish-voice-1',
          emotion: 'narration',
          pace: 'fast',
          pauseMarkers: ['after_sentence_1'],
          speed: 1.35,
          withTimestamps: true,
          speakerVoiceIds: ['fish-voice-1', 'fish-voice-2'],
          pronunciationDictionary: {
            AI: 'ay eye',
            Codex: 'koh-decks',
          },
        }),
      }),
    )
  })
})
