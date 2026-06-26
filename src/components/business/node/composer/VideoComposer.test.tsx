import { fireEvent, render, screen } from '@testing-library/react'
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
    referenceKinds: [] as Array<'character' | 'background' | 'shot' | 'voice'>,
    referenceTokens: [] as Array<{
      id: string
      kind: 'character' | 'background' | 'shot' | 'voice'
      label: string
      token: string
    }>,
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
    referenceTokens: composerState.referenceTokens,
    selectBrand: vi.fn(),
    selectVariant: vi.fn(),
    selectProvider: vi.fn(),
  }),
}))

const { updateNodeData } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    generateMediaNode: vi.fn(),
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
    composerState.referenceTokens = []
    updateNodeData.mockClear()
  })

  it('keeps the model picker collapsed once a brand is selected', () => {
    const { container } = renderDetail()
    // Compact chip is shown; the rail stays in the DOM but collapsed (no data-open).
    expect(screen.getByText('Seedance · variant.fast')).toBeInTheDocument()
    expect(container.querySelector('.node-collapsible')).not.toHaveAttribute(
      'data-open',
    )
  })

  it('expands the model rail when the compact chip is clicked', () => {
    const { container } = renderDetail()
    fireEvent.click(
      screen.getByText('Seedance · variant.fast').closest('button')!,
    )
    expect(container.querySelector('.node-collapsible')).toHaveAttribute(
      'data-open',
    )
  })

  it('renders bound references as named @token chips', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    renderDetail()
    expect(screen.getByText('references.label')).toBeInTheDocument()
    // character chip shows its @name; voice chip shows the speaker name
    expect(screen.getByText('@角色A')).toBeInTheDocument()
    expect(screen.getByText('角色A')).toBeInTheDocument()
    expect(screen.queryByText('references.empty')).not.toBeInTheDocument()
  })

  it('inserts a character @token into the prompt on chip click', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    fireEvent.click(screen.getByText('@角色A'))
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@角色A' }),
    )
  })

  it('renders + inserts a shot @token', () => {
    composerState.referenceTokens = [
      { id: 's1', kind: 'shot', label: '开场远景', token: '@开场远景' },
    ]
    renderDetail()
    fireEvent.click(screen.getByText('@开场远景'))
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@开场远景' }),
    )
  })

  it('inserts a voice token labelled with the speaker name', () => {
    composerState.referenceTokens = [
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    renderDetail()
    fireEvent.click(screen.getByText('角色A'))
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '角色A (@Audio1)' }),
    )
  })

  it('shows a needs-name chip for an unnamed reference node', () => {
    composerState.referenceTokens = [
      { id: 'b1', kind: 'background', label: '', token: '' },
    ]
    renderDetail()
    expect(
      screen.getByText('references.unnamed', { exact: false }),
    ).toBeInTheDocument()
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
