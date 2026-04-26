import type { ComponentProps, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import { WORKFLOW_IDS, type WorkflowId } from '@/constants/workflows'
import type { StudioFormState } from '@/contexts/studio-context'

import { StudioPromptArea } from './StudioPromptArea'

const mockDispatch = vi.hoisted(() => vi.fn())
const mockGenerate = vi.hoisted(() => vi.fn())
const mockUseStudioForm = vi.hoisted(() => vi.fn())
const SAMPLE_PROMPT_FLAG_KEY = 'studio-sample-prompt-shown'

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
  }),
}))

vi.mock('@/hooks/use-studio-shortcuts', () => ({
  useStudioShortcuts: vi.fn(),
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({
    selectedModel: null,
    modelOptions: [],
  }),
}))

vi.mock('@/hooks/use-audio-model-options', () => ({
  useAudioModelOptions: () => ({
    selectedModel: null,
    modelOptions: [],
  }),
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
    videoDuration: 5,
    videoResolution: '720p',
    longVideoMode: false,
    longVideoTargetDuration: 10,
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
})
