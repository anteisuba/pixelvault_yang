import { fireEvent, render, screen } from '@testing-library/react'
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

vi.mock('@/lib/api-client', () => ({
  uploadReferenceAudioAPI: vi.fn(),
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

const { updateNodeData, generateMediaNode } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  generateMediaNode: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    generateMediaNode,
    modelOptionsByType: { voice: [] },
  }),
}))

// NodeModelSelector pulls in the model-picker chain (next/navigation); stub it
// and NodeActionButton so this unit test stays light.
vi.mock('../nodes/NodeCardControls', () => ({
  NodeModelSelector: () => null,
  NodeActionButton: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick: () => void
  }) => (
    <button
      type="button"
      data-testid="generate"
      disabled={disabled}
      onClick={() => onClick()}
    >
      {children}
    </button>
  ),
}))

vi.mock('../FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: ({
    open,
    onSelectVoiceId,
  }: {
    open: boolean
    onSelectVoiceId: (id: string) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="pick-voice"
        onClick={() => onSelectVoiceId('voice-123')}
      >
        pick
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
  })

  it('writes the 台词 to dialogue and marks the node ready', () => {
    renderBody(makeData())
    fireEvent.change(screen.getByLabelText('dialogue.label'), {
      target: { value: '你终于来了' },
    })
    expect(updateNodeData).toHaveBeenCalledWith('voice-1', {
      dialogue: '你终于来了',
      status: NODE_STATUS_IDS.ready,
    })
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
      voiceProvider: expect.any(String),
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
      status: NODE_STATUS_IDS.ready,
    })
  })

  it('switches to the upload source view', () => {
    renderBody(makeData())
    expect(screen.queryByText('uploadAudio')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'sourceMine' }))
    expect(screen.getByText('uploadAudio')).toBeInTheDocument()
  })

  it('disables generate without a 台词 and runs it with one', () => {
    const { rerender } = renderBody(makeData())
    expect(screen.getByTestId('generate')).toBeDisabled()

    rerender(
      <VoiceDetailBody
        nodeId="voice-1"
        type={NODE_TYPE_IDS.voice}
        data={makeData({ dialogue: '开始' })}
      />,
    )
    fireEvent.click(screen.getByTestId('generate'))
    expect(generateMediaNode).toHaveBeenCalledWith('voice-1')
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
