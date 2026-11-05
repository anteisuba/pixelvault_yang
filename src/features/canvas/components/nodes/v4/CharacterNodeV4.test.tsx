/**
 * 画布上的角色卡：真角色库 hook、真「用她出过的」hook、真画布助手草稿；
 * 只假角色卡接口、React Flow 的画布量尺与 next-intl。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join('/')}` : key,
      { has: () => true },
    ),
}))

vi.mock('@xyflow/react', () => ({
  useNodeId: () => 'c_1',
  useStore: <T,>(
    selector: (state: { transform: [number, number, number] }) => T,
  ) => selector({ transform: [0, 0, 1] }),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  NodeToolbar: (props: Record<string, unknown>) =>
    props.isVisible ? (
      <div data-testid={`flow-toolbar-${String(props.position)}`}>
        {props.children as ReactNode}
      </div>
    ) : null,
}))

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}))

/** 角色库接口这一回回什么；`null` = 一直没回来。 */
const library = vi.hoisted(() => ({ cards: [] as unknown[] | null }))
vi.mock('@/lib/api-client/cards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/cards')>()),
  listCharacterCardsAPI: vi.fn(() =>
    library.cards === null
      ? new Promise(() => {})
      : Promise.resolve({ success: true, data: library.cards }),
  ),
  // 「用她出过的」那一条。
  getCharacterCardGenerationsAPI: vi.fn(async () => ({
    success: true,
    data: {
      generations: [
        {
          id: 'g_1',
          url: 'https://cdn.test/made.png',
          width: 832,
          height: 1216,
        },
      ],
      total: 1,
    },
  })),
}))

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

import type { NodeV4CanvasContextValue } from './NodeV4Context'

/**
 * 角色库、助手草稿都是模块级的一份（全页共用）：每例重新载入模块，
 * 上一例拉回来的角色库不会让下一例「已经拉回来过」。
 */
let mod: {
  CharacterNodeV4: typeof import('./CharacterNodeV4').CharacterNodeV4
  NodeV4CanvasProvider: typeof import('./NodeV4Context').NodeV4CanvasProvider
  operator: typeof import('@/hooks/use-studio-operator-store')
}

const DENIA = {
  id: 'denia',
  name: 'Denia',
  looks: [
    {
      id: 'denia-main',
      label: null,
      isDefault: true,
      description: '粉色长卷发、发梢浅蓝',
      tags: [],
      referenceSlots: [
        { id: 's_main', url: 'https://cdn.test/main.png', isPrimary: true },
        { id: 's_back', url: 'https://cdn.test/back.png', isPrimary: false },
      ],
    },
  ],
  persona: {
    identity: '舞台魔术师',
    behavior: '温柔、爱照顾人',
    speech: '',
    backstory: '',
  },
}

function roleNode(characterId = 'denia'): NodeV4 {
  return {
    id: 'c_1',
    position: { x: 100, y: 50 },
    data: {
      kind: 'image',
      subtype: 'character',
      name: 'Denia',
      status: 'idle',
      createdAt: '2026-09-27T00:00:00.000Z',
      characterId,
    },
  } as NodeV4
}

function harness(
  overrides: Partial<NodeV4CanvasContextValue> = {},
): NodeV4CanvasContextValue {
  return {
    nodes: [roleNode()],
    edges: [],
    draggingFrom: null,
    changedNodeIds: [],
    expandedNodeId: null,
    selectedNodeIds: ['c_1'],
    modelOptionsByKind: {},
    onToggleExpanded: vi.fn(),
    onSelectSlotVersion: vi.fn(),
    onDisconnectSlot: vi.fn(),
    onFocusNode: vi.fn(),
    onSelectNode: vi.fn(),
    onEditText: vi.fn(),
    onDeriveFromText: vi.fn(),
    onSetPrompt: vi.fn(),
    // 卡在发送那一下读「op 之后的图」—— 测试里就是这份上下文自己的 nodes / edges。
    readGraph() {
      return { nodes: this.nodes, edges: this.edges }
    },
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(async () => ({ ok: true, createdNodeIds: ['i_new'] })),
    onTidyLayout: vi.fn(),
    onPlaceBeside: vi.fn(() => undefined),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  } as NodeV4CanvasContextValue
}

async function renderRole(
  context: NodeV4CanvasContextValue,
  { selected = false, node = roleNode(), waitLibrary = true } = {},
) {
  const { CharacterNodeV4, NodeV4CanvasProvider } = mod
  const view = render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <CharacterNodeV4 id={node.id} data={node.data} selected={selected} />
    </NodeV4CanvasProvider>,
  )
  // 角色库拉回来之前卡面什么都不说（见最后一组）。
  if (waitLibrary)
    await waitFor(() =>
      expect(document.querySelector('[data-character-node]')).not.toBeNull(),
    )
  return view
}

/** 画布助手那一格收到的草稿（取走即清）。 */
const draftForCanvas = () =>
  mod.operator.takeOperatorDraft('user-a:thread', 'canvas:p1')

// 每例 resetModules 后重新 import 整棵卡片依赖树：第一次要先转译（本机冷启动实测 ~25 秒，
// 远超 10 秒的 hook 上限），之后每例 ~250ms。先在这里热一次，冷启动的账只记这一处。
beforeAll(async () => {
  await import('./CharacterNodeV4')
}, 60_000)

beforeEach(async () => {
  vi.resetModules()
  library.cards = [DENIA]
  mod = {
    CharacterNodeV4: (await import('./CharacterNodeV4')).CharacterNodeV4,
    NodeV4CanvasProvider: (await import('./NodeV4Context'))
      .NodeV4CanvasProvider,
    operator: await import('@/hooks/use-studio-operator-store'),
  }
  // 画布助手开着（草稿只投给眼前那一格）。
  mod.operator.claimOperatorThreadScope('user-a:thread', 'canvas')
})

describe('画布上的角色卡（画布用角色 ④ 方向 A）', () => {
  it('收起：卡就是她的主图，名字现读角色库；没有工具条、没有「图片 / 文字」', async () => {
    await renderRole(harness({ selectedNodeIds: [] }))
    expect(await screen.findByRole('img', { name: 'Denia' })).toHaveAttribute(
      'src',
      'https://cdn.test/main.png',
    )
    expect(screen.queryByTestId('flow-toolbar-top')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('选中 = 原地展开：⛔ 没有工具条、没有底部提示词面板', async () => {
    await renderRole(harness(), { selected: true })
    expect(screen.queryByTestId('flow-toolbar-top')).toBeNull()
    expect(screen.queryByTestId('flow-toolbar-bottom')).toBeNull()
    expect(
      await screen.findByRole('tablist', { name: 'tabsLabel' }),
    ).toBeTruthy()
  })

  it('图片页：卡上的在前、用她出的在后；点一张 = 右边落一张普通图片卡并选中，⛔ 不连线', async () => {
    const context = harness()
    await renderRole(context, { selected: true })
    await waitFor(() =>
      expect(document.querySelectorAll('[data-character-tile]')).toHaveLength(
        3,
      ),
    )
    const tiles = document.querySelectorAll('[data-character-tile]')
    fireEvent.click(tiles[2]!)

    await waitFor(() => expect(context.onSetMedia).toHaveBeenCalled())
    expect(context.onApplyBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: 'image',
        subtype: 'reference',
        name: 'placedName:Denia/3',
      }),
    ])
    const batch = (context.onApplyBatch as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { op: string }[]
    expect(batch.some((op) => op.op === NODE_ASSISTANT_OP_V4_IDS.connect)).toBe(
      false,
    )
    expect(context.onSetMedia).toHaveBeenCalledWith('i_new', {
      url: 'https://cdn.test/made.png',
      imageSource: 'existing',
      generationId: 'g_1',
      mediaWidth: 832,
      mediaHeight: 1216,
    })
    expect(context.onSelectNode).toHaveBeenCalledWith('i_new')
    expect(context.onFocusNode).not.toHaveBeenCalled()
  })

  it('文字页：外观在前，再是写了的设定格；只读，要改去角色页', async () => {
    await renderRole(harness(), { selected: true })
    fireEvent.click(screen.getByRole('tab', { name: 'textTab' }))
    return waitFor(() => {
      expect(screen.getByText('粉色长卷发、发梢浅蓝')).toBeTruthy()
      expect(screen.getByText('舞台魔术师')).toBeTruthy()
      expect(screen.getByText('温柔、爱照顾人')).toBeTruthy()
      expect(screen.queryByText('fieldSpeech')).toBeNull()
      expect(screen.getByRole('button', { name: /readOnly/ })).toBeTruthy()
    })
  })

  it('文字页两键：把一句带 @她 的话填进画布助手（⛔ 不替用户发）', async () => {
    await renderRole(harness(), { selected: true })
    fireEvent.click(screen.getByRole('tab', { name: 'textTab' }))
    fireEvent.click(await screen.findByRole('button', { name: 'writeScript' }))
    expect(draftForCanvas()).toBe('writeScriptDraft:Denia')
    fireEvent.click(screen.getByRole('button', { name: 'writeLines' }))
    expect(draftForCanvas()).toBe('writeLinesDraft:Denia')
  })

  it('右键菜单只有「整理排布 · 删除」（展开 / 下载 / 克隆对她没意义）', async () => {
    const context = harness({ selectedNodeIds: [] })
    await renderRole(context)
    fireEvent.contextMenu(
      document.querySelector('[data-character-node]') as HTMLElement,
    )
    const items = screen
      .getAllByRole('menuitem')
      .map((item) => item.textContent)
    expect(items).toEqual(['toolbar.tidy', 'toolbar.delete'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'toolbar.delete' }))
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.delete,
      target: 'c_1',
    })
  })

  it('角色库里删了她：灰底一句话 +「从画布移除」', async () => {
    library.cards = []
    const context = harness({ selectedNodeIds: [] })
    await renderRole(context)
    await waitFor(() =>
      expect(
        document.querySelector('[data-character-face="deleted"]'),
      ).not.toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'remove' }))
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.delete,
      target: 'c_1',
    })
  })

  it('角色库还没拉回来时不说「已删除」', async () => {
    library.cards = null
    await renderRole(harness({ selectedNodeIds: [] }), { waitLibrary: false })
    expect(document.querySelector('[data-character-face]')).toBeNull()
  })

  it('她还没有图：灰底「还没有图」+ 去角色页加图，⛔ 不画空虚线框', async () => {
    library.cards = [
      { ...DENIA, looks: [{ ...DENIA.looks[0]!, referenceSlots: [] }] },
    ]
    await renderRole(harness({ selectedNodeIds: [] }))
    await waitFor(() =>
      expect(
        document.querySelector('[data-character-face="no-images"]'),
      ).not.toBeNull(),
    )
    expect(document.querySelector('[data-node-card-add]')).toBeNull()
  })
})
