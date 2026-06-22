import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

// jsdom lacks ResizeObserver, which the radix Slider in the duration control
// calls on mount.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const { composerState } = vi.hoisted(() => ({
  composerState: {
    referenceKinds: [] as Array<'character' | 'background' | 'voice'>,
  },
}))

vi.mock('@/hooks/node/use-video-composer', () => ({
  useVideoComposer: () => ({
    options: [],
    brands: ['Seedance'],
    state: { brand: 'Seedance', variant: 'fast', provider: undefined },
    variants: [],
    isDualProvider: false,
    hasReferenceInputs: false,
    hasUpstreamInputs: true,
    referenceKinds: composerState.referenceKinds,
    selectBrand: vi.fn(),
    selectVariant: vi.fn(),
    selectProvider: vi.fn(),
  }),
}))

const { updateNodeData, enhanceSeedancePrompt } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  enhanceSeedancePrompt: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    generateMediaNode: vi.fn(),
    enhanceSeedancePrompt,
    setExpandedNodeId: vi.fn(),
  }),
}))

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: () => null,
}))

import { VideoComposer } from './VideoComposer'

function renderDetail() {
  const data = { prompt: '', status: 'idle' } as NodeWorkflowNodeData
  return render(<VideoComposer id="v1" data={data} density="detail" />)
}

describe('VideoComposer references row (detail)', () => {
  beforeEach(() => {
    composerState.referenceKinds = []
    updateNodeData.mockClear()
    enhanceSeedancePrompt.mockClear()
  })

  it('runs AI prompt enhancement on the node when clicked', async () => {
    renderDetail()
    await act(async () => {
      fireEvent.click(screen.getByText('enhancePrompt'))
    })
    expect(enhanceSeedancePrompt).toHaveBeenCalledWith('v1')
  })

  it('shows the 运镜 prompt hint', () => {
    renderDetail()
    expect(screen.getByText('motionHint')).toBeInTheDocument()
  })

  it('lists bound reference families as chips', () => {
    composerState.referenceKinds = ['character', 'voice']
    renderDetail()
    expect(screen.getByText('references.label')).toBeInTheDocument()
    expect(screen.getByText('refKind.character')).toBeInTheDocument()
    expect(screen.getByText('refKind.voice')).toBeInTheDocument()
    expect(screen.queryByText('references.empty')).not.toBeInTheDocument()
  })

  it('shows the empty hint when no references are bound', () => {
    renderDetail()
    expect(screen.getByText('references.empty')).toBeInTheDocument()
  })

  it('toggles generate_audio onto node data', () => {
    renderDetail()
    fireEvent.click(screen.getByRole('switch', { name: 'generateAudioLabel' }))
    expect(updateNodeData).toHaveBeenCalledWith('v1', { generateAudio: false })
  })

  it('shows the last seed and locks it back into the input seed', () => {
    const data = {
      prompt: '',
      status: 'idle',
      model: { modelId: AI_MODELS.SEEDANCE_20 },
      mediaUrl: 'https://cdn.test/clip.mp4',
      lastSeed: 777,
    } as unknown as NodeWorkflowNodeData
    render(<VideoComposer id="v1" data={data} density="detail" />)

    expect(screen.getByText('lastSeedLabel: 777')).toBeInTheDocument()
    const lockButton = screen.getByText('seedLock').closest('button')
    fireEvent.click(lockButton as HTMLButtonElement)
    expect(updateNodeData).toHaveBeenCalledWith('v1', { seed: 777 })
  })
})
