import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { ComposerReferenceToken } from '@/hooks/node/use-video-composer'

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
  if (typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Radix DropdownMenu doesn't open on a synthetic click in jsdom; follow the
// repo's established pattern (LoraAssetCard.test / StudioPromptArea.test) and
// render the menu inline so its conditional items are queryable without
// driving the portal.
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

import { ReferenceManagerPanel } from './ReferenceManagerPanel'

function makeToken(
  over: Partial<ComposerReferenceToken>,
): ComposerReferenceToken {
  return {
    id: 'c1',
    kind: 'character',
    label: '角色A',
    token: '@角色A',
    ...over,
  }
}

function renderPanel(
  tokens: ComposerReferenceToken[],
  overrides?: Partial<{
    referencedTokenIds: Set<string>
    onInsert: (data: unknown, el: HTMLElement) => void
    onLocate: (nodeId: string) => void
    onRemove: (token: ComposerReferenceToken) => void
    onAddReference: (request: unknown) => void
    onAddVoice: (characterNodeId: string) => void
    onAddCloseup: (characterNodeId: string) => void
    maxReferenceImages: number
  }>,
) {
  return render(
    <ReferenceManagerPanel
      tokens={tokens}
      referencedTokenIds={overrides?.referencedTokenIds ?? new Set()}
      onInsert={overrides?.onInsert ?? vi.fn()}
      onLocate={overrides?.onLocate}
      onRemove={overrides?.onRemove}
      onAddReference={overrides?.onAddReference}
      onAddVoice={overrides?.onAddVoice}
      onAddCloseup={overrides?.onAddCloseup}
      maxReferenceImages={overrides?.maxReferenceImages}
    />,
  )
}

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

describe('ReferenceManagerPanel strip (V-3a 已引用条)', () => {
  it('renders only referenced tokens as clickable chips', () => {
    renderPanel(
      [
        makeToken({ id: 'c1', label: '角色A', token: '@角色A' }),
        makeToken({
          id: 'b1',
          kind: 'background',
          label: '教室',
          token: '@教室',
        }),
      ],
      { referencedTokenIds: new Set(['c1']) },
    )
    expect(screen.getByRole('button', { name: '@角色A' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '@教室' }),
    ).not.toBeInTheDocument()
  })

  it('shows the no-connections hint when nothing is wired at all', () => {
    renderPanel([])
    expect(screen.getByText('references.emptyDept')).toBeInTheDocument()
  })

  it('shows the not-yet-referenced hint when tokens are connected but none referenced', () => {
    renderPanel([makeToken({ id: 'c1' })], { referencedTokenIds: new Set() })
    expect(screen.getByText('references.stripEmptyHint')).toBeInTheDocument()
  })

  it('clicking a referenced strip chip calls onInsert (re-insert)', () => {
    const onInsert = vi.fn()
    renderPanel([makeToken({ id: 'c1' })], {
      referencedTokenIds: new Set(['c1']),
      onInsert,
    })
    fireEvent.click(screen.getByRole('button', { name: '@角色A' }))
    expect(onInsert).toHaveBeenCalled()
  })

  it('the strip hover-× removes an edge only when the token has one', () => {
    const onRemove = vi.fn()
    renderPanel([makeToken({ id: 'c1', edgeId: 'e1' })], {
      referencedTokenIds: new Set(['c1']),
      onRemove,
    })
    fireEvent.click(screen.getByRole('button', { name: 'references.remove' }))
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', edgeId: 'e1' }),
    )
  })

  it('shows the capacity warning once referenced image count exceeds the model cap', () => {
    renderPanel(
      [
        makeToken({ id: 'c1', kind: 'character' }),
        makeToken({ id: 'c2', kind: 'character', label: 'B', token: '@B' }),
      ],
      { referencedTokenIds: new Set(['c1', 'c2']), maxReferenceImages: 1 },
    )
    expect(screen.getByText('references.capacityWarning')).toBeInTheDocument()
  })

  it('omits the capacity warning when the model cap is unknown', () => {
    renderPanel([makeToken({ id: 'c1' })], {
      referencedTokenIds: new Set(['c1']),
    })
    expect(
      screen.queryByText('references.capacityWarning'),
    ).not.toBeInTheDocument()
  })
})

describe('ReferenceManagerPanel drawer (V-3a 管理素材)', () => {
  it('lists every connected token, referenced or not, once opened', () => {
    renderPanel(
      [
        makeToken({ id: 'c1', label: '角色A', token: '@角色A' }),
        makeToken({
          id: 'b1',
          kind: 'background',
          label: '教室',
          token: '@教室',
        }),
      ],
      { referencedTokenIds: new Set(['c1']) },
    )
    const dialog = openManager()
    expect(within(dialog).getByText('角色A')).toBeInTheDocument()
    expect(within(dialog).getByText('教室')).toBeInTheDocument()
  })

  it('marks the referenced row 已引用 and the unreferenced row gets an 插入 button', () => {
    const onInsert = vi.fn()
    renderPanel(
      [
        makeToken({ id: 'c1', label: '角色A', token: '@角色A' }),
        makeToken({
          id: 'b1',
          kind: 'background',
          label: '教室',
          token: '@教室',
        }),
      ],
      { referencedTokenIds: new Set(['c1']), onInsert },
    )
    const dialog = openManager()
    expect(
      within(dialog).getAllByText('references.statusReferenced'),
    ).toHaveLength(1)
    const insertButton = within(dialog).getByRole('button', {
      name: 'references.statusInsert',
    })
    fireEvent.click(insertButton)
    expect(onInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1' }),
      expect.anything(),
    )
  })

  it('filters rows by the active type tab', () => {
    renderPanel([
      makeToken({ id: 'c1', label: '角色A', token: '@角色A' }),
      makeToken({
        id: 'b1',
        kind: 'background',
        label: '教室',
        token: '@教室',
      }),
    ])
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.character')
    expect(within(dialog).getByText('角色A')).toBeInTheDocument()
    expect(within(dialog).queryByText('教室')).not.toBeInTheDocument()
  })

  it('filters rows by search text (name or token)', () => {
    renderPanel([
      makeToken({ id: 'c1', label: '角色A', token: '@角色A' }),
      makeToken({
        id: 'b1',
        kind: 'background',
        label: '教室',
        token: '@教室',
      }),
    ])
    const dialog = openManager()
    fireEvent.change(
      within(dialog).getByPlaceholderText('references.searchPlaceholder'),
      { target: { value: '教室' } },
    )
    expect(within(dialog).queryByText('角色A')).not.toBeInTheDocument()
    expect(within(dialog).getByText('教室')).toBeInTheDocument()
  })

  it('shows references.managerEmpty when the search matches nothing', () => {
    renderPanel([makeToken({ id: 'c1' })])
    const dialog = openManager()
    fireEvent.change(
      within(dialog).getByPlaceholderText('references.searchPlaceholder'),
      { target: { value: '不存在的名字' } },
    )
    expect(
      within(dialog).getByText('references.managerEmpty'),
    ).toBeInTheDocument()
  })

  it('the 角色 tab add button fires onAddReference with a character role', () => {
    const onAddReference = vi.fn()
    renderPanel([], { onAddReference })
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.character')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.character',
      }),
    )
    expect(onAddReference).toHaveBeenCalledWith(
      expect.objectContaining({ nodeType: 'image', role: 'character' }),
    )
  })

  it('the 镜头 tab offers two add buttons (shot image + reference video)', () => {
    const onAddReference = vi.fn()
    renderPanel([], { onAddReference })
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.shot')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.shotImage',
      }),
    )
    expect(onAddReference).toHaveBeenCalledWith(
      expect.objectContaining({ nodeType: 'image', role: 'shot' }),
    )
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.video',
      }),
    )
    expect(onAddReference).toHaveBeenCalledWith(
      expect.objectContaining({ nodeType: 'videoReference' }),
    )
  })

  it('hides the add buttons on the 全部 tab (ambiguous which type to spawn)', () => {
    renderPanel([], { onAddReference: vi.fn() })
    const dialog = openManager()
    expect(
      within(dialog).queryByRole('button', {
        name: /references\.addButtons/,
      }),
    ).not.toBeInTheDocument()
  })

  it('row ⋮ menu: locate fires onLocate, disconnect fires onRemove only with an edge', () => {
    const onLocate = vi.fn()
    const onRemove = vi.fn()
    renderPanel([makeToken({ id: 'c1', edgeId: 'e1' })], {
      onLocate,
      onRemove,
    })
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('menuitem', { name: /references\.rowLocate/ }),
    )
    expect(onLocate).toHaveBeenCalledWith('c1')
    fireEvent.click(
      within(dialog).getByRole('menuitem', { name: /references\.rowRemove/ }),
    )
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', edgeId: 'e1' }),
    )
  })

  it('a character row offers 添加音色 only when it has no boundVoice yet', () => {
    const onAddVoice = vi.fn()
    renderPanel(
      [
        makeToken({ id: 'c1', label: '无音色角色' }),
        makeToken({
          id: 'c2',
          label: '有音色角色',
          token: '@有音色角色',
          boundVoice: { nodeId: 'v1', label: '男声', ready: true },
        }),
      ],
      { onAddVoice },
    )
    const dialog = openManager()
    const addVoiceItems = within(dialog).getAllByText(/references\.addVoice/)
    expect(addVoiceItems).toHaveLength(1)
    fireEvent.click(addVoiceItems[0])
    expect(onAddVoice).toHaveBeenCalledWith('c1')
  })

  it('a character row always offers 添加特写', () => {
    const onAddCloseup = vi.fn()
    renderPanel([makeToken({ id: 'c1' })], { onAddCloseup })
    const dialog = openManager()
    fireEvent.click(within(dialog).getByText(/references\.addCloseup/))
    expect(onAddCloseup).toHaveBeenCalledWith('c1')
  })
})
