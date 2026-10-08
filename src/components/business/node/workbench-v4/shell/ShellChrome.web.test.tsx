/**
 * @vitest-environment jsdom
 *
 * S7 外壳的**行为快照**：项目胶囊与切换弹层、左侧面板（六格：原型四格 + 角色 / 素材库）、三条加节点路、
 * ⌘K、底栏、助手 dock 收放与宽度、快捷键。
 *
 * ⚠ 只证「点了会调什么」，不证画板像素：对稿在真机验收里逐项比。
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// cmdk 挂 ResizeObserver；jsdom 没有，补一个空壳（⛔ 不为此把面板换成手写列表）。
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ relativeTime: () => 'relative' }),
}))

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
  }),
  useStore: (selector: (state: { transform: number[] }) => unknown) =>
    selector({ transform: [0, 0, 0.8] }),
}))

vi.mock('../../CastDock', () => ({
  CastDock: ({ query }: { query: string }) => (
    <div data-testid="cast-dock">{query}</div>
  ),
}))
const mockLibrary = vi.hoisted(() => ({
  value: { cards: [] as unknown[], loaded: true },
}))
vi.mock('@/hooks/cards/use-character-library', () => ({
  useCharacterLibrary: () => mockLibrary.value,
}))
/**
 * `Command`（cmdk）整包桩成朴素列表。
 *
 * ⚠ 不是为了省事：cmdk 首绘会对选中项调 `scrollIntoView`，而 jsdom 没有它、
 * 且本文件里改 `Element.prototype` 改不到渲染出来的那个 realm（实测三种写法都
 * 没生效）。本组要断言的是**面板列了哪几组、点了调什么**，键盘导航是 cmdk 自己
 * 的事，⛔ 不为它把断言降级成「渲染没崩」。
 */
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: (props: Record<string, unknown>) => (
    <input data-testid={props['data-testid'] as string} />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: () => null,
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandItem: (props: Record<string, unknown>) => (
    <button
      type="button"
      data-testid={props['data-testid'] as string}
      onClick={props.onSelect as () => void}
    >
      {props.children as React.ReactNode}
    </button>
  ),
}))

vi.mock('@/hooks/use-projects', () => ({
  useProjects: () => ({
    projects: [
      { id: 'folder-parent', name: '角色', parentId: null },
      { id: 'folder-child', name: '时夜', parentId: 'folder-parent' },
    ],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

/** 「减少动态效果」由用例自己拨；默认 `false`，与 jsdom 里没有 matchMedia 时一致。 */
const motionPreference = vi.hoisted(() => ({ reduced: false }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motionPreference.reduced,
}))

import { CANVAS_ADD_INTENT_IDS } from '@/constants/canvas-add-catalog'
import {
  CANVAS_SHELL_PANEL_IDS,
  type CanvasShellPanelId,
} from '@/constants/canvas-shell'
import { LIQUID_TIMING } from '@/constants/motion'
import { NODE_STUDIO_TOOL_MODE_IDS } from '@/constants/node-studio'
import { fetchGalleryImages } from '@/lib/api-client'
import {
  notifyGalleryChanged,
  resetGalleryRevision,
} from '@/lib/gallery-revision'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { GenerationRecord } from '@/types'
import type { NodeWorkflowProjectSummary } from '@/types/node-workflow'

import { useWorkbenchShortcutsV4 } from '../WorkbenchShortcutsV4'
import { ShellBottomBar } from './ShellBottomBar'
import { ShellPaneMenu, ShellQuickAdd } from './ShellCanvasMenus'
import { ShellCommandPalette } from './ShellCommandPalette'
import { ShellSidePanels } from './ShellSidePanels'
import { ShellProjectPill } from './ShellProjectPill'

/** 「当前项目」/「历史对话」两格的内容由宿主给；这里只证面板把它们摆进来。 */
const PANEL_SLOT_PROPS = {
  onAddNode: vi.fn(),
  projectPanel: <div data-testid="project-slot" />,
  historyPanel: <div data-testid="history-slot" />,
}

const PROJECTS: NodeWorkflowProjectSummary[] = [
  {
    id: 'p1',
    name: '拟人剧场',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
    nodeCount: 19,
  },
  {
    id: 'p2',
    name: '视频素材',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    nodeCount: 13,
  },
]

describe('ShellProjectPill · 项目胶囊与切换弹层', () => {
  function renderPill(
    overrides: Partial<Parameters<typeof ShellProjectPill>[0]> = {},
  ) {
    const props = {
      projectName: '拟人剧场',
      projects: PROJECTS,
      currentProjectId: 'p1',
      isSaving: false,
      onSwitchProject: vi.fn(),
      onCreateProject: vi.fn(),
      onRenameProject: vi.fn(),
      onDuplicateProject: vi.fn(),
      onDeleteProject: vi.fn(),
      ...overrides,
    }
    render(<ShellProjectPill {...props} />)
    return props
  }

  it('点胶囊开弹层，列出全部项目', () => {
    renderPill()
    fireEvent.click(screen.getByTestId('shell-project-pill'))
    expect(screen.getAllByTestId('shell-project-row')).toHaveLength(2)
  })

  it('搜索只留匹配的那一行', () => {
    renderPill()
    fireEvent.click(screen.getByTestId('shell-project-pill'))
    fireEvent.change(screen.getByTestId('shell-project-search'), {
      target: { value: '视频' },
    })
    const rows = screen.getAllByTestId('shell-project-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('视频素材')
  })

  it('点一行切项目、点新建走建项目', () => {
    const props = renderPill()
    fireEvent.click(screen.getByTestId('shell-project-pill'))
    fireEvent.click(
      screen.getAllByTestId('shell-project-row')[1] as HTMLElement,
    )
    expect(props.onSwitchProject).toHaveBeenCalledWith('p2')

    fireEvent.click(screen.getByTestId('shell-project-pill'))
    fireEvent.click(screen.getByTestId('shell-project-create'))
    expect(props.onCreateProject).toHaveBeenCalled()
  })
})

describe('ShellSidePanels · 六格（原型四格 + 角色 / 素材库）', () => {
  function renderPanels() {
    const props = {
      activePanel: null as null | CanvasShellPanelId,
      onActivePanelChange: vi.fn(),
      nodeQuery: '',
      onNodeQueryChange: vi.fn(),
      onUpload: vi.fn(),
      onPlaceMedia: vi.fn(),
      placedCharacterIds: new Set<string>(),
      railVisible: true,
      onPlaceCharacter: vi.fn(),
      ...PANEL_SLOT_PROPS,
    }
    const view = render(<ShellSidePanels {...props} />)
    return { props, view }
  }

  it('兜底图标栏 = 六格（添加节点 / 节点 / 当前项目 / 历史对话 / 角色 / 素材库）', () => {
    renderPanels()
    const rail = screen.getByTestId('shell-side-rail')
    expect(
      Array.from(rail.querySelectorAll('button')).map(
        (button) => button.dataset.testid,
      ),
    ).toEqual([
      'shell-rail-addNode',
      'shell-rail-nodes',
      'shell-rail-project',
      'shell-rail-history',
      'shell-rail-cards',
      'shell-rail-library',
    ])
    expect(screen.queryByTestId('shell-side-panel')).toBeNull()
  })

  it('四格各开各的内容：添加目录 / 节点定位器 / 宿主给的项目与历史', () => {
    const { props, view } = renderPanels()
    view.rerender(
      <ShellSidePanels
        {...props}
        activePanel={CANVAS_SHELL_PANEL_IDS.addNode}
      />,
    )
    expect(screen.getByTestId('shell-add-panel')).toBeTruthy()
    // 全目录（四组十一项）+ 上传 / 从素材库选。
    fireEvent.click(
      screen.getByTestId(`shell-add-${CANVAS_ADD_INTENT_IDS.videoShot}`),
    )
    expect(props.onAddNode).toHaveBeenCalledWith(
      CANVAS_ADD_INTENT_IDS.videoShot,
    )
    fireEvent.click(screen.getByTestId('shell-add-upload'))
    expect(props.onUpload).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('shell-add-library'))
    expect(props.onActivePanelChange).toHaveBeenLastCalledWith(
      CANVAS_SHELL_PANEL_IDS.library,
    )

    for (const [panel, testId] of [
      [CANVAS_SHELL_PANEL_IDS.project, 'project-slot'],
      [CANVAS_SHELL_PANEL_IDS.history, 'history-slot'],
    ] as const) {
      cleanup()
      render(<ShellSidePanels {...props} activePanel={panel} />)
      expect(screen.getByTestId('shell-side-panel').dataset.panel).toBe(panel)
      expect(screen.getByTestId(testId)).toBeTruthy()
    }
  })

  it('开着的是角色那一格：栏上只有它亮着', () => {
    const { props, view } = renderPanels()
    view.rerender(
      <ShellSidePanels {...props} activePanel={CANVAS_SHELL_PANEL_IDS.cards} />,
    )
    expect(screen.getByTestId('shell-side-panel').dataset.panel).toBe('cards')
    expect(
      screen.getByTestId('shell-rail-cards').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByTestId('shell-rail-nodes').getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('点图标开面板；再点同一个收起', () => {
    const { props, view } = renderPanels()
    fireEvent.click(screen.getByTestId('shell-rail-nodes'))
    expect(props.onActivePanelChange).toHaveBeenCalledWith(
      CANVAS_SHELL_PANEL_IDS.nodes,
    )

    view.rerender(
      <ShellSidePanels {...props} activePanel={CANVAS_SHELL_PANEL_IDS.nodes} />,
    )
    expect(screen.getByTestId('shell-side-panel').dataset.panel).toBe('nodes')
    expect(screen.getByTestId('cast-dock')).toBeTruthy()

    fireEvent.click(screen.getByTestId('shell-rail-nodes'))
    expect(props.onActivePanelChange).toHaveBeenLastCalledWith(null)
  })

  it('≥1024 图标栏并进全站侧栏：画布里没有栏，面板贴边距开在侧栏旁边', () => {
    const { props, view } = renderPanels()
    view.rerender(
      <ShellSidePanels
        {...props}
        railVisible={false}
        activePanel={CANVAS_SHELL_PANEL_IDS.nodes}
      />,
    )
    expect(screen.queryByTestId('shell-side-rail')).toBeNull()
    expect(screen.queryByTestId('shell-rail-indicator')).toBeNull()
    const panel = screen.getByTestId('shell-side-panel')
    expect(panel.dataset.panel).toBe('nodes')
    expect(panel.parentElement?.style.left).toBe('16px')
  })
})

/**
 * 液态开合（owner 2026-09-26 定 B）：只证相位、叠放与卸载的时机。
 *
 * ⚠ jsdom 里没有真实的帧，形状的弹簧跑不完 —— 这正是「后台标签页 rAF 冻结」那条
 * 路：展开得靠兜底定时器落到 `open`，收回只认定时器卸载。两条都必须自己走完。
 */
describe('ShellSidePanels · 角色库（画布用角色 ④）', () => {
  const DENIA = {
    id: 'denia',
    name: 'Denia',
    referenceSlots: [
      { id: 's1', url: 'https://cdn.test/denia.png', isPrimary: true },
    ],
    sourceImageUrl: null,
    variants: [],
    cardTags: {
      character: ['denia_(wuthering_waves)'],
      appearance: [],
      loraTrigger: '',
    },
  }

  function renderCards(placed: string[] = []) {
    mockLibrary.value = { cards: [DENIA], loaded: true }
    const props = {
      activePanel: CANVAS_SHELL_PANEL_IDS.cards,
      onActivePanelChange: vi.fn(),
      nodeQuery: '',
      onNodeQueryChange: vi.fn(),
      onUpload: vi.fn(),
      onPlaceMedia: vi.fn(),
      placedCharacterIds: new Set<string>(placed),
      railVisible: true,
      onPlaceCharacter: vi.fn(),
      ...PANEL_SLOT_PROPS,
    }
    render(<ShellSidePanels {...props} />)
    return props
  }

  afterEach(() => {
    mockLibrary.value = { cards: [], loaded: true }
  })

  it('列角色库；点一位 = 交给画布放上去（⛔ 不拖）', () => {
    const props = renderCards()
    const row = screen.getByTestId('shell-card-row')
    expect(row.textContent).toContain('Denia')
    expect(row.getAttribute('draggable')).toBeNull()
    fireEvent.click(row)
    expect(props.onPlaceCharacter).toHaveBeenCalledWith(DENIA)
  })

  it('已在画布上的那一行写「在画布上」', () => {
    renderCards(['denia'])
    expect(screen.getByTestId('shell-card-row').textContent).toContain(
      'cardsOnCanvas',
    )
  })
})

describe('ShellSidePanels · 液态开合', () => {
  const baseProps = {
    onActivePanelChange: vi.fn(),
    nodeQuery: '',
    onNodeQueryChange: vi.fn(),
    onUpload: vi.fn(),
    onPlaceMedia: vi.fn(),
    placedCharacterIds: new Set<string>(),
    railVisible: true,
    onPlaceCharacter: vi.fn(),
    ...PANEL_SLOT_PROPS,
  }

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    motionPreference.reduced = false
  })

  afterEach(() => {
    vi.useRealTimers()
    motionPreference.reduced = false
  })

  it('开 → 切 → 关：切格不收不开、旧内容叠放一拍后摘掉；收起落定前不卸载', () => {
    const view = render(<ShellSidePanels {...baseProps} activePanel={null} />)
    view.rerender(
      <ShellSidePanels
        {...baseProps}
        activePanel={CANVAS_SHELL_PANEL_IDS.nodes}
      />,
    )

    const panel = screen.getByTestId('shell-side-panel')
    expect(panel.dataset.phase).toBe('opening')
    // 动着时不接点击；阴影挂在外层壳上（clip-path 会把 box-shadow 一起裁掉）。
    expect(panel.className).toContain('pointer-events-none')
    expect(panel.parentElement?.style.filter).toContain('drop-shadow')
    // 按下底由栏里那块会滑的底块画，按钮自己不铺；aria-pressed 照旧。
    const railButton = screen.getByTestId('shell-rail-nodes')
    expect(railButton.getAttribute('aria-pressed')).toBe('true')
    expect(railButton.className).not.toContain('bg-node-panel-inner')
    expect(screen.getByTestId('shell-rail-indicator')).toBeTruthy()

    advance(2000)
    expect(panel.dataset.phase).toBe('open')
    expect(panel.className).toContain('pointer-events-auto')
    expect(panel.parentElement?.style.filter).toBe('')

    view.rerender(
      <ShellSidePanels
        {...baseProps}
        activePanel={CANVAS_SHELL_PANEL_IDS.project}
      />,
    )
    // 同一块面板、相位不动 —— 只换内容。
    expect(screen.getByTestId('shell-side-panel')).toBe(panel)
    expect(panel.dataset.phase).toBe('open')
    expect(panel.dataset.panel).toBe('project')
    // 旧内容还叠在下面退场，且不可交互；退场那一拍走完就摘掉。
    expect(screen.getByTestId('cast-dock').closest('[inert]')).not.toBeNull()
    advance(LIQUID_TIMING.swapOutS * 1000)
    expect(screen.queryByTestId('cast-dock')).toBeNull()

    view.rerender(<ShellSidePanels {...baseProps} activePanel={null} />)
    expect(panel.dataset.phase).toBe('closing')
    expect(panel.dataset.panel).toBe('project')
    expect(panel.className).toContain('pointer-events-none')
    expect(
      screen.getByTestId('shell-rail-project').getAttribute('aria-pressed'),
    ).toBe('false')
    // 形状还在收：落定前不卸载。
    advance(
      (LIQUID_TIMING.retractDelayS + LIQUID_TIMING.retractSecondBeatDelayS) *
        1000,
    )
    expect(screen.getByTestId('shell-side-panel')).toBe(panel)
    advance(2000)
    expect(screen.queryByTestId('shell-side-panel')).toBeNull()
  })

  it('减少动态效果：开 / 切 / 关都直切，没有中间档', () => {
    motionPreference.reduced = true
    const view = render(<ShellSidePanels {...baseProps} activePanel={null} />)

    view.rerender(
      <ShellSidePanels
        {...baseProps}
        activePanel={CANVAS_SHELL_PANEL_IDS.nodes}
      />,
    )
    const panel = screen.getByTestId('shell-side-panel')
    expect(panel.dataset.phase).toBe('open')
    expect(panel.className).toContain('pointer-events-auto')
    expect(panel.parentElement?.style.filter).toBe('')

    view.rerender(
      <ShellSidePanels
        {...baseProps}
        activePanel={CANVAS_SHELL_PANEL_IDS.cards}
      />,
    )
    expect(panel.dataset.panel).toBe('cards')
    expect(screen.queryByTestId('cast-dock')).toBeNull()

    view.rerender(<ShellSidePanels {...baseProps} activePanel={null} />)
    expect(screen.queryByTestId('shell-side-panel')).toBeNull()
  })
})

describe('加节点三条路 · 都落在同一份意图表上', () => {
  it('双击空白：五颗小图标（四类 + 上传），点即落卡', () => {
    const onAdd = vi.fn()
    const onUpload = vi.fn()
    render(
      <ShellQuickAdd
        at={{ x: 120, y: 240 }}
        onAdd={onAdd}
        onUpload={onUpload}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByTestId('shell-quick-add').querySelectorAll('button'),
    ).toHaveLength(5)
    fireEvent.click(screen.getByTestId('shell-quick-add-image'))
    expect(onAdd).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageResult)
    fireEvent.click(screen.getByTestId('shell-quick-add-upload'))
    expect(onUpload).toHaveBeenCalled()
  })

  it('右键空白：四类 + 上传 + 粘贴 / 整理 / 适配，共八项', () => {
    const onPaste = vi.fn()
    const onFitView = vi.fn()
    const onUpload = vi.fn()
    render(
      <ShellPaneMenu
        at={{ x: 10, y: 10 }}
        onAdd={vi.fn()}
        onUpload={onUpload}
        onPaste={onPaste}
        onTidyLayout={vi.fn()}
        onFitView={onFitView}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByTestId('shell-pane-menu').querySelectorAll('button'),
    ).toHaveLength(8)
    fireEvent.click(screen.getByTestId('shell-pane-menu-upload'))
    expect(onUpload).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('shell-pane-menu-paste'))
    expect(onPaste).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('shell-pane-menu-fit'))
    expect(onFitView).toHaveBeenCalled()
  })

  it('⌘K：节点定位 · 新建四类 · 上传 · 问助手 · 剪辑台 · 配置渠道 · 切项目', () => {
    const onFocusNode = vi.fn()
    const onOpenEditDesk = vi.fn()
    const onUpload = vi.fn()
    const onManageChannels = vi.fn()
    render(
      <ShellCommandPalette
        open
        onOpenChange={vi.fn()}
        nodes={[
          {
            id: 'n1',
            position: { x: 0, y: 0 },
            data: {
              kind: 'image',
              subtype: 'result',
              name: '站台',
              status: 'idle',
              createdAt: '2026-09-10T00:00:00.000Z',
            },
          },
        ]}
        projects={PROJECTS}
        currentProjectId="p1"
        onFocusNode={onFocusNode}
        onAdd={vi.fn()}
        onUpload={onUpload}
        onAskAssistant={vi.fn()}
        onOpenEditDesk={onOpenEditDesk}
        onSwitchProject={vi.fn()}
        onManageChannels={onManageChannels}
      />,
    )
    expect(screen.getAllByTestId('shell-command-node')).toHaveLength(1)
    expect(screen.getByTestId('shell-command-create-video')).toBeTruthy()
    expect(screen.getByTestId('shell-command-ask')).toBeTruthy()
    expect(screen.getAllByTestId('shell-command-project')).toHaveLength(1)

    fireEvent.click(screen.getByTestId('shell-command-node'))
    expect(onFocusNode).toHaveBeenCalledWith('n1')

    fireEvent.click(screen.getByTestId('shell-command-upload'))
    expect(onUpload).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('shell-command-manage-channels'))
    expect(onManageChannels).toHaveBeenCalled()
  })
})

describe('ShellBottomBar · 无加号', () => {
  function renderBar(activePanel: CanvasShellPanelId | null = null) {
    const props = {
      toolMode: NODE_STUDIO_TOOL_MODE_IDS.hand,
      onToolModeChange: vi.fn(),
      canUndo: true,
      canRedo: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onTidyLayout: vi.fn(),
      activePanel,
      onTogglePanel: vi.fn(),
    }
    render(<ShellBottomBar {...props} />)
    return props
  }

  it('缩放读 RF 的 transform，撤销/重做按可用性置灰', () => {
    const props = renderBar()
    expect(screen.getByTestId('shell-zoom-level').textContent).toBe('80%')
    const bar = screen.getByTestId('shell-bottom-bar')
    // ⛔ 底栏不该再有加号：八颗相机 / 编辑键（缩放百分比不是按钮）；角色 / 素材库已进侧栏。
    expect(bar.querySelectorAll('button')).toHaveLength(8)
    expect(screen.queryByTestId('shell-bottom-cards')).toBeNull()
    fireEvent.click(screen.getByTestId('shell-tool-select'))
    expect(screen.getByTestId('shell-fit-view')).toBeTruthy()
    expect(props.onUndo).not.toHaveBeenCalled()
  })
})

describe('快捷键 · T/I/A/V · ⇧1 · ⌘K · ⌘N', () => {
  const graph = {
    selectedNodeIds: [],
    rfNodes: [],
    clearSelection: vi.fn(),
    moveNodes: vi.fn(),
    copySelection: () => false,
    pasteClipboard: () => false,
    duplicate: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  } as unknown as NodeGraphV4

  function press(init: KeyboardEventInit) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', init))
    })
  }

  it('光秃秃的 I 落一张图片空卡；⇧1 适配；⌘K / ⌘N / ⌘U 各走各的', () => {
    const onQuickAdd = vi.fn()
    const onFitView = vi.fn()
    const onOpenCommandPalette = vi.fn()
    const onCreateProject = vi.fn()
    const onOpenUpload = vi.fn()
    renderHook(() =>
      useWorkbenchShortcutsV4({
        graph,
        onGenerateSelected: vi.fn(),
        onTidyLayout: vi.fn(),
        onQuickAdd,
        onFitView,
        onOpenCommandPalette,
        onCreateProject,
        onOpenUpload,
      }),
    )

    press({ key: 'i', code: 'KeyI' })
    expect(onQuickAdd).toHaveBeenCalledWith(CANVAS_ADD_INTENT_IDS.imageResult)

    press({ key: '!', code: 'Digit1', shiftKey: true })
    expect(onFitView).toHaveBeenCalled()

    press({ key: 'k', code: 'KeyK', metaKey: true })
    expect(onOpenCommandPalette).toHaveBeenCalled()

    press({ key: 'n', code: 'KeyN', metaKey: true })
    expect(onCreateProject).toHaveBeenCalled()

    press({ key: 'u', code: 'KeyU', metaKey: true })
    expect(onOpenUpload).toHaveBeenCalled()
  })
})

/**
 * owner 2026-09-12 真机报的三条：翻不到更多、素材放不进画布、传完库里不变。
 *
 * ⚠ 这里只证**行为**：拉了第几页、点了调什么、库变了会不会重拉。HTML5 拖投不在
 * jsdom 里验（`dragstart` 的原生接管正是那条路不可靠的原因，也是加「点一下」的
 * 理由）—— 拖投由真机目检。
 */
describe('素材库面板 · 翻页 / 点一下落卡 / 传完就变', () => {
  function libraryRecord(id: string): GenerationRecord {
    return {
      id,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      outputType: 'IMAGE',
      status: 'COMPLETED',
      url: `https://cdn.example.com/${id}.png`,
      storageKey: `k/${id}`,
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      prompt: '一段提示词',
      model: 'gpt-image-2',
      provider: 'user-upload',
      requestCount: 1,
      isPublic: false,
      isPromptPublic: false,
    }
  }

  function galleryPage(ids: readonly string[], hasMore: boolean) {
    return {
      success: true,
      data: {
        generations: ids.map(libraryRecord),
        page: 1,
        limit: 24,
        total: null,
        hasMore,
        nextCursor: null,
      },
    }
  }

  function renderLibrary() {
    const props = {
      activePanel: CANVAS_SHELL_PANEL_IDS.library,
      onActivePanelChange: vi.fn(),
      nodeQuery: '',
      onNodeQueryChange: vi.fn(),
      onUpload: vi.fn(),
      onPlaceMedia: vi.fn(),
      placedCharacterIds: new Set<string>(),
      railVisible: true,
      onPlaceCharacter: vi.fn(),
      ...PANEL_SLOT_PROPS,
    }
    render(<ShellSidePanels {...props} />)
    return props
  }

  /** 面板的拉取走 `deferEffectTask`（setTimeout 0）＋ 一个 Promise。 */
  async function settle() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  beforeEach(() => {
    resetGalleryRevision()
    vi.mocked(fetchGalleryImages).mockClear()
  })

  it('合并后的素材库请求全部个人产物，不再只筛上传', async () => {
    vi.mocked(fetchGalleryImages).mockResolvedValue(
      galleryPage(['generated', 'uploaded'], false),
    )
    renderLibrary()
    await settle()
    expect(fetchGalleryImages).toHaveBeenCalledWith(1, 24, { mine: true })
    expect(screen.getAllByTestId('shell-library-tile')).toHaveLength(2)
  })

  it('支持嵌套文件夹筛选，切换后清空旧页并保留类型筛选', async () => {
    vi.mocked(fetchGalleryImages).mockResolvedValue(galleryPage(['old'], true))
    renderLibrary()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'libraryVideo' }))
    await settle()
    fireEvent.click(screen.getByTestId('shell-library-folders'))
    fireEvent.click(
      screen.getByRole('button', { name: '角色', expanded: false }),
    )
    vi.mocked(fetchGalleryImages).mockResolvedValue(
      galleryPage(['child'], false),
    )
    fireEvent.click(screen.getByRole('button', { name: '时夜' }))
    await settle()
    expect(fetchGalleryImages).toHaveBeenLastCalledWith(1, 24, {
      mine: true,
      type: ['video'],
      projectId: 'folder-child',
    })
    expect(screen.getByTestId('shell-library-folders').textContent).toBe(
      '角色 / 时夜',
    )
    expect(screen.getAllByTestId('shell-library-tile')).toHaveLength(1)
    expect(
      screen.getByTestId('shell-library-tile').getAttribute('title'),
    ).toBeTruthy()
  })

  it('未分类范围使用素材库现有 none 契约', async () => {
    vi.mocked(fetchGalleryImages).mockResolvedValue(galleryPage([], false))
    renderLibrary()
    await settle()
    fireEvent.click(screen.getByTestId('shell-library-folders'))
    fireEvent.click(screen.getByRole('button', { name: 'sidebarUnassigned' }))
    await settle()
    expect(fetchGalleryImages).toHaveBeenLastCalledWith(1, 24, {
      mine: true,
      projectId: 'none',
    })
  })

  it('失败显示重试，重试仍读取原页', async () => {
    vi.mocked(fetchGalleryImages)
      .mockResolvedValueOnce({ success: false, error: 'unavailable' })
      .mockResolvedValue(galleryPage(['recovered'], false))
    renderLibrary()
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'libraryLoadFailed' }))
    await settle()
    expect(screen.getAllByTestId('shell-library-tile')).toHaveLength(1)
    expect(fetchGalleryImages).toHaveBeenLastCalledWith(1, 24, { mine: true })
  })

  it('点一格素材 = 落到画布（⛔ 不只有拖投那一条路）', async () => {
    vi.mocked(fetchGalleryImages).mockResolvedValue(
      galleryPage(['a', 'b', 'c'], false),
    )
    const props = renderLibrary()
    await settle()

    const tiles = screen.getAllByTestId('shell-library-tile')
    expect(tiles).toHaveLength(3)
    fireEvent.click(tiles[0] as HTMLElement)
    expect(props.onPlaceMedia).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example.com/a.png' }),
    )
  })

  it('落卡带上真实像素（⛔ 不让竖图退回 16:9 被裁）', async () => {
    vi.mocked(fetchGalleryImages).mockResolvedValue(galleryPage(['a'], false))
    const props = renderLibrary()
    await settle()

    fireEvent.click(screen.getByTestId('shell-library-tile'))
    expect(props.onPlaceMedia).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 1024 }),
    )
  })

  /**
   * owner 2026-09-12：「图片移动的时候出现的这个小图删掉」—— 那是浏览器给拖拽画的
   * 默认拖影（源元素的截图）。载荷照旧上车，只是不再画那张小图。
   */
  it('拖起来不画默认拖影，载荷照旧带全', async () => {
    vi.mocked(fetchGalleryImages).mockResolvedValue(galleryPage(['a'], false))
    renderLibrary()
    await settle()

    const setData = vi.fn()
    const setDragImage = vi.fn()
    fireEvent.dragStart(screen.getByTestId('shell-library-tile'), {
      dataTransfer: { setData, setDragImage, effectAllowed: 'none' },
    })

    expect(setDragImage).toHaveBeenCalled()
    const payload: unknown = JSON.parse(String(setData.mock.calls[0]?.[1]))
    expect(payload).toMatchObject({
      url: 'https://cdn.example.com/a.png',
      width: 1024,
      height: 1024,
    })
  })

  it('还有下一页就出「加载更多」，点了往后接（⛔ 不重头替换）', async () => {
    vi.mocked(fetchGalleryImages)
      .mockResolvedValueOnce(galleryPage(['a', 'b'], true))
      .mockResolvedValueOnce(galleryPage(['c'], false))
    renderLibrary()
    await settle()
    expect(screen.getAllByTestId('shell-library-tile')).toHaveLength(2)

    fireEvent.click(screen.getByTestId('shell-library-more'))
    await settle()

    expect(screen.getAllByTestId('shell-library-tile')).toHaveLength(3)
    expect(vi.mocked(fetchGalleryImages).mock.calls[1]?.[0]).toBe(2)
    // 拉到底了就不再摆那颗键。
    expect(screen.queryByTestId('shell-library-more')).toBeNull()
  })

  it('传完东西库里跟着变（`notifyGalleryChanged` 回到第一页重拉）', async () => {
    vi.mocked(fetchGalleryImages).mockResolvedValue(galleryPage(['a'], false))
    renderLibrary()
    await settle()
    expect(screen.getAllByTestId('shell-library-tile')).toHaveLength(1)

    vi.mocked(fetchGalleryImages).mockResolvedValue(
      galleryPage(['a', 'b'], false),
    )
    await act(async () => {
      notifyGalleryChanged()
    })
    await settle()

    expect(screen.getAllByTestId('shell-library-tile')).toHaveLength(2)
    expect(vi.mocked(fetchGalleryImages)).toHaveBeenCalledTimes(2)
  })
})
