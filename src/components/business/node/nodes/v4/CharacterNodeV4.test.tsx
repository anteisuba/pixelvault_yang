import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const mockLibrary = vi.hoisted(() => ({
  value: { cards: [] as unknown[], loaded: true },
}))
vi.mock('@/hooks/cards/use-character-library', () => ({
  useCharacterLibrary: () => ({
    ...mockLibrary.value,
    find: (id: string) =>
      (mockLibrary.value.cards as { id: string }[]).find(
        (card) => card.id === id,
      ) ?? null,
  }),
}))

vi.mock('@/hooks/cards/use-character-card-usage', () => ({
  useCharacterCardUsage: () => ({
    generations: [
      {
        id: 'g_1',
        url: 'https://cdn.test/made.png',
        width: 832,
        height: 1216,
      },
    ],
    total: 1,
    isLoading: false,
  }),
}))

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeV4 } from '@/types/node-workflow'

import { CharacterNodeV4 } from './CharacterNodeV4'
import {
  NodeV4CanvasProvider,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

const DENIA = {
  id: 'denia',
  name: 'Denia',
  referenceSlots: [
    { id: 's_main', url: 'https://cdn.test/main.png', isPrimary: true },
    { id: 's_back', url: 'https://cdn.test/back.png', isPrimary: false },
  ],
  sourceImageUrl: null,
  description: '粉色长卷发、发梢浅蓝',
  variants: [],
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
    onSetModel: vi.fn(),
    onSetParams: vi.fn(),
    onSetMedia: vi.fn(),
    onApplyOp: vi.fn(),
    onApplyBatch: vi.fn(async () => ({ ok: true, createdNodeIds: ['i_new'] })),
    onTidyLayout: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  } as NodeV4CanvasContextValue
}

function renderRole(
  context: NodeV4CanvasContextValue,
  { selected = false, node = roleNode() } = {},
) {
  return render(
    <NodeV4CanvasProvider value={context}>
      {/* @ts-expect-error NodeProps 的其余字段本组测试用不到 */}
      <CharacterNodeV4 id={node.id} data={node.data} selected={selected} />
    </NodeV4CanvasProvider>,
  )
}

beforeEach(() => {
  mockLibrary.value = { cards: [DENIA], loaded: true }
})

describe('画布上的角色卡（画布用角色 ④ 方向 A）', () => {
  it('收起：卡就是她的主图，名字现读角色库；没有工具条、没有「图片 / 文字」', () => {
    renderRole(harness({ selectedNodeIds: [] }))
    expect(screen.getByRole('img', { name: 'Denia' })).toHaveAttribute(
      'src',
      'https://cdn.test/main.png',
    )
    expect(screen.queryByTestId('flow-toolbar-top')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('选中 = 原地展开：⛔ 没有工具条、没有底部提示词面板', () => {
    renderRole(harness(), { selected: true })
    expect(screen.queryByTestId('flow-toolbar-top')).toBeNull()
    expect(screen.queryByTestId('flow-toolbar-bottom')).toBeNull()
    expect(screen.getByRole('tablist', { name: 'tabsLabel' })).toBeTruthy()
  })

  it('图片页：卡上的在前、用她出的在后；点一张 = 右边落一张普通图片卡并选中，⛔ 不连线', async () => {
    const context = harness()
    renderRole(context, { selected: true })
    const tiles = document.querySelectorAll('[data-character-tile]')
    expect(tiles).toHaveLength(3)
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

  it('文字页：外观在前，再是写了的设定格；只读，要改去角色页', () => {
    renderRole(harness(), { selected: true })
    fireEvent.click(screen.getByRole('tab', { name: 'textTab' }))
    return waitFor(() => {
      expect(screen.getByText('粉色长卷发、发梢浅蓝')).toBeTruthy()
      expect(screen.getByText('舞台魔术师')).toBeTruthy()
      expect(screen.getByText('温柔、爱照顾人')).toBeTruthy()
      expect(screen.queryByText('fieldSpeech')).toBeNull()
      expect(screen.getByRole('button', { name: /readOnly/ })).toBeTruthy()
    })
  })

  it('右键菜单只有「整理排布 · 删除」（展开 / 下载 / 克隆对她没意义）', () => {
    const context = harness({ selectedNodeIds: [] })
    renderRole(context)
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

  it('角色库里删了她：灰底一句话 +「从画布移除」', () => {
    mockLibrary.value = { cards: [], loaded: true }
    const context = harness({ selectedNodeIds: [] })
    renderRole(context)
    expect(
      document.querySelector('[data-character-face="deleted"]'),
    ).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'remove' }))
    expect(context.onApplyOp).toHaveBeenCalledWith({
      op: NODE_ASSISTANT_OP_V4_IDS.delete,
      target: 'c_1',
    })
  })

  it('角色库还没拉回来时不说「已删除」', () => {
    mockLibrary.value = { cards: [], loaded: false }
    renderRole(harness({ selectedNodeIds: [] }))
    expect(document.querySelector('[data-character-face]')).toBeNull()
  })

  it('她还没有图：灰底「还没有图」+ 去角色页加图，⛔ 不画空虚线框', () => {
    mockLibrary.value = {
      cards: [{ ...DENIA, referenceSlots: [] }],
      loaded: true,
    }
    renderRole(harness({ selectedNodeIds: [] }))
    expect(
      document.querySelector('[data-character-face="no-images"]'),
    ).not.toBeNull()
    expect(document.querySelector('[data-node-card-add]')).toBeNull()
  })
})
