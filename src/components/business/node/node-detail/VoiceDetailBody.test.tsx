import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS } from '@/constants/node-studio'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const { uploadReferenceAudioAPI, generateAudioAPI, checkAudioStatusAPI } =
  vi.hoisted(() => ({
    uploadReferenceAudioAPI: vi.fn(),
    generateAudioAPI: vi.fn(),
    checkAudioStatusAPI: vi.fn(),
  }))

vi.mock('@/lib/api-client', () => ({
  uploadReferenceAudioAPI,
  generateAudioAPI,
  checkAudioStatusAPI,
}))

vi.mock('@/components/ui/param-slider', () => ({
  ParamSlider: ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: number
    onChange: (value: number) => void
  }) => (
    <input
      type="range"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  ),
}))

const { updateNodeData } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    modelOptionsByType: { voice: [] },
  }),
}))

vi.mock('../nodes/NodeCardControls', () => ({
  NodeModelSelector: () => null,
}))

vi.mock('../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: ({
    open,
    onSelectVoiceId,
  }: {
    open: boolean
    onSelectVoiceId: (voice: {
      voiceId: string
      name: string
      coverImage: string | null
    }) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="pick-voice"
        onClick={() =>
          onSelectVoiceId({
            voiceId: 'voice-123',
            name: 'Narrator One',
            coverImage: 'https://cdn.example.com/cover.png',
          })
        }
      >
        pick
      </button>
    ) : null,
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    onSelect,
  }: {
    open: boolean
    onSelect?: (generation: {
      url: string
      previewUrl: string | null
      thumbnailUrl: string | null
    }) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="pick-asset"
        onClick={() =>
          onSelect?.({
            url: 'https://cdn.example.com/asset.mp3',
            previewUrl: 'https://cdn.example.com/asset-cover.png',
            thumbnailUrl: null,
          })
        }
      >
        pickAsset
      </button>
    ) : null,
}))

import { VoiceDetailBody } from './VoiceDetailBody'

function makeData(overrides: Partial<NodeWorkflowNodeData> = {}) {
  return {
    prompt: '',
    status: NODE_STATUS_IDS.idle,
    ...overrides,
  } as NodeWorkflowNodeData
}

function renderBody(data: NodeWorkflowNodeData) {
  return render(
    <VoiceDetailBody nodeId="voice-1" type={NODE_TYPE_IDS.voice} data={data} />,
  )
}

describe('VoiceDetailBody', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateAudioAPI.mockResolvedValue({
      success: true,
      data: { jobId: 'job-1' },
    })
    checkAudioStatusAPI.mockResolvedValue({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: { url: 'https://cdn.example.com/sample.mp3' },
      },
    })
  })

  it('does not render a 台词 input — lines belong to the script', () => {
    renderBody(makeData())
    expect(screen.queryByLabelText('dialogue.label')).not.toBeInTheDocument()
  })

  it('stores a selected emotion code and clears it on 无', () => {
    renderBody(makeData())
    fireEvent.click(screen.getByRole('button', { name: 'emotions.calm' }))
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceEmotion: 'calm',
      status: NODE_STATUS_IDS.ready,
    })

    fireEvent.click(screen.getByRole('button', { name: 'emotions.none' }))
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceEmotion: '',
      status: NODE_STATUS_IDS.idle,
    })
  })

  it('selects a system voice through the library dialog', () => {
    renderBody(makeData())
    fireEvent.click(screen.getByRole('button', { name: 'chooseVoice' }))
    fireEvent.click(screen.getByTestId('pick-voice'))
    expect(updateNodeData).toHaveBeenCalledWith('voice-1', {
      voiceId: 'voice-123',
      voiceName: 'Narrator One',
      voiceCoverImage: 'https://cdn.example.com/cover.png',
      voiceProvider: expect.any(String),
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
      voiceSampleUrl: undefined,
      status: NODE_STATUS_IDS.ready,
    })
  })

  it('switches to the upload source view', () => {
    renderBody(makeData())
    expect(screen.queryByText('uploadAudio')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'sourceMine' }))
    expect(screen.getByText('uploadAudio')).toBeInTheDocument()
  })

  it('generates a sample for the picked voice and carries its cover into 素材', async () => {
    renderBody(
      makeData({
        voiceId: 'voice-123',
        voiceName: 'Narrator One',
        voiceCoverImage: 'https://cdn.example.com/cover.png',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'generateSample' }))

    await waitFor(() => {
      // The voice's avatar rides along BY REFERENCE so the gallery clip shows it.
      expect(generateAudioAPI).toHaveBeenCalledWith(
        expect.objectContaining({
          voiceId: 'voice-123',
          coverImageUrl: 'https://cdn.example.com/cover.png',
        }),
      )
      expect(updateNodeData).toHaveBeenCalledWith(
        'voice-1',
        expect.objectContaining({
          voiceSampleUrl: 'https://cdn.example.com/sample.mp3',
        }),
      )
    })
  })

  it('drops a stale sample if the voice changed during generation', async () => {
    let resolveStatus: (value: unknown) => void = () => {}
    checkAudioStatusAPI.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve
      }),
    )
    const { rerender } = renderBody(
      makeData({ voiceId: 'voice-123', voiceName: 'A' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'generateSample' }))
    await waitFor(() => expect(generateAudioAPI).toHaveBeenCalled())

    // Switch to a different voice while the audition poll is still pending.
    rerender(
      <VoiceDetailBody
        nodeId="voice-1"
        type={NODE_TYPE_IDS.voice}
        data={makeData({ voiceId: 'voice-999', voiceName: 'B' })}
      />,
    )

    // The in-flight poll now resolves with the FIRST voice's clip.
    resolveStatus({
      success: true,
      data: {
        status: 'COMPLETED',
        generation: { url: 'https://cdn.example.com/stale-A.mp3' },
      },
    })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'generateSample' }),
      ).not.toBeDisabled(),
    )
    expect(updateNodeData).not.toHaveBeenCalledWith(
      'voice-1',
      expect.objectContaining({
        voiceSampleUrl: 'https://cdn.example.com/stale-A.mp3',
      }),
    )
  })

  it('pulls a generated clip from the library as reference audio + inherits its cover (素材)', () => {
    renderBody(makeData())

    fireEvent.click(screen.getByRole('button', { name: 'sourceMine' }))
    fireEvent.click(screen.getByText('referenceFromAssets'))
    fireEvent.click(screen.getByTestId('pick-asset'))

    // The node only FOLLOWS the asset's cover (set in the asset library) — it
    // never configures one itself.
    // Stored in the my-voice cover field so it never clobbers the system
    // voice's cover when the user toggles sources.
    expect(updateNodeData).toHaveBeenCalledWith(
      'voice-1',
      expect.objectContaining({
        voiceReferenceAudioUrl: 'https://cdn.example.com/asset.mp3',
        voiceReferenceCoverImage: 'https://cdn.example.com/asset-cover.png',
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      }),
    )
  })

  it('offers no cover-config control — covers are set in the asset library', () => {
    renderBody(makeData({ voiceId: 'voice-123', voiceName: 'Narrator One' }))
    expect(
      screen.queryByRole('button', { name: 'uploadCover' }),
    ).not.toBeInTheDocument()
  })

  it('writes voiceSpeed from the speed slider', () => {
    renderBody(makeData())
    fireEvent.change(screen.getByLabelText('speedLabel'), {
      target: { value: '1.5' },
    })
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceSpeed: 1.5,
      status: NODE_STATUS_IDS.idle,
    })
  })

  it('writes voiceVolume from the volume slider', () => {
    renderBody(makeData())
    fireEvent.change(screen.getByLabelText('volumeLabel'), {
      target: { value: '6' },
    })
    expect(updateNodeData).toHaveBeenLastCalledWith('voice-1', {
      voiceVolume: 6,
      status: NODE_STATUS_IDS.idle,
    })
  })
})
