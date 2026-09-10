import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

vi.mock('@xyflow/react', () => ({
  // S6e：卡壳从 RF 拿自己的 id（拖线反馈）。桩里给一个固定值就够。
  useNodeId: () => 'node-1',
  Handle: (props: Record<string, unknown>) => (
    <span
      data-testid="handle"
      data-slot={props['data-slot'] as string}
      data-output={props['data-output'] as string}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top' },
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-testid="node-toolbar">{props.children as ReactNode}</div>
    ) : null,
}))

// 模型 chip 要 API key 上下文；本组测试断言的是「栏上有没有这颗 chip」，
// ⛔ 不把整条 key 供数链拉进来。
vi.mock(
  '@/components/business/studio-shared/pickers/ModelPickerPopover',
  () => ({
    ModelPickerPopover: () => <button type="button" data-chip="model" />,
  }),
)

/**
 * 本组测试断言的是**本片的接线**（哪一键接哪个回调），所以把工具条那层壳桩掉：
 * 玻璃胶囊 / tooltip / 子菜单是 `chrome/NodeToolbar` 自己的事，回归闸在
 * `chrome/NodeToolbar.test.tsx`。
 */
vi.mock('./chrome/NodeToolbar', () => ({
  NodeToolbar: ({
    groups,
    ariaLabel,
  }: {
    groups: readonly (readonly {
      id: string
      label: string
      onSelect: () => void
      menu?: ReactNode
      panel?: ReactNode
    }[])[]
    ariaLabel: string
  }) => (
    <div role="toolbar" aria-label={ariaLabel}>
      {groups.flat().map((action) => (
        <div key={action.id}>
          <button
            type="button"
            data-toolbar-action={action.id}
            data-has-menu={action.menu ? 'true' : undefined}
            data-has-panel={action.panel ? 'true' : undefined}
            onClick={action.onSelect}
          />
          {/* 子菜单 / 面板在真壳里要点开才有；桩里常驻渲染，本组要断言的是
              「哪一键接哪份内容」。 */}
          {action.menu}
          {action.panel}
        </div>
      ))}
    </div>
  ),
}))

/**
 * ⋯ 菜单的项在真壳里长在 Radix 的 `Menu` 上下文里；本组要断言的是「⋯ 里有哪几项、
 * 各接哪个回调」，所以把菜单原语换成裸按钮。⛔ 不为此在被测组件里加测试专用分支。
 */
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    variant,
    ...attrs
  }: {
    children: ReactNode
    onSelect?: () => void
    disabled?: boolean
    /** 真壳的 `variant="destructive"` 不是 DOM 属性，桩里丢掉。 */
    variant?: string
  }) => (
    <button
      type="button"
      disabled={disabled}
      data-variant={variant}
      onClick={onSelect}
      {...attrs}
    >
      {children}
    </button>
  ),
}))

/**
 * 「拆成多段」自带一条动作总线依赖（`useNodeCanvasActions`），真壳里它**只在菜单
 * 真的打开时**才挂载；桩工具条把菜单常驻渲染，所以这里把这一项换成裸按钮。
 */
vi.mock('./text/TextSplitMenuItem', () => ({
  TextSplitMenuItem: () => <button type="button" data-menu-action="split" />,
}))

vi.mock('@/hooks/use-llm-route-picker', () => ({
  useLLMRoutePicker: () => ({
    savedRoutes: [],
    lockedRoutes: [],
    allRoutes: [],
    healthMap: {},
  }),
}))

import { NODE_V4_CARD } from '@/constants/node-studio'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'
import { TextNodeV4 } from './TextNodeV4'
import { takeCanvasTextAssist } from './text/text-assist-request'

const NOW = '2026-09-10T00:00:00.000Z'
const BODY = '夜色里的车站站台空无一人。\n\n她没有回头，@莫宁 站在那一端。'

function node(
  id: string,
  data: Partial<NodeV4['data']> & { kind: NodeV4['data']['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...data,
    } as NodeV4['data'],
  }
}

function scene(textData: { cardHeight?: number } = {}): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        node('t_02', {
          kind: 'text',
          subtype: 'shotNote',
          body: BODY,
          ...textData,
        }),
        node('莫宁', {
          kind: 'image',
          subtype: 'character',
          url: 'https://cdn.test/c.png',
        }),
      ],
      edges: [],
    },
    { now: NOW },
  )
}

function harness(
  state: NodeWorkflowStateV4,
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes: state.nodes,
    edges: state.edges,
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
    selectedNodeIds: [],
    onToggleExpanded: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onFocusNode: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
    modelOptionsByKind: {},
    onSetPrompt: vi.fn(),
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(),
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  }
}

function renderText(
  context: NodeV4CanvasContextValue,
  selected = false,
  nodeId = 't_02',
) {
  const target = context.nodes.find((item) => item.id === nodeId)!
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <TextNodeV4 id={nodeId} data={target.data} selected={selected} />
    </NodeV4CanvasProvider>,
  )
}

beforeEach(() => {
  takeCanvasTextAssist()
})

describe('S2b 文本节点 · 收起态 = 高文本框', () => {
  it('卡面固定高（默认 480）、正文在卡内滚，⛔ 不再六行截断', () => {
    const { container } = renderText(harness(scene()))
    const surface = container.querySelector<HTMLElement>(
      '[data-node-card-surface]',
    )!
    expect(surface.style.height).toBe(`${NODE_V4_CARD.textCollapsedHeight}px`)
    const scroll = container.querySelector<HTMLElement>('[data-text-scroll]')!
    expect(scroll.className).toContain('overflow-y-auto')
    expect(scroll.className).toContain('nowheel')
    expect(container.querySelector('.line-clamp-6')).toBeNull()
    expect(container.querySelector('[data-text-fade]')).not.toBeNull()
    expect(scroll.textContent).toContain('夜色里的车站站台空无一人。')
  })

  it('卡上存过的高优先于默认高', () => {
    const { container } = renderText(harness(scene({ cardHeight: 240 })))
    expect(
      container.querySelector<HTMLElement>('[data-node-card-surface]')!.style
        .height,
    ).toBe('240px')
  })

  it('名字行 = 左「T」+ 名字 + 右侧标签图标（名字仍在卡外）', () => {
    const { container } = renderText(harness(scene()))
    expect(container.querySelector('[data-text-mark]')?.textContent).toBe('T')
    const tag = container.querySelector('[data-text-tag-chip]')!
    const label = container.querySelector('[data-node-rename-trigger]')!
    expect(label.textContent).toContain('t_02')
    const surface = container.querySelector('[data-node-card-surface]')!
    expect(surface.contains(label)).toBe(false)
    expect(surface.contains(tag)).toBe(false)
  })

  it('拖右下角手柄改高：跟手预览 + 松手落一条 op（`dispatchBatch` 一条撤销）', () => {
    const state = scene()
    const context = harness(state)
    const { container } = renderText(context)
    const grip = container.querySelector('[data-text-resize]')!
    const surface = container.querySelector<HTMLElement>(
      '[data-node-card-surface]',
    )!

    fireEvent.pointerDown(grip, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(grip, { clientY: 160, pointerId: 1 })
    expect(surface.style.height).toBe('540px')
    expect(context.onApplyBatch).not.toHaveBeenCalled()

    fireEvent.pointerUp(grip, { clientY: 160, pointerId: 1 })
    expect(context.onApplyBatch).toHaveBeenCalledTimes(1)
    expect(context.onApplyBatch).toHaveBeenCalledWith([
      { op: 'set_field', target: 't_02', field: 'cardHeight', value: 540 },
    ])
  })

  it('拖到上下限之外一律钳制', () => {
    const context = harness(scene())
    const { container } = renderText(context)
    const grip = container.querySelector('[data-text-resize]')!
    fireEvent.pointerDown(grip, { clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(grip, { clientY: -9999, pointerId: 1 })
    expect(context.onApplyBatch).toHaveBeenCalledWith([
      {
        op: 'set_field',
        target: 't_02',
        field: 'cardHeight',
        value: NODE_V4_CARD.textMinHeight,
      },
    ])
  })

  it('未选中时工具条与助手栏都不出', () => {
    const { container } = renderText(harness(scene()))
    expect(screen.queryByTestId('node-toolbar')).toBeNull()
    expect(container.querySelector('[data-text-assistant-bar]')).toBeNull()
  })
})

describe('S2b 文本节点 · 选中态', () => {
  function selected(overrides: Partial<NodeV4CanvasContextValue> = {}) {
    const state = scene()
    const context = harness(state, { selectedNodeIds: ['t_02'], ...overrides })
    return { context, ...renderText(context, true) }
  }

  it('工具条 = 展开 · 下载 · ⋯，助手栏居中在卡下', () => {
    const { container } = selected()
    expect(
      [...container.querySelectorAll('[data-toolbar-action]')].map((element) =>
        element.getAttribute('data-toolbar-action'),
      ),
    ).toEqual(['expand', 'download', 'more'])
    const bar = container.querySelector('[data-text-assistant-bar]')!
    expect(bar.className).toContain('-translate-x-1/2')
  })

  it('⋯ = 改名 / 复制 / 拆成多段 / 生图 / 生镜头 / 删除', () => {
    const { container } = selected()
    expect(
      [...container.querySelectorAll('[data-menu-action]')].map((element) =>
        element.getAttribute('data-menu-action'),
      ),
    ).toEqual(['rename', 'clone', 'split', 'shotImage', 'shot', 'delete'])
  })

  it('展开走画布的展开态；生图 / 生镜头把动作交给画布', () => {
    const { context, container } = selected()
    fireEvent.click(container.querySelector('[data-toolbar-action="expand"]')!)
    expect(context.onToggleExpanded).toHaveBeenCalledWith('t_02')
    fireEvent.click(container.querySelector('[data-menu-action="shotImage"]')!)
    expect(context.onDeriveFromText).toHaveBeenCalledWith('t_02', 'shotImage')
    fireEvent.click(container.querySelector('[data-menu-action="shot"]')!)
    expect(context.onDeriveFromText).toHaveBeenCalledWith('t_02', 'video')
  })

  it('多选时两条浮层都收起来', () => {
    const { container } = selected({ selectedNodeIds: ['t_02', '莫宁'] })
    expect(screen.queryByTestId('node-toolbar')).toBeNull()
    expect(container.querySelector('[data-text-assistant-bar]')).toBeNull()
  })

  it('助手栏：动作 chip 可开可关，发送投一张便条（⛔ 不另起 LLM 调用）', () => {
    const { container } = selected()
    const bar = container.querySelector('[data-text-assistant-bar]')!
    expect(bar.querySelector('[data-chip="model"]')).not.toBeNull()

    const rewrite = bar.querySelector('[data-assist-action="rewrite"]')!
    fireEvent.click(rewrite)
    expect(rewrite.getAttribute('data-active')).toBe('true')

    const input = bar.querySelector('[data-prompt-bar-input]')!
    fireEvent.change(input, { target: { value: '写紧一点' } })
    fireEvent.click(bar.querySelector('[data-prompt-bar-send]')!)

    expect(takeCanvasTextAssist()).toEqual({
      nodeId: 't_02',
      prompt: '写紧一点',
      action: 'rewrite',
    })
  })
})

describe('S2b 文本节点 · 展开 = 全屏文档', () => {
  function expanded(overrides: Partial<NodeV4CanvasContextValue> = {}) {
    const state = scene()
    const context = harness(state, { expandedNodeId: 't_02', ...overrides })
    return { context, ...renderText(context, true) }
  }

  it('铺满视口（⛔ 不是 640 画中框），顶栏是 `名字.md` + 下载', () => {
    expanded()
    const frame = document.querySelector<HTMLElement>(
      '[data-node-chrome="frame"]',
    )!
    expect(frame.style.width).toBe('')
    expect(frame.className).toContain('h-full')
    expect(screen.getByRole('heading').textContent).toBe('doc.title:t_02')
    expect(document.querySelector('[data-text-doc-download]')).not.toBeNull()
  })

  it('正文可编辑，失焦即存（`set_text`）', () => {
    const { context } = expanded()
    const editor = document.querySelector<HTMLTextAreaElement>(
      '[data-text-doc-input]',
    )!
    expect(editor.value).toBe(BODY)
    fireEvent.change(editor, { target: { value: '改过的正文' } })
    fireEvent.blur(editor)
    expect(context.onEditText).toHaveBeenCalledWith('t_02', '改过的正文')
  })

  it('格式工具条只往正文插 Markdown 语法（⛔ 不引入富文本存储）', () => {
    expanded()
    const editor = document.querySelector<HTMLTextAreaElement>(
      '[data-text-doc-input]',
    )!
    editor.setSelectionRange(0, 2)
    fireEvent.select(editor)
    fireEvent.click(document.querySelector('[data-text-format="bold"]')!)
    expect(editor.value.startsWith('**夜色**')).toBe(true)

    fireEvent.click(document.querySelector('[data-text-format="bulleted"]')!)
    expect(editor.value.startsWith('- **夜色**')).toBe(true)
  })

  it('关闭前把草稿存下来，再收起', () => {
    const { context } = expanded()
    const editor = document.querySelector<HTMLTextAreaElement>(
      '[data-text-doc-input]',
    )!
    fireEvent.change(editor, { target: { value: '收起前改的' } })
    fireEvent.click(document.querySelector('[data-node-frame-close]')!)
    expect(context.onEditText).toHaveBeenCalledWith('t_02', '收起前改的')
    expect(context.onToggleExpanded).toHaveBeenCalledWith('t_02')
  })

  it('`@` 弹层复用 `MentionPicker`：文本节点粘原文、素材插 `@名字`', () => {
    expanded()
    const editor = document.querySelector<HTMLTextAreaElement>(
      '[data-text-doc-input]',
    )!
    fireEvent.change(editor, { target: { value: '开场 @' } })
    editor.setSelectionRange(4, 4)
    fireEvent.keyUp(editor)
    const picker = document.querySelector('[data-node-chrome="mention-picker"]')
    expect(picker).not.toBeNull()
    fireEvent.pointerDown(
      document.querySelector('[data-mention-option="莫宁"]')!,
    )
    expect(editor.value).toContain('@莫宁')
  })
})
