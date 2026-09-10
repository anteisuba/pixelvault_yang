/**
 * @vitest-environment jsdom
 *
 * S7 外壳的**行为快照**：项目胶囊与切换弹层、左侧四面板开关、三条加节点路、
 * ⌘K、底栏、助手 dock 收放与宽度、快捷键。
 *
 * ⚠ 只证「点了会调什么」，不证画板像素：对稿在真机验收里逐项比。
 */
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// cmdk 挂 ResizeObserver；jsdom 没有，补一个空壳（⛔ 不为此把面板换成手写列表）。
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver

vi.mock('next-intl', () => ({
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
vi.mock('@/hooks/use-context-cards', () => ({
  useContextCards: () => ({ cards: [], isLoading: false }),
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

vi.mock('@/lib/api-client', () => ({
  fetchGalleryImages: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

import { CANVAS_ADD_INTENT_IDS } from '@/constants/canvas-add-catalog'
import {
  CANVAS_SHELL_ASSISTANT,
  CANVAS_SHELL_PANEL_IDS,
} from '@/constants/canvas-shell'
import { NODE_STUDIO_TOOL_MODE_IDS } from '@/constants/node-studio'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeWorkflowProjectSummary } from '@/types/node-workflow'

import { useWorkbenchShortcutsV4 } from '../WorkbenchShortcutsV4'
import { ShellAssistantFrame } from './ShellAssistantFrame'
import { ShellBottomBar } from './ShellBottomBar'
import { ShellPaneMenu, ShellQuickAdd } from './ShellCanvasMenus'
import { ShellCommandPalette } from './ShellCommandPalette'
import { ShellSidePanels } from './ShellSidePanels'
import { ShellProjectPill } from './ShellProjectPill'

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

describe('ShellSidePanels · 四面板', () => {
  function renderPanels() {
    const props = {
      activePanel: null as null | (typeof CANVAS_SHELL_PANEL_IDS)['nodes'],
      onActivePanelChange: vi.fn(),
      nodeQuery: '',
      onNodeQueryChange: vi.fn(),
      onUpload: vi.fn(),
    }
    const view = render(<ShellSidePanels {...props} />)
    return { props, view }
  }

  it('图标栏四项，默认全收（面板不在场）', () => {
    renderPanels()
    expect(screen.getByTestId('shell-rail-nodes')).toBeTruthy()
    expect(screen.getByTestId('shell-rail-cards')).toBeTruthy()
    expect(screen.getByTestId('shell-rail-library')).toBeTruthy()
    expect(screen.getByTestId('shell-rail-history')).toBeTruthy()
    expect(screen.queryByTestId('shell-side-panel')).toBeNull()
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
  it('缩放读 RF 的 transform，撤销/重做按可用性置灰', () => {
    const onUndo = vi.fn()
    render(
      <ShellBottomBar
        toolMode={NODE_STUDIO_TOOL_MODE_IDS.hand}
        onToolModeChange={vi.fn()}
        canUndo
        canRedo={false}
        onUndo={onUndo}
        onRedo={vi.fn()}
        onTidyLayout={vi.fn()}
      />,
    )
    expect(screen.getByTestId('shell-zoom-level').textContent).toBe('80%')
    const bar = screen.getByTestId('shell-bottom-bar')
    // ⛔ 底栏不该再有加号：按钮总数是固定的八颗（缩放百分比不是按钮）。
    expect(bar.querySelectorAll('button')).toHaveLength(8)
    fireEvent.click(screen.getByTestId('shell-tool-select'))
    expect(screen.getByTestId('shell-fit-view')).toBeTruthy()
    expect(onUndo).not.toHaveBeenCalled()
  })
})

describe('ShellAssistantFrame · 收放与宽度', () => {
  it('开着时钉宽并给出拖宽把手', () => {
    render(
      <ShellAssistantFrame
        open
        showStrip
        width={CANVAS_SHELL_ASSISTANT.defaultWidthPx}
        onWidthChange={vi.fn()}
        onOpen={vi.fn()}
      >
        <div data-testid="dock" />
      </ShellAssistantFrame>,
    )
    const frame = screen.getByTestId('shell-assistant-frame')
    expect(frame.style.width).toBe(`${CANVAS_SHELL_ASSISTANT.defaultWidthPx}px`)
    expect(screen.getByTestId('shell-assistant-resize')).toBeTruthy()
  })

  it('收起后只剩一条；从没开过则连那一条都没有', () => {
    const onOpen = vi.fn()
    const { rerender } = render(
      <ShellAssistantFrame
        open={false}
        showStrip
        width={CANVAS_SHELL_ASSISTANT.defaultWidthPx}
        onWidthChange={vi.fn()}
        onOpen={onOpen}
      >
        <div data-testid="dock" />
      </ShellAssistantFrame>,
    )
    fireEvent.click(screen.getByTestId('shell-assistant-strip'))
    expect(onOpen).toHaveBeenCalled()

    rerender(
      <ShellAssistantFrame
        open={false}
        showStrip={false}
        width={CANVAS_SHELL_ASSISTANT.defaultWidthPx}
        onWidthChange={vi.fn()}
        onOpen={onOpen}
      >
        <div data-testid="dock" />
      </ShellAssistantFrame>,
    )
    expect(screen.queryByTestId('shell-assistant-strip')).toBeNull()
  })

  it('手机档不钉宽（dock 自己是贴底抽屉）', () => {
    render(
      <ShellAssistantFrame
        open
        showStrip={false}
        width={undefined}
        onWidthChange={vi.fn()}
        onOpen={vi.fn()}
      >
        <div data-testid="dock" />
      </ShellAssistantFrame>,
    )
    expect(screen.queryByTestId('shell-assistant-frame')).toBeNull()
    expect(screen.getByTestId('dock')).toBeTruthy()
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
