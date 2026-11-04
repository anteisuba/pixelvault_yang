/**
 * 文本 / 剧本卡：真工具条（玻璃胶囊 + 真 Radix ⋯ 菜单）、真「拆成多段」、真写作模型
 * chip（真 `ApiKeysProvider` 拉 key 列表）。只假网络、React Flow 的画布量尺与 next-intl。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import type { CSSProperties, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

vi.mock('@xyflow/react', () => ({
  // 工具条 / 提示词栏跟着画布缩放 —— 桩里固定 100%。
  useStore: <T,>(
    selector: (state: { transform: [number, number, number] }) => T,
  ) => selector({ transform: [0, 0, 1] }),
  // S6e：卡壳从 RF 拿自己的 id（拖线反馈）。桩里给一个固定值就够。
  useNodeId: () => 'node-1',
  Handle: (props: Record<string, unknown>) => (
    <span
      data-testid="handle"
      data-slot={props['data-slot'] as string}
      data-output={props['data-output'] as string}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div
        data-testid="node-toolbar"
        data-position={props.position as string}
        style={props.style as CSSProperties}
      >
        {props.children as ReactNode}
      </div>
    ) : null,
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))

import { NODE_V4_CARD } from '@/constants/node-studio'
import { API_ENDPOINTS } from '@/constants/config'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'
import { fakeServer } from '@/test/app-harness'
import { openRadixMenu } from '@/test/radix-menu'

import {
  NodeCanvasActionsProvider,
  type NodeCanvasActions,
} from './NodeV4ActionsBridge'
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

function scene(
  textData: { cardHeight?: number; body?: string } = {},
): NodeWorkflowStateV4 {
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
    // 卡在发送那一下读「op 之后的图」—— 测试里就是这份上下文自己的 nodes / edges。
    readGraph() {
      return { nodes: this.nodes, edges: this.edges }
    },
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(),
    onTidyLayout: vi.fn(),
    onPlaceBeside: vi.fn(() => undefined),
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
  // 画布动作出口由宿主注入（工作台那一层）；「拆成多段」要它在场。
  const actions = new Proxy({}, { get: () => vi.fn() }) as NodeCanvasActions
  return render(
    <ApiKeysProvider>
      <NodeCanvasActionsProvider value={actions}>
        <div data-canvas-stage>
          <NodeV4CanvasProvider value={context}>
            {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
            <TextNodeV4 id={nodeId} data={target.data} selected={selected} />
          </NodeV4CanvasProvider>
        </div>
      </NodeCanvasActionsProvider>
    </ApiKeysProvider>,
  )
}

/** ⋯ 菜单是真 Radix：点开后各项在 portal 里。 */
function openMoreMenu(container: HTMLElement) {
  openRadixMenu(container.querySelector('[data-toolbar-action="more"]')!)
}

beforeEach(() => {
  takeCanvasTextAssist()
  fakeServer().on('GET', API_ENDPOINTS.API_KEYS, () =>
    Response.json({ success: true, data: [] }),
  )
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
    expect(container.querySelector('[data-toolbar-action]')).toBeNull()
    expect(container.querySelector('[data-text-assistant-bar]')).toBeNull()
  })
})

describe('S2b 文本节点 · 选中态', () => {
  function selected(overrides: Partial<NodeV4CanvasContextValue> = {}) {
    const state = scene()
    const context = harness(state, { selectedNodeIds: ['t_02'], ...overrides })
    return { context, ...renderText(context, true) }
  }

  it('空文本卡居中两行、200 高，选中只有助手栏；双击仍能编辑', async () => {
    const context = harness(scene({ body: '' }), {
      selectedNodeIds: ['t_02'],
    })
    const { container } = renderText(context, true)
    const surface = container.querySelector<HTMLElement>(
      '[data-node-card-surface]',
    )!
    expect(surface).toHaveClass('border-dashed', 'bg-transparent')
    expect(surface.style.height).toBe('200px')
    expect(screen.getByText('emptyStart')).toBeInTheDocument()
    expect(screen.getByText('emptyAssist')).toBeInTheDocument()
    expect(container.querySelector('[data-text-mark]')).toBeNull()
    expect(container.querySelector('[data-text-fade]')).toBeNull()
    expect(container.querySelector('[data-text-resize]')).toBeNull()
    expect(container.querySelector('[data-toolbar-action]')).toBeNull()
    expect(container.querySelector('[data-text-assistant-bar]')).not.toBeNull()
    fireEvent.doubleClick(container.querySelector('[data-text-scroll]')!)
    expect(await screen.findByLabelText('editAriaLabel')).toHaveAttribute(
      'contenteditable',
      'true',
    )
  })

  it('工具条 = 展开 · 下载 · ⋯，助手栏居中在卡下', () => {
    const { container } = selected()
    expect(
      [...container.querySelectorAll('[data-toolbar-action]')].map((element) =>
        element.getAttribute('data-toolbar-action'),
      ),
    ).toEqual(['expand', 'download', 'more'])
    const bar = container.querySelector('[data-text-assistant-bar]')!
    expect(bar.closest('[data-position]')).toHaveAttribute(
      'data-position',
      'bottom',
    )
    expect(bar.querySelector('[data-node-chrome="prompt-bar"]')).toHaveClass(
      'w-95',
    )
  })

  it('⋯ = 改名 / 复制 / 拆成多段 / 生图 / 生镜头 / 删除', () => {
    const { container } = selected()
    openMoreMenu(container)
    expect(
      [...document.querySelectorAll('[data-menu-action]')].map((element) =>
        element.getAttribute('data-menu-action'),
      ),
    ).toEqual(['rename', 'clone', 'split', 'shotImage', 'shot', 'delete'])
  })

  it('展开走画布的展开态；生图 / 生镜头把动作交给画布', () => {
    const { context, container } = selected()
    fireEvent.click(container.querySelector('[data-toolbar-action="expand"]')!)
    expect(context.onToggleExpanded).toHaveBeenCalledWith('t_02')
    openMoreMenu(container)
    fireEvent.click(document.querySelector('[data-menu-action="shotImage"]')!)
    expect(context.onDeriveFromText).toHaveBeenCalledWith('t_02', 'shotImage')
    openMoreMenu(container)
    fireEvent.click(document.querySelector('[data-menu-action="shot"]')!)
    expect(context.onDeriveFromText).toHaveBeenCalledWith('t_02', 'video')
  })

  it('单击保持预览，双击正文原地编辑，失焦保存且不展开', async () => {
    const { context, container } = selected()
    const body = container.querySelector('[data-text-scroll]')!
    fireEvent.click(body)
    expect(body.querySelector('[contenteditable="true"]')).toBeNull()
    fireEvent.doubleClick(body)
    const editor = await screen.findByLabelText('editAriaLabel')
    expect(editor).toHaveAttribute('contenteditable', 'true')
    expect(context.onToggleExpanded).not.toHaveBeenCalled()
    fireEvent.blur(editor)
    expect(
      container.querySelector('[data-text-scroll] [contenteditable="true"]'),
    ).toBeNull()
  })

  it('多选时两条浮层都收起来', () => {
    const { container } = selected({ selectedNodeIds: ['t_02', '莫宁'] })
    expect(screen.queryByTestId('node-toolbar')).toBeNull()
    expect(container.querySelector('[data-text-assistant-bar]')).toBeNull()
  })

  it('助手栏：动作 chip 可开可关，发送投一张便条（⛔ 不另起 LLM 调用）', () => {
    const { container } = selected()
    const bar = container.querySelector('[data-text-assistant-bar]')!
    // 写作模型 chip：还没选模型，chip 上是「模型」。
    expect(bar.textContent).toContain('assist.model')

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

describe('节点打磨 ② · 文本文档是一张纸', () => {
  function expanded(overrides: Partial<NodeV4CanvasContextValue> = {}) {
    const state = scene()
    const context = harness(state, { expandedNodeId: 't_02', ...overrides })
    return { context, ...renderText(context, true) }
  }

  it('880 宽文档纸挂在画布舞台，下载位于顶栏右侧', () => {
    const { container } = expanded()
    const stage = container.querySelector('[data-canvas-stage]')!
    const overlay = stage.querySelector('[data-node-chrome="frame-scrim"]')!
    const frame = overlay.querySelector<HTMLElement>(
      '[data-node-chrome="frame"]',
    )!
    expect(overlay).toHaveClass('absolute')
    expect(frame.style.width).toBe('880px')
    expect(frame.className).toContain('h-full')
    expect(frame).toHaveAttribute('data-node-frame-variant', 'document')
    expect(screen.getByRole('heading').textContent).toBe('doc.title:t_02')
    const header = frame.querySelector('[data-node-frame-header]')!
    const download = header.querySelector('[data-text-doc-download]')!
    expect(download).toHaveClass('rounded-full', 'bg-surface-fill')
    expect(download.nextElementSibling).toHaveAttribute('data-node-frame-close')
  })

  it('格式条在纸顶，正文与底部写作栏共用 680 宽列', () => {
    expanded()
    const frame = document.querySelector('[data-node-chrome="frame"]')!
    expect(frame.querySelector('[data-node-frame-header]')).toHaveClass(
      'border-b',
    )
    const formatRow = frame.querySelector(
      '[data-text-format-bar]',
    )!.parentElement!
    expect(formatRow).toHaveClass('pt-3')
    const scroll = frame.querySelector<HTMLElement>('[data-text-doc-scroll]')!
    expect(scroll.style.maxWidth).toBe('680px')
    expect(scroll).toHaveClass('pt-5')
    const writingColumn = frame.querySelector<HTMLElement>(
      '[data-node-frame-assistant] > div',
    )!
    expect(writingColumn.style.maxWidth).toBe('680px')
    expect(frame.querySelector('[data-node-frame-assistant]')).toHaveClass(
      'pb-4',
    )
    const writingBar = writingColumn.querySelector(
      '[data-node-chrome="prompt-bar"]',
    )!
    expect(writingBar).toHaveClass('pb-2.5')
    const actionChip = writingBar.querySelector('[data-assist-action]')!
    expect(actionChip).toHaveClass('h-7', 'rounded-full', 'bg-surface-fill')
    const send = writingBar.querySelector('[data-prompt-bar-send]')!
    expect(send).toHaveClass('bg-primary', 'disabled:opacity-100')
  })

  it('正文按 Markdown **渲染**出来：`# 标题` 是 h1，⛔ 不是一行带井号的字', () => {
    const context = harness(scene({ body: '# 标题\n\n正文一段' }), {
      expandedNodeId: 't_02',
    })
    renderText(context, true)

    const doc = document.querySelector('[data-text-doc-editor]')!
    expect(doc.querySelector('h1')?.textContent).toBe('标题')
    // owner 2026-09-12 报的就是这一条：记号原样躺在正文里 = 「编辑没有效果」。
    expect(doc.textContent).not.toContain('#')
  })

  it('格式工具条九档都在场（命令本身在 `TextDocEditor.test.ts`）', () => {
    expanded()
    const bar = document.querySelector('[data-text-format-bar]')!
    expect(bar.querySelector('[data-text-format="heading"]')).not.toBeNull()
    for (const key of [
      'bulleted',
      'numbered',
      'bold',
      'strike',
      'italic',
      'underline',
    ]) {
      expect(bar.querySelector(`[data-text-format="${key}"]`)).not.toBeNull()
    }
  })

  it('收起时正文没改就不写一次空 op', () => {
    const { context } = expanded()
    fireEvent.click(document.querySelector('[data-node-frame-close]')!)
    expect(context.onEditText).not.toHaveBeenCalled()
    expect(context.onToggleExpanded).toHaveBeenCalledWith('t_02')
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * 剧本卡（进度表 24，画板 `DesignD7Script.dc.html`）
 * ───────────────────────────────────────────────────────────────────────── */

const SCRIPT_BODY = [
  '雨夜街角的一段。',
  '',
  'S01 · 雨夜街角 · 4s',
  'S02 · 递伞',
].join('\n')

function scriptScene(
  body = SCRIPT_BODY,
  extra: readonly NodeV4[] = [],
): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        node('sc_1', { kind: 'text', subtype: 'script', body }),
        ...extra,
      ],
      edges: [],
    },
    { now: NOW },
  )
}

function projectedShotNode(shotKey: string, state: string): NodeV4 {
  return node(`v_${shotKey}`, {
    kind: 'video',
    subtype: 'shot',
    label: `镜 ${shotKey}`,
    shotNo: 1,
    scriptShot: {
      scriptNodeId: 'sc_1',
      shotKey,
      projectedText: shotKey === 's1' ? '雨夜街角 · 4s' : '递伞',
      state,
    },
  } as unknown as Partial<NodeV4['data']> & { kind: NodeV4['data']['kind'] })
}

describe('剧本卡 · 卡面（进度表 24）', () => {
  it('⭐ 分镜列表是正文的投影：大纲 + 每镜一行 + 时长', () => {
    const { container } = renderText(harness(scriptScene()), false, 'sc_1')
    const rows = container.querySelectorAll('[data-script-shot-row]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('S01')
    expect(rows[0]?.textContent).toContain('雨夜街角')
    // 时长走 i18n（桩把 key 拼成 `key:值`）—— ⛔ 不在标题里重复写一遍。
    expect(rows[0]?.textContent).toContain('seconds:4')
    expect(
      container.querySelector('[data-script-outline]')?.textContent,
    ).toContain('雨夜街角的一段')
  })

  it('空剧本卡沿用文本空态两行，不摆投影按钮', () => {
    const { container } = renderText(harness(scriptScene('   ')), false, 'sc_1')
    expect(container.querySelectorAll('[data-script-shot-row]')).toHaveLength(0)
    expect(screen.getByText('emptyStart')).toBeInTheDocument()
    expect(screen.getByText('emptyAssist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /project:0/ })).toBeNull()
  })

  it('⭐ 没投过 = 「确认 · 投影 N 镜」，点了只发一条 project_script（create）', () => {
    const context = harness(scriptScene())
    renderText(context, false, 'sc_1')
    const button = screen.getByRole('button', { name: /project:2/ })
    fireEvent.click(button)
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: 'project_script',
      scriptNodeId: 'sc_1',
      mode: 'create',
    })
  })

  it('投影过且一致 = 「已投影」且按钮停用', () => {
    const context = harness(
      scriptScene(SCRIPT_BODY, [
        projectedShotNode('s1', 'synced'),
        projectedShotNode('s2', 'synced'),
      ]),
    )
    renderText(context, false, 'sc_1')
    expect(screen.getByRole('button', { name: /projected:2/ })).toBeDisabled()
  })

  it('⭐ 剧本改了 = 那一行虚线 + 「已变」，按钮转「重投影 N 镜变」', () => {
    const changedBody = [
      '雨夜街角的一段。',
      '',
      'S01 · 雨夜街角 · 4s',
      'S02 · 递伞 · 近景',
    ].join('\n')
    const context = harness(
      scriptScene(changedBody, [
        projectedShotNode('s1', 'synced'),
        projectedShotNode('s2', 'synced'),
      ]),
    )
    const { container } = renderText(context, false, 'sc_1')
    const changedRow = container.querySelector(
      '[data-script-shot-row][data-changed="true"]',
    )
    expect(changedRow?.textContent).toContain('递伞')
    // ⛔ 不只靠颜色：虚线 + 一句「已变」。
    expect(changedRow?.className).toContain('border-dashed')
    expect(changedRow?.textContent).toContain('changed')
    const button = screen.getByRole('button', { name: /reproject:1/ })
    fireEvent.click(button)
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: 'project_script',
      scriptNodeId: 'sc_1',
      mode: 'reproject',
    })
  })
})
