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
    imageOverflow: Map<string, string | undefined>
    assembledImageCount: number
    onToggleStage: (
      token: ComposerReferenceToken,
      assetUrl: string,
      checked: boolean,
    ) => void
    onRestoreDefaultStage: (token: ComposerReferenceToken) => void
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
      imageOverflow={overrides?.imageOverflow}
      assembledImageCount={overrides?.assembledImageCount}
      onToggleStage={overrides?.onToggleStage}
      onRestoreDefaultStage={overrides?.onRestoreDefaultStage}
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

  // R3-6b §1 容量透明: the warning is now driven by `imageOverflow` (the
  // ACTUAL assembleReferenceImagePayload output passed down from
  // useVideoComposer's sendPreview), not a recomputed referenced-token tally
  // — a truncated candidate never even needs to be "referenced" to count.
  it('shows the capacity warning when imageOverflow reports truncated candidates', () => {
    renderPanel(
      [
        makeToken({ id: 'c1', kind: 'character' }),
        makeToken({ id: 'c2', kind: 'character', label: 'B', token: '@B' }),
      ],
      {
        referencedTokenIds: new Set(['c1', 'c2']),
        maxReferenceImages: 1,
        assembledImageCount: 1,
        imageOverflow: new Map([['https://cdn.test/b.png', 'B']]),
      },
    )
    expect(screen.getByText('references.capacityWarning')).toBeInTheDocument()
  })

  it('omits the capacity warning when imageOverflow is empty/undefined', () => {
    renderPanel([makeToken({ id: 'c1' })], {
      referencedTokenIds: new Set(['c1']),
      maxReferenceImages: 1,
    })
    expect(
      screen.queryByText('references.capacityWarning'),
    ).not.toBeInTheDocument()
  })

  it('shows the N/max ⚠ overflow counter in place of the referenced/connected counter', () => {
    renderPanel([makeToken({ id: 'c1' })], {
      referencedTokenIds: new Set(['c1']),
      maxReferenceImages: 9,
      assembledImageCount: 9,
      imageOverflow: new Map([['https://cdn.test/extra.png', undefined]]),
    })
    expect(screen.getByText('references.counterOverflow')).toBeInTheDocument()
    expect(screen.queryByText('references.counter')).not.toBeInTheDocument()
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

  // A5 (canvas-relationship-v3 §7b): the drawer's per-tab ＋ (TabAddButtons,
  // hidden unless the matching list tab was active) became a persistent
  // bottom PanelAddBar — every add button is always there, grouped by media
  // type, regardless of which list tab is selected. These three tests now
  // cover "always there" instead of "tab-gated".
  it('the 角色 add button fires onAddReference with a character role', () => {
    const onAddReference = vi.fn()
    renderPanel([], { onAddReference })
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'references.addButtons.character',
      }),
    )
    expect(onAddReference).toHaveBeenCalledWith(
      expect.objectContaining({ nodeType: 'image', role: 'character' }),
    )
  })

  it('the shot image + reference video add buttons both fire onAddReference, unaffected by the active list tab', () => {
    const onAddReference = vi.fn()
    renderPanel([], { onAddReference })
    const dialog = openManager()
    selectTab(dialog, 'references.tabs.voice')
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

  it('shows all five add buttons on the 全部 tab too — the bar is a persistent bottom bar, not tab-gated', () => {
    renderPanel([], { onAddReference: vi.fn() })
    const dialog = openManager()
    expect(
      within(dialog).getAllByRole('button', {
        name: /references\.addButtons/,
      }),
    ).toHaveLength(5)
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

// A5 (canvas-relationship-v3 §7b): the drawer's flat row list now splits into
// "folder" rows (character/background collectors, expandable gallery
// preview) and "file" rows (everything else — shot/keyframe/closeup/voice/
// video, single asset, insert-only). Data model is untouched (素材三同权
// already held); this only covers the new row-shape branching.
describe('ReferenceManagerPanel drawer folder rows (A5 文件夹/文件)', () => {
  it('a character/background token renders a collapsed folder row with an expand toggle', () => {
    renderPanel([
      makeToken({ id: 'c1', kind: 'character', label: '角色A' }),
      makeToken({
        id: 'b1',
        kind: 'background',
        label: '教室',
        token: '@教室',
      }),
    ])
    const dialog = openManager()
    // Both collector rows (character + background) get their own expand toggle.
    expect(
      within(dialog).getAllByRole('button', {
        name: 'references.folderExpand',
      }),
    ).toHaveLength(2)
  })

  it('a file-kind token (shot/voice/video/closeup) gets no expand toggle', () => {
    renderPanel([
      makeToken({ id: 's1', kind: 'shot', label: '远景', token: '@远景' }),
      makeToken({ id: 'a1', kind: 'voice', label: '旁白', token: '@Audio1' }),
    ])
    const dialog = openManager()
    expect(
      within(dialog).queryByRole('button', {
        name: 'references.folderExpand',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows the gallery count in the row head and starts collapsed (.node-collapsible, data-open unset)', () => {
    renderPanel([
      makeToken({
        id: 'c1',
        kind: 'character',
        label: '角色A',
        galleryAssets: [
          { id: 'g1', url: 'https://cdn.test/g1.png', isPrimary: true },
          { id: 'g2', url: 'https://cdn.test/g2.png' },
        ],
      }),
    ])
    const dialog = openManager()
    expect(
      within(dialog).getByText('references.galleryCount'),
    ).toBeInTheDocument()
    // .node-collapsible (globals.css) is a CSS-only height collapse — the grid
    // markup stays mounted for a smooth expand, it just has zero visual height
    // until `data-open` is set. Assert the collapsed state via that attribute,
    // not by asserting the (still-mounted) thumbnails are absent.
    expect(dialog.querySelector('.node-collapsible')).not.toHaveAttribute(
      'data-open',
    )
  })

  it('expanding the folder row reveals its gallery thumbnails, primary starred', () => {
    renderPanel([
      makeToken({
        id: 'c1',
        kind: 'character',
        label: '角色A',
        galleryAssets: [
          { id: 'g1', url: 'https://cdn.test/g1.png', isPrimary: true },
          { id: 'g2', url: 'https://cdn.test/g2.png' },
        ],
      }),
    ])
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.folderExpand' }),
    )
    const thumbs = Array.from(dialog.querySelectorAll('img'))
    expect(thumbs).toHaveLength(2)
    expect(thumbs[0]).toHaveAttribute('src', 'https://cdn.test/g1.png')
  })

  // R3-6a §4: read-only mirror of the 〈出场〉章 — marks a NON-primary onStage
  // extra; the primary's own ★ badge already implies it, so no double-marking.
  it('R3-6a: marks a non-primary onStage gallery extra, not the primary', () => {
    renderPanel([
      makeToken({
        id: 'c1',
        kind: 'character',
        label: '角色A',
        galleryAssets: [
          { id: 'g1', url: 'https://cdn.test/g1.png', isPrimary: true },
          { id: 'g2', url: 'https://cdn.test/g2.png', onStage: true },
          { id: 'g3', url: 'https://cdn.test/g3.png' },
        ],
      }),
    ])
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.folderExpand' }),
    )
    expect(
      within(dialog).getAllByTitle('references.onStageBadge'),
    ).toHaveLength(1)
  })

  it('an empty gallery shows the empty hint instead of a grid', () => {
    renderPanel([makeToken({ id: 'c1', kind: 'character', label: '角色A' })])
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.folderExpand' }),
    )
    expect(
      within(dialog).getAllByText('references.galleryEmpty').length,
    ).toBeGreaterThan(0)
  })

  it('a character folder row shows the 已绑音色 badge only when boundVoice is set', () => {
    renderPanel([
      makeToken({
        id: 'c1',
        kind: 'character',
        label: '有音色',
        boundVoice: { nodeId: 'v1', label: '男声', ready: true },
      }),
      makeToken({
        id: 'c2',
        kind: 'character',
        label: '无音色',
        token: '@无音色',
      }),
    ])
    const dialog = openManager()
    expect(
      within(dialog).getAllByText('references.voiceBoundBadge'),
    ).toHaveLength(1)
  })
})

// R3-6b §1 容量透明: overflow badges on the actual thumbnails, driven purely
// by `imageOverflow` (no second truncation calculation inside the panel).
describe('ReferenceManagerPanel overflow badges (R3-6b §1)', () => {
  it('a file-row (ManagerRow) thumbnail whose mediaUrl is in imageOverflow gets the 不会发送 hint', () => {
    renderPanel(
      [
        makeToken({
          id: 's1',
          kind: 'shot',
          label: '远景',
          token: '@远景',
          mediaUrl: 'https://cdn.test/shot.png',
        }),
      ],
      { imageOverflow: new Map([['https://cdn.test/shot.png', '远景']]) },
    )
    const dialog = openManager()
    expect(
      within(dialog).getAllByText('references.willNotSendHint').length,
    ).toBeGreaterThan(0)
  })

  it('a file-row thumbnail NOT in imageOverflow gets no hint', () => {
    renderPanel(
      [
        makeToken({
          id: 's1',
          kind: 'shot',
          label: '远景',
          token: '@远景',
          mediaUrl: 'https://cdn.test/shot.png',
        }),
      ],
      { imageOverflow: new Map([['https://cdn.test/other.png', undefined]]) },
    )
    const dialog = openManager()
    expect(
      within(dialog).queryByText('references.willNotSendHint'),
    ).not.toBeInTheDocument()
  })

  it('a folder gallery thumbnail whose url is in imageOverflow gets the ⚠ corner badge', () => {
    renderPanel(
      [
        makeToken({
          id: 'c1',
          kind: 'character',
          label: '角色A',
          galleryAssets: [
            { id: 'g1', url: 'https://cdn.test/g1.png', isPrimary: true },
            { id: 'g2', url: 'https://cdn.test/g2.png', onStage: true },
          ],
        }),
      ],
      { imageOverflow: new Map([['https://cdn.test/g2.png', 'A']]) },
    )
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.folderExpand' }),
    )
    expect(
      within(dialog).getAllByTitle('references.willNotSendHint'),
    ).toHaveLength(1)
  })
})

// R3-6b §3 每镜覆写: per-thumbnail 出场 checkbox + 恢复默认.
describe('ReferenceManagerPanel stage override UI (R3-6b §3)', () => {
  it('the primary gallery thumbnail always shows a checked, disabled checkbox', () => {
    renderPanel([
      makeToken({
        id: 'c1',
        kind: 'character',
        label: '角色A',
        edgeId: 'e-char',
        galleryAssets: [
          {
            id: 'g1',
            url: 'https://cdn.test/g1.png',
            isPrimary: true,
            stagedForVideo: true,
          },
        ],
      }),
    ])
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.folderExpand' }),
    )
    const checkbox = within(dialog).getByRole('checkbox', {
      name: 'references.stageCheckboxLabel',
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(true)
  })

  it('a non-primary thumbnail checkbox reflects stagedForVideo and toggling calls onToggleStage', () => {
    const onToggleStage = vi.fn()
    renderPanel(
      [
        makeToken({
          id: 'c1',
          kind: 'character',
          label: '角色A',
          edgeId: 'e-char',
          galleryAssets: [
            {
              id: 'g1',
              url: 'https://cdn.test/g1.png',
              isPrimary: true,
              stagedForVideo: true,
            },
            {
              id: 'g2',
              url: 'https://cdn.test/g2.png',
              stagedForVideo: false,
            },
          ],
        }),
      ],
      { onToggleStage },
    )
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.folderExpand' }),
    )
    const checkboxes = within(dialog).getAllByRole('checkbox', {
      name: 'references.stageCheckboxLabel',
    }) as HTMLInputElement[]
    // Second checkbox is the non-primary extra, unchecked.
    expect(checkboxes[1].checked).toBe(false)
    fireEvent.click(checkboxes[1])
    expect(onToggleStage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      'https://cdn.test/g2.png',
      true,
    )
  })

  it('no checkbox renders on a non-primary thumbnail when onToggleStage is not supplied', () => {
    renderPanel([
      makeToken({
        id: 'c1',
        kind: 'character',
        label: '角色A',
        edgeId: 'e-char',
        galleryAssets: [
          { id: 'g1', url: 'https://cdn.test/g1.png', isPrimary: true },
          { id: 'g2', url: 'https://cdn.test/g2.png' },
        ],
      }),
    ])
    const dialog = openManager()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'references.folderExpand' }),
    )
    // Only the primary's forced checkbox exists — no interactive checkbox for
    // the non-primary extra without a handler.
    expect(
      within(dialog).getAllByRole('checkbox', {
        name: 'references.stageCheckboxLabel',
      }),
    ).toHaveLength(1)
  })

  it('the 恢复默认 button only shows when stageOverrideActive is true, and calls onRestoreDefaultStage', () => {
    const onRestoreDefaultStage = vi.fn()
    renderPanel(
      [
        makeToken({
          id: 'c1',
          kind: 'character',
          label: '角色A',
          edgeId: 'e-char',
          stageOverrideActive: true,
        }),
      ],
      { onRestoreDefaultStage },
    )
    const dialog = openManager()
    const restoreButton = within(dialog).getByRole('button', {
      name: 'references.restoreDefaultStage',
    })
    fireEvent.click(restoreButton)
    expect(onRestoreDefaultStage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
    )
  })

  it('the 恢复默认 button is absent when stageOverrideActive is false', () => {
    renderPanel(
      [
        makeToken({
          id: 'c1',
          kind: 'character',
          label: '角色A',
          edgeId: 'e-char',
          stageOverrideActive: false,
        }),
      ],
      { onRestoreDefaultStage: vi.fn() },
    )
    const dialog = openManager()
    expect(
      within(dialog).queryByRole('button', {
        name: 'references.restoreDefaultStage',
      }),
    ).not.toBeInTheDocument()
  })
})
