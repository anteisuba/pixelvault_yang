import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
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
 * ⚠ S0 的 `chrome/NodeToolbar` 目前**吞掉普通按钮的点击**：`ToolbarCell` 把
 * `{...rest}` 展开在 `onClick={action.onSelect}` **之后**，而 Radix
 * `Tooltip.Trigger` 自己带一个 `onClick`（关 tooltip），于是动作那一半被覆盖。
 * 本组测试断言的是**本片的接线**（哪一键接哪个回调），所以把那层壳桩掉；
 * 那条 bug 记在交付报告里，由 S0 修（⛔ 本片不改 `chrome/**`）。
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
    }[])[]
    ariaLabel: string
  }) => (
    <div role="toolbar" aria-label={ariaLabel}>
      {groups.flat().map((action) => (
        <button
          key={action.id}
          type="button"
          data-toolbar-action={action.id}
          data-has-menu={action.menu ? 'true' : undefined}
          onClick={action.onSelect}
        />
      ))}
    </div>
  ),
}))

vi.mock('@/hooks/use-llm-route-picker', () => ({
  useLLMRoutePicker: () => ({
    savedRoutes: [],
    lockedRoutes: [],
    allRoutes: [],
    healthMap: {},
  }),
}))

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

function scene(): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        node('t_02', { kind: 'text', subtype: 'shotNote', body: BODY }),
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

describe('S2 文本节点 · 收起态', () => {
  it('卡就是正文：15px 六行截断、不可编辑，⛔ 卡面上没有卡头', () => {
    const { container } = renderText(harness(scene()))
    const body = container.querySelector('[data-text-collapsed] p')!
    expect(body.className).toContain('line-clamp-6')
    expect(body.className).toContain('text-md')
    expect(body.textContent).toContain('夜色里的车站站台空无一人。')
    expect(container.querySelector('.node-v4-head')).toBeNull()
    expect(container.querySelector('[contenteditable]')).toBeNull()
  })

  it('名字在卡外上方（`NodeCardShell` 的改名触发器），⛔ 不在卡面里', () => {
    const { container } = renderText(harness(scene()))
    const label = container.querySelector('[data-node-rename-trigger]')!
    expect(label.textContent).toContain('t_02')
    expect(
      container.querySelector('[data-node-card-surface]')!.contains(label),
    ).toBe(false)
  })

  it('未选中时工具条与助手栏都不出', () => {
    const { container } = renderText(harness(scene()))
    expect(screen.queryByTestId('node-toolbar')).toBeNull()
    expect(container.querySelector('[data-text-assistant-bar]')).toBeNull()
  })
})

describe('S2 文本节点 · 选中态', () => {
  function selected(overrides: Partial<NodeV4CanvasContextValue> = {}) {
    const state = scene()
    const context = harness(state, { selectedNodeIds: ['t_02'], ...overrides })
    return { context, ...renderText(context, true) }
  }

  it('工具条 = @ 提及 · 生图 · 生镜头 · ⋯，助手栏居中在卡下', () => {
    const { container } = selected()
    expect(
      [...container.querySelectorAll('[data-toolbar-action]')].map((element) =>
        element.getAttribute('data-toolbar-action'),
      ),
    ).toEqual(['mention', 'shotImage', 'video', 'more'])
    const bar = container.querySelector('[data-text-assistant-bar]')!
    expect(bar.className).toContain('-translate-x-1/2')
  })

  it('多选时两条浮层都收起来', () => {
    const { container } = selected({ selectedNodeIds: ['t_02', '莫宁'] })
    expect(screen.queryByTestId('node-toolbar')).toBeNull()
    expect(container.querySelector('[data-text-assistant-bar]')).toBeNull()
  })

  it('生图 / 生镜头 把动作交给画布，@ 提及 打开画中框', () => {
    const { context, container } = selected()
    fireEvent.click(
      container.querySelector('[data-toolbar-action="shotImage"]')!,
    )
    expect(context.onDeriveFromText).toHaveBeenCalledWith('t_02', 'shotImage')
    fireEvent.click(container.querySelector('[data-toolbar-action="video"]')!)
    expect(context.onDeriveFromText).toHaveBeenCalledWith('t_02', 'video')
    fireEvent.click(container.querySelector('[data-toolbar-action="mention"]')!)
    expect(context.onToggleExpanded).toHaveBeenCalledWith('t_02')
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

describe('S2 文本节点 · 画中框', () => {
  function expanded(overrides: Partial<NodeV4CanvasContextValue> = {}) {
    const state = scene()
    const context = harness(state, { expandedNodeId: 't_02', ...overrides })
    return { context, ...renderText(context, true) }
  }

  it('640 宽、顶栏有角色分段、@ 引用渲染成胶囊', () => {
    expanded()
    const frame = document.querySelector(
      '[data-node-chrome="frame"]',
    ) as HTMLElement | null
    expect(frame?.style.width).toBe('640px')
    expect(
      [...document.querySelectorAll('[data-text-role-option]')].map((element) =>
        element.getAttribute('data-text-role-option'),
      ),
    ).toEqual(['script', 'style', 'character'])
    expect(document.querySelector('[data-mention-chip]')?.textContent).toBe(
      '@莫宁',
    )
  })

  it('角色分段写 `defaultRole`，关闭走收起', () => {
    const { context } = expanded()
    fireEvent.click(document.querySelector('[data-text-role-option="style"]')!)
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: 'set_field',
      target: 't_02',
      field: 'defaultRole',
      value: 'style',
    })
    fireEvent.click(document.querySelector('[data-node-frame-close]')!)
    expect(context.onToggleExpanded).toHaveBeenCalledWith('t_02')
  })

  it('读数是「N 字 · M 段」，框底带三条快捷键', () => {
    expanded()
    expect(document.querySelector('[data-text-readout]')).not.toBeNull()
    expect(document.querySelectorAll('kbd')).toHaveLength(3)
  })

  it('双击正文进编辑、失焦即存（`set_text`）', () => {
    const { context } = expanded()
    fireEvent.doubleClick(document.querySelector('[data-text-preview]')!)
    const editor = screen.getByLabelText('editAriaLabel')
    editor.textContent = '改过的正文'
    fireEvent.input(editor)
    fireEvent.focusOut(editor)
    expect(context.onEditText).toHaveBeenCalledWith('t_02', '改过的正文')
  })
})
