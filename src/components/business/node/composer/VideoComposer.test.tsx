import { fireEvent, render, screen, within } from '@testing-library/react'
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
      mediaUrl?: string
      coverImage?: string
      imageSlotIndex?: number
      audioSlotIndex?: number
      edgeId?: string
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

const { updateNodeData, focusNode, deleteEdge, toastInfo, spawnReference } =
  vi.hoisted(() => ({
    updateNodeData: vi.fn(),
    focusNode: vi.fn(),
    deleteEdge: vi.fn(),
    toastInfo: vi.fn(),
    spawnReference: vi.fn(),
  }))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    generateMediaNode: vi.fn(),
    setExpandedNodeId: vi.fn(),
    focusNode,
    deleteEdge,
    spawnReference,
  }),
}))

// Stub the asset library — when open, expose a button that resolves a fake
// picked generation so the ＋添加位 → autospawn wiring is testable without the
// real dialog's data fetching.
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    mediaType,
    onSelect,
  }: {
    open: boolean
    mediaType?: string
    onSelect?: (g: unknown) => void
  }) =>
    open ? (
      <button
        type="button"
        data-testid="asset-pick"
        data-media-type={mediaType}
        onClick={() =>
          onSelect?.({
            id: 'gen1',
            url: 'https://cdn.test/picked.png',
            thumbnailUrl: 'https://cdn.test/picked-thumb.webp',
            prompt: '选中的角色',
            model: 'seedream',
          })
        }
      >
        pick-asset
      </button>
    ) : null,
}))

vi.mock('sonner', () => ({
  toast: { info: toastInfo },
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
    focusNode.mockClear()
    deleteEdge.mockClear()
    toastInfo.mockClear()
    spawnReference.mockClear()
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

  it('renders bound references as named @token thumbnail chips (§8)', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    renderDetail()
    expect(screen.getByText('references.label')).toBeInTheDocument()
    // character chip's accessible name is its @token; voice chip's is the speaker name
    expect(screen.getByRole('button', { name: '@角色A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '角色A' })).toBeInTheDocument()
    // character + narration have tokens; scene / shot / motion stay empty.
    expect(screen.getAllByText('references.emptyDept')).toHaveLength(3)
  })

  it('inserts a character @token into the prompt on chip click', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: '@角色A' }))
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@角色A' }),
    )
    // §7.2 ⑥ drift bookkeeping: records what name was inserted for this ref.
    expect(updateNodeData).toHaveBeenCalledWith('v1', {
      insertedReferenceNames: { c1: '角色A' },
    })
  })

  it('renders a square thumbnail for a shot token and inserts its @token', () => {
    composerState.referenceTokens = [
      { id: 's1', kind: 'shot', label: '开场远景', token: '@开场远景' },
    ]
    renderDetail()
    const chip = screen.getByRole('button', { name: '@开场远景' })
    expect(chip.className).toContain('rounded-md')
    fireEvent.click(chip)
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@开场远景' }),
    )
  })

  it('inserts a voice token labelled with the speaker name (no drift bookkeeping)', () => {
    composerState.referenceTokens = [
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: '角色A' }))
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '角色A (@Audio1)' }),
    )
    // Voice's text anchor is ambiguous (bare name, not `@name`) — not tracked.
    expect(updateNodeData).not.toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ insertedReferenceNames: expect.anything() }),
    )
  })

  it('shows a real thumbnail image when the reference has media', () => {
    composerState.referenceTokens = [
      {
        id: 'c1',
        kind: 'character',
        label: '角色A',
        token: '@角色A',
        mediaUrl: 'https://cdn.test/character-a.png',
      },
    ]
    renderDetail()
    const img = screen
      .getByRole('button', { name: '@角色A' })
      .querySelector('img')
    expect(img).toHaveAttribute('src', 'https://cdn.test/character-a.png')
  })

  it('flags drift when a reference was renamed after its old @token was typed in', () => {
    const data = {
      prompt: '@旧名字 walks into frame',
      status: 'idle',
      insertedReferenceNames: { c1: '旧名字' },
    } as unknown as NodeWorkflowNodeData
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '新名字', token: '@新名字' },
    ]
    render(<VideoComposer id="v1" data={data} density="detail" />)

    const chip = screen.getByRole('button', { name: '@新名字' })
    expect(chip.className).toContain('border-dashed')

    fireEvent.mouseEnter(chip)
    fireEvent.click(screen.getByText('references.driftReplace'))
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        prompt: '@新名字 walks into frame',
        insertedReferenceNames: { c1: '新名字' },
      }),
    )
  })

  it('locates the reference node on canvas from the hover preview', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    fireEvent.mouseEnter(screen.getByRole('button', { name: '@角色A' }))
    fireEvent.click(screen.getByText('references.locate'))
    expect(focusNode).toHaveBeenCalledWith('c1')
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

  it('shows the five cast cards with empty hints when nothing is bound', () => {
    renderDetail()
    expect(screen.getAllByText('references.emptyDept')).toHaveLength(5)
    expect(screen.getByText('departments.character')).toBeInTheDocument()
    expect(screen.getByText('departments.scene')).toBeInTheDocument()
    expect(screen.getByText('departments.shot')).toBeInTheDocument()
    expect(screen.getByText('departments.motion')).toBeInTheDocument()
    expect(screen.getByText('departments.narration')).toBeInTheDocument()
  })

  it('deletes the edge (node kept) from the slot × and toasts about it', () => {
    composerState.referenceTokens = [
      {
        id: 'c1',
        kind: 'character',
        label: '角色A',
        token: '@角色A',
        edgeId: 'e1',
      },
    ]
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'references.remove' }))
    expect(deleteEdge).toHaveBeenCalledWith('e1')
    expect(toastInfo).toHaveBeenCalledWith('references.removedToast')
  })

  it('autospawns from the narration card ＋ → library pick → spawnReference (voice→video)', () => {
    renderDetail()
    const narrationCard = screen.getByRole('region', {
      name: 'departments.narration',
    })
    // ＋ opens the audio library (voice → audio mediaType).
    fireEvent.click(
      within(narrationCard).getByRole('button', { name: 'references.add' }),
    )
    const pick = screen.getByTestId('asset-pick')
    expect(pick).toHaveAttribute('data-media-type', 'audio')
    fireEvent.click(pick)
    expect(spawnReference).toHaveBeenCalledWith({
      targetNodeId: 'v1',
      nodeType: 'voice',
      role: undefined,
      media: {
        url: 'https://cdn.test/picked.png',
        generationId: 'gen1',
        thumbnailUrl: 'https://cdn.test/picked-thumb.webp',
        name: '选中的角色',
      },
    })
  })

  it('character card ＋ autospawns an image role=character directly (no submenu)', () => {
    renderDetail()
    const characterCard = screen.getByRole('region', {
      name: 'departments.character',
    })
    fireEvent.click(
      within(characterCard).getByRole('button', { name: 'references.add' }),
    )
    const pick = screen.getByTestId('asset-pick')
    expect(pick).toHaveAttribute('data-media-type', 'image')
    fireEvent.click(pick)
    expect(spawnReference).toHaveBeenCalledWith(
      expect.objectContaining({
        targetNodeId: 'v1',
        nodeType: 'image',
        role: 'character',
      }),
    )
  })

  it('§音色收进角色: ＋配音 on a character targets the CHARACTER node (voice→character)', () => {
    composerState.referenceTokens = [
      { id: 'char9', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'references.addVoice' }))
    const pick = screen.getByTestId('asset-pick')
    expect(pick).toHaveAttribute('data-media-type', 'audio')
    fireEvent.click(pick)
    expect(spawnReference).toHaveBeenCalledWith(
      expect.objectContaining({
        targetNodeId: 'char9',
        nodeType: 'voice',
      }),
    )
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

describe('VideoComposer monitor (detail, §4 C4)', () => {
  beforeEach(() => {
    composerState.referenceKinds = []
    composerState.referenceTokens = []
    updateNodeData.mockClear()
  })

  it('shows the empty-state hint when there is no media yet', () => {
    renderDetail()
    expect(screen.getByText('monitor.empty')).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
  })

  it('renders the video with its poster once media + thumbnail exist', () => {
    const data = {
      prompt: '',
      status: 'idle',
      mediaUrl: 'https://cdn.test/clip.mp4',
      videoThumbnailUrl: 'https://cdn.test/clip-thumb.webp',
    } as unknown as NodeWorkflowNodeData
    render(<VideoComposer id="v1" data={data} density="detail" />)

    const video = document.querySelector('video')
    expect(video).toHaveAttribute('src', 'https://cdn.test/clip.mp4')
    expect(video).toHaveAttribute('poster', 'https://cdn.test/clip-thumb.webp')
    expect(screen.queryByText('monitor.empty')).not.toBeInTheDocument()
  })

  it('shows the REC readout only while generating', () => {
    const runningData = {
      prompt: '',
      status: 'running',
    } as unknown as NodeWorkflowNodeData
    const { rerender } = render(
      <VideoComposer id="v1" data={runningData} density="detail" />,
    )
    expect(screen.getByText('monitor.rec 00:00:00')).toBeInTheDocument()

    const idleData = { prompt: '', status: 'idle' } as NodeWorkflowNodeData
    rerender(<VideoComposer id="v1" data={idleData} density="detail" />)
    expect(screen.queryByText('monitor.rec 00:00:00')).not.toBeInTheDocument()
  })
})
