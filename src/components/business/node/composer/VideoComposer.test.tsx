import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

// jsdom lacks ResizeObserver, which the radix Slider in the duration control
// calls on mount; the V-3a 管理素材 ResponsiveDialog needs scrollIntoView too.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Radix DropdownMenu doesn't open on a synthetic click in jsdom; follow the
// repo's established pattern (LoraAssetCard.test) and render the ⋮ menu
// inline so its conditional items are queryable without driving the portal.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
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
    <div role="menuitem" onClick={onClick}>
      {children}
    </div>
  ),
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
      boundVoice?: { nodeId: string; label: string; ready: boolean }
    }>,
    referencedTokenIds: new Set<string>(),
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
    referencedTokenIds: composerState.referencedTokenIds,
    selectBrand: vi.fn(),
    selectVariant: vi.fn(),
    selectProvider: vi.fn(),
  }),
}))

/** V-3a: open the 管理素材 drawer and return its content root. */
function openManager() {
  fireEvent.click(
    screen.getByRole('button', { name: 'references.manageButton' }),
  )
  return screen.getByRole('dialog')
}

/** Radix Tabs' trigger switches value on `onMouseDown`, not `onClick` (see
 *  @radix-ui/react-tabs source) — a plain `fireEvent.click` never fires a
 *  preceding mousedown in jsdom, so the tab silently stays put. */
function selectTab(container: HTMLElement, name: string) {
  fireEvent.mouseDown(within(container).getByRole('tab', { name }))
}

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
    composerState.referencedTokenIds = new Set()
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

  it('renders REFERENCED tokens as named @token thumbnail chips in the strip (V-3a §8)', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    composerState.referencedTokenIds = new Set(['c1', 'a1'])
    renderDetail()
    expect(screen.getByText('references.label')).toBeInTheDocument()
    // character chip's accessible name is its @token; voice chip's is the speaker name
    expect(screen.getByRole('button', { name: '@角色A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '角色A' })).toBeInTheDocument()
  })

  it('a connected-but-not-yet-referenced token does NOT show in the strip', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    // referencedTokenIds stays empty — nothing has been @-mentioned yet.
    renderDetail()
    expect(
      screen.queryByRole('button', { name: '@角色A' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('references.stripEmptyHint')).toBeInTheDocument()
  })

  it('inserts a character @token from the manager drawer (first reference, trailing space)', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.statusInsert' }),
    )
    // MentionInput serializes the chip + trailing space back to plain text.
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@角色A ' }),
    )
    // §7.2 ⑥ drift bookkeeping: records what name was inserted for this ref.
    expect(updateNodeData).toHaveBeenCalledWith('v1', {
      insertedReferenceNames: { c1: '角色A' },
    })
  })

  it('renders a square thumbnail for a REFERENCED shot token and re-inserts its @token', () => {
    composerState.referenceTokens = [
      { id: 's1', kind: 'shot', label: '开场远景', token: '@开场远景' },
    ]
    composerState.referencedTokenIds = new Set(['s1'])
    renderDetail()
    const chip = screen.getByRole('button', { name: '@开场远景' })
    expect(chip.className).toContain('rounded-md')
    fireEvent.click(chip)
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@开场远景 ' }),
    )
  })

  it('inserts a voice @AudioN chip from the drawer (no drift bookkeeping)', () => {
    composerState.referenceTokens = [
      { id: 'a1', kind: 'voice', label: '角色A', token: '@Audio1' },
    ]
    renderDetail()
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.statusInsert' }),
    )
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ prompt: '@Audio1 ' }),
    )
    // Voice's text anchor is ambiguous — not drift-tracked.
    expect(updateNodeData).not.toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ insertedReferenceNames: expect.anything() }),
    )
  })

  it('shows a real thumbnail image for a referenced strip chip when the reference has media', () => {
    composerState.referenceTokens = [
      {
        id: 'c1',
        kind: 'character',
        label: '角色A',
        token: '@角色A',
        mediaUrl: 'https://cdn.test/character-a.png',
      },
    ]
    composerState.referencedTokenIds = new Set(['c1'])
    renderDetail()
    const img = screen
      .getByRole('button', { name: '@角色A' })
      .querySelector('img')
    expect(img).toHaveAttribute('src', 'https://cdn.test/character-a.png')
  })

  it('V2-1 silently auto-rewrites a stale @oldName after the node is renamed', () => {
    // The reference was inserted as @旧名字, then its node renamed to 新名字.
    // No manual affordance — the effect rewrites the prompt automatically.
    const data = {
      prompt: '@旧名字 walks into frame',
      status: 'idle',
      insertedReferenceNames: { c1: '旧名字' },
    } as unknown as NodeWorkflowNodeData
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '新名字', token: '@新名字' },
    ]
    render(<VideoComposer id="v1" data={data} density="detail" />)

    // No drift affordance renders anymore.
    expect(
      screen.queryByText('references.driftReplace'),
    ).not.toBeInTheDocument()
    // The prompt is rewritten + bookkeeping re-anchored, automatically.
    expect(updateNodeData).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({
        prompt: '@新名字 walks into frame',
        insertedReferenceNames: { c1: '新名字' },
      }),
    )
  })

  it('locates a REFERENCED reference node on canvas from the hover preview', () => {
    composerState.referenceTokens = [
      { id: 'c1', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    composerState.referencedTokenIds = new Set(['c1'])
    renderDetail()
    fireEvent.mouseEnter(screen.getByRole('button', { name: '@角色A' }))
    fireEvent.click(screen.getByText('references.locate'))
    expect(focusNode).toHaveBeenCalledWith('c1')
  })

  it('shows a needs-name hint in the manager drawer for an unnamed reference node', () => {
    composerState.referenceTokens = [
      { id: 'b1', kind: 'background', label: '', token: '' },
    ]
    renderDetail()
    const dialog = openManager()
    expect(
      within(dialog).getByText('references.unnamedHint'),
    ).toBeInTheDocument()
  })

  it('shows the no-connections hint when nothing is bound (V-3a, five cast cards retired)', () => {
    renderDetail()
    expect(screen.getByText('references.emptyDept')).toBeInTheDocument()
  })

  it('deletes the edge (node kept) from a REFERENCED strip chip × and toasts about it', () => {
    composerState.referenceTokens = [
      {
        id: 'c1',
        kind: 'character',
        label: '角色A',
        token: '@角色A',
        edgeId: 'e1',
      },
    ]
    composerState.referencedTokenIds = new Set(['c1'])
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'references.remove' }))
    expect(deleteEdge).toHaveBeenCalledWith('e1')
    expect(toastInfo).toHaveBeenCalledWith('references.removedToast')
  })

  it('autospawns from the 声音 tab ＋ → library pick → spawnReference (voice→video)', () => {
    renderDetail()
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.voice')
    // ＋ opens the audio library (voice → audio mediaType).
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.voice',
      }),
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

  it('角色 tab ＋ autospawns an image role=character directly (no submenu)', () => {
    renderDetail()
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.character')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.character',
      }),
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

  it('§音色收进角色: 管理素材抽屉里的 ＋配音 targets the CHARACTER node (voice→character)', () => {
    composerState.referenceTokens = [
      { id: 'char9', kind: 'character', label: '角色A', token: '@角色A' },
    ]
    renderDetail()
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('menuitem', { name: /references\.addVoice/ }),
    )
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
    composerState.referencedTokenIds = new Set()
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
