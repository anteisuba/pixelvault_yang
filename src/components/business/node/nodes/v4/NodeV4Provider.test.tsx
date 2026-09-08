import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { useNodeV4Canvas, type NodeV4CanvasContextValue } from './NodeV4Context'
import { useNodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import { useWorkbenchShortcutsV4 } from '@/components/business/node/workbench-v4/WorkbenchShortcutsV4'

import { NodeV4Provider } from './NodeV4Provider'

const NOW = '2026-09-07T00:00:00.000Z'

function image(id: string, url: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      name: id,
      status: 'idle',
      createdAt: NOW,
      kind: 'image',
      subtype: 'shot',
      url,
    },
  }
}

/** 一镜 + 两张候选首帧（两版轮播）+ 一段文本。 */
function scene(): NodeWorkflowStateV4 {
  return reconcileStateSlots(
    {
      version: 4,
      nodes: [
        image('i_a', 'https://x/a.png'),
        image('i_b', 'https://x/b.png'),
        {
          id: 't_1',
          position: { x: 0, y: 0 },
          data: {
            name: 't_1',
            status: 'idle',
            createdAt: NOW,
            kind: 'text',
            subtype: 'shotNote',
            body: '旧正文',
          },
        },
        {
          id: 'v_1',
          position: { x: 0, y: 0 },
          data: {
            name: 'v_1',
            status: 'idle',
            createdAt: NOW,
            kind: 'video',
            subtype: 'shot',
            label: '有人还在',
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'i_a',
          sourceHandle: 'out',
          target: 'v_1',
          slot: NODE_SLOT_IDS.firstFrame,
        },
        {
          id: 'e2',
          source: 'i_b',
          sourceHandle: 'out',
          target: 'v_1',
          slot: NODE_SLOT_IDS.firstFrame,
        },
        {
          id: 'e3',
          source: 't_1',
          sourceHandle: 'out',
          target: 'v_1',
          slot: NODE_SLOT_IDS.text,
        },
      ],
    },
    { now: NOW },
  )
}

/** 挂一次 Provider，把 context 值抓出来，并把 state 变更回灌（受控组件）。 */
function mount(initial: NodeWorkflowStateV4) {
  let captured: NodeV4CanvasContextValue | null = null
  let latest = initial
  const report = (value: NodeV4CanvasContextValue) => {
    captured = value
  }
  const track = (value: NodeWorkflowStateV4) => {
    latest = value
  }

  function Probe({
    onValue,
  }: {
    onValue(value: NodeV4CanvasContextValue): void
  }) {
    onValue(useNodeV4Canvas())
    return null
  }

  function Harness() {
    const [state, setState] = useState(initial)
    track(state)
    // ③d-4：`graph` 是必给的 prop —— Provider 只是图引擎的投影，不再自己起一份。
    // 失败出声由调用方接（③d-4 起 `OP_FAILURE_KEYS` 住在 workbench）——
    // 这里给一份最小实现，只为证明「失败真的有出口」。
    const graph = useNodeGraphV4({
      state,
      onStateChange: setState,
      onOpFailed: () => toastError('op failed'),
    })
    return (
      <NodeV4Provider graph={graph}>
        <Probe onValue={report} />
      </NodeV4Provider>
    )
  }

  render(<Harness />)
  return {
    ctx: () => captured as NodeV4CanvasContextValue,
    state: () => latest,
  }
}

describe('NodeV4Provider · NodeV4Context 的回调实现', () => {
  it('onToggleExpanded：同一时刻只展开一个，再点收起', () => {
    const harness = mount(scene())
    expect(harness.ctx().expandedNodeId).toBeNull()
    act(() => harness.ctx().onToggleExpanded('v_1'))
    expect(harness.ctx().expandedNodeId).toBe('v_1')
    act(() => harness.ctx().onToggleExpanded('i_a'))
    expect(harness.ctx().expandedNodeId).toBe('i_a')
    act(() => harness.ctx().onToggleExpanded('i_a'))
    expect(harness.ctx().expandedNodeId).toBeNull()
  })

  it('onSelectSlotVersion：改 `cur`，走的是 op 表那一条路径', () => {
    const harness = mount(scene())
    const binding = harness.state().nodes.find((n) => n.id === 'v_1')!.data
      .slots![NODE_SLOT_IDS.firstFrame]!
    const other = binding.versions.find((v) => v.id !== binding.cur)!
    act(() =>
      harness
        .ctx()
        .onSelectSlotVersion('v_1', NODE_SLOT_IDS.firstFrame, other.id),
    )
    expect(
      harness.state().nodes.find((n) => n.id === 'v_1')!.data.slots![
        NODE_SLOT_IDS.firstFrame
      ]!.cur,
    ).toBe(other.id)
  })

  it('onSelectSlotVersion 指向不存在的版本 → 失败出声，state 不动', () => {
    toastError.mockClear()
    const harness = mount(scene())
    const before = harness.state()
    act(() =>
      harness
        .ctx()
        .onSelectSlotVersion('v_1', NODE_SLOT_IDS.firstFrame, 'nope'),
    )
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(harness.state()).toBe(before)
  })

  it('onDisconnectSlot：按 versionId 找到那条边并断开，binding 跟着重算', () => {
    const harness = mount(scene())
    const binding = harness.state().nodes.find((n) => n.id === 'v_1')!.data
      .slots![NODE_SLOT_IDS.firstFrame]!
    act(() =>
      harness
        .ctx()
        .onDisconnectSlot(
          'v_1',
          NODE_SLOT_IDS.firstFrame,
          binding.versions[0]!.id,
        ),
    )
    expect(harness.state().edges.map((edge) => edge.id)).toEqual(['e2', 'e3'])
    expect(
      harness.state().nodes.find((n) => n.id === 'v_1')!.data.slots![
        NODE_SLOT_IDS.firstFrame
      ]!.versions,
    ).toHaveLength(1)
  })

  it('onEditText：写回文本节点的 body', () => {
    const harness = mount(scene())
    act(() => harness.ctx().onEditText('t_1', '新正文'))
    const data = harness.state().nodes.find((n) => n.id === 't_1')!.data
    expect(data.kind === 'text' ? data.body : '').toBe('新正文')
  })

  it('onEditText 打到非文本节点 → 拒绝并出声', () => {
    toastError.mockClear()
    const harness = mount(scene())
    const before = harness.state()
    act(() => harness.ctx().onEditText('i_a', 'x'))
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(harness.state()).toBe(before)
  })

  it('onSetPrompt / onSetParams / onSetModel 落到节点上（编排区的三个写入口）', () => {
    const harness = mount(scene())
    act(() => harness.ctx().onSetPrompt('v_1', '缓慢推入'))
    act(() => harness.ctx().onSetParams('v_1', { duration: '6' }))
    act(() =>
      harness.ctx().onSetModel('v_1', {
        optionId: 'o1',
        modelId: 'seedance-2.5',
        adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
        providerConfig: { label: 'VolcEngine', baseUrl: 'https://ark' },
      }),
    )
    const data = harness.state().nodes.find((n) => n.id === 'v_1')!.data
    expect(data.kind !== 'text' ? data.prompt : '').toBe('缓慢推入')
    expect(data.kind === 'video' ? data.params?.duration : '').toBe('6')
    expect(data.kind !== 'text' ? data.model?.modelId : '').toBe('seedance-2.5')
  })

  it('onSetMedia：只写 A 补进 schema 的那一组回填字段', () => {
    const harness = mount(scene())
    act(() =>
      harness.ctx().onSetMedia('i_a', {
        url: 'https://x/new.png',
        sizeBytes: 2048,
        mediaWidth: 1280,
        mediaHeight: 720,
        imageSource: 'existing',
      }),
    )
    const data = harness.state().nodes.find((n) => n.id === 'i_a')!.data
    expect(data).toMatchObject({
      url: 'https://x/new.png',
      sizeBytes: 2048,
      mediaWidth: 1280,
      mediaHeight: 720,
      imageSource: 'existing',
    })
  })

  it('onApplyOp：任意一条 op 走同一条路径（这里用 delete）', () => {
    const harness = mount(scene())
    act(
      () =>
        void harness
          .ctx()
          .onApplyOp({ op: NODE_ASSISTANT_OP_V4_IDS.delete, target: 'i_a' }),
    )
    expect(harness.state().nodes.some((n) => n.id === 'i_a')).toBe(false)
  })

  it('onApplyOp 失败时出声，state 不动', () => {
    toastError.mockClear()
    const harness = mount(scene())
    const before = harness.state()
    act(
      () =>
        void harness
          .ctx()
          .onApplyOp({ op: NODE_ASSISTANT_OP_V4_IDS.delete, target: 'nope' }),
    )
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(harness.state()).toBe(before)
  })

  it('onFocusNode / onDeriveFromText 未接时是 no-op，⛔ 不抛错', () => {
    const harness = mount(scene())
    expect(() => {
      harness.ctx().onFocusNode('i_a')
      harness.ctx().onDeriveFromText('t_1', 'shotImage')
    }).not.toThrow()
  })
})

/**
 * 撤销 / 重做（§7 走 op inverses）。
 *
 * ⚠ 这一组盯的是那条最容易被写错的：`add_node` 的重做**必须还给同一个 id**。
 * 「把原 op 再跑一遍」看起来更对称，但 `mintId` 每次发新 id，重做出来的节点跟被
 * 撤销的那个不是同一个，所有指向它的边和 `@` 提及会静默指空。
 */
describe('NodeV4Provider · 撤销 / 重做', () => {
  it('空栈时 canUndo / canRedo 都是 false，点了也不炸', () => {
    const harness = mount(scene())
    expect(harness.ctx().canUndo).toBe(false)
    expect(harness.ctx().canRedo).toBe(false)
    act(() => harness.ctx().onUndo())
    act(() => harness.ctx().onRedo())
    expect(harness.state().nodes).toHaveLength(scene().nodes.length)
  })

  it('改文本 → 撤销回旧正文 → 重做回新正文', () => {
    const harness = mount(scene())
    act(() => harness.ctx().onEditText('t_1', '新正文'))
    const read = () =>
      harness.state().nodes.find((node) => node.id === 't_1')?.data
    expect(read()).toMatchObject({ body: '新正文' })
    expect(harness.ctx().canUndo).toBe(true)

    act(() => harness.ctx().onUndo())
    expect(read()).toMatchObject({ body: '旧正文' })
    expect(harness.ctx().canUndo).toBe(false)
    expect(harness.ctx().canRedo).toBe(true)

    act(() => harness.ctx().onRedo())
    expect(read()).toMatchObject({ body: '新正文' })
    expect(harness.ctx().canRedo).toBe(false)
    expect(harness.ctx().canUndo).toBe(true)
  })

  it('新增节点：撤销移除，重做还回**同一个 id**（⛔ 不重新发号）', () => {
    const harness = mount(scene())
    const before = new Set(harness.state().nodes.map((node) => node.id))
    act(() =>
      harness.ctx().onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: 'image',
        subtype: 'reference',
      }),
    )
    const added = harness
      .state()
      .nodes.map((node) => node.id)
      .filter((id) => !before.has(id))
    expect(added).toHaveLength(1)

    act(() => harness.ctx().onUndo())
    expect(harness.state().nodes.map((node) => node.id)).not.toContain(added[0])

    act(() => harness.ctx().onRedo())
    expect(harness.state().nodes.map((node) => node.id)).toContain(added[0])

    // 重做之后再撤销一次，仍然回得去（这一档走整份快照，见 onRedo 的注释）。
    act(() => harness.ctx().onUndo())
    expect(harness.state().nodes.map((node) => node.id)).not.toContain(added[0])
  })

  it('撤销之后又落了新 op，重做栈清空（⛔ 不让被撤销的分支复活）', () => {
    const harness = mount(scene())
    act(() => harness.ctx().onEditText('t_1', 'A'))
    act(() => harness.ctx().onUndo())
    expect(harness.ctx().canRedo).toBe(true)
    act(() => harness.ctx().onEditText('t_1', 'B'))
    expect(harness.ctx().canRedo).toBe(false)
  })
})

/**
 * ⌘C / ⌘V —— 复制的是**形状**（kind / subtype / shotNo），不是媒体。
 *
 * ⛔ 不复制 url：一张图两个节点指向同一个 R2 对象，删任一个都会让另一个静默变空白。
 */
describe('NodeV4Provider · 复制粘贴', () => {
  function press(key: string, init: KeyboardEventInit = {}) {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          metaKey: true,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      )
    })
  }

  function mountSelected(selected: readonly string[]) {
    let captured: NodeV4CanvasContextValue | null = null
    let latest = scene()
    const report = (value: NodeV4CanvasContextValue) => {
      captured = value
    }
    const track = (value: NodeWorkflowStateV4) => {
      latest = value
    }
    function Probe({
      onValue,
    }: {
      onValue(value: NodeV4CanvasContextValue): void
    }) {
      onValue(useNodeV4Canvas())
      return null
    }
    function Harness() {
      const [state, setState] = useState(scene())
      track(state)
      const graph = useNodeGraphV4({
        state,
        onStateChange: setState,
        selectedNodeIds: selected,
      })
      // ⌘C/⌘V 的键位住在 `WorkbenchShortcutsV4`（画布唯一一份），⛔ 不在 Provider
      // 里再绑一份 —— 同时挂两份会让一次 ⌘Z 撤两步。
      useWorkbenchShortcutsV4({
        graph,
        onGenerateSelected: () => undefined,
        onTidyLayout: () => undefined,
      })
      return (
        <NodeV4Provider graph={graph} selectedNodeIds={selected}>
          <Probe onValue={report} />
        </NodeV4Provider>
      )
    }
    render(<Harness />)
    return {
      ctx: () => captured as NodeV4CanvasContextValue,
      state: () => latest,
    }
  }

  it('选中一张卡 ⌘C → ⌘V 建出同类空节点，⛔ 不带 url', () => {
    const harness = mountSelected(['i_a'])
    const before = harness.state().nodes.length
    press('c')
    press('v')
    const nodes = harness.state().nodes
    expect(nodes).toHaveLength(before + 1)
    const added = nodes[nodes.length - 1]
    expect(added?.data.kind).toBe('image')
    expect(added?.data.subtype).toBe('shot')
    expect(added?.data).not.toHaveProperty('url', 'https://x/a.png')
  })

  it('多选时 ⌘C 不记（一次粘贴该还原哪一张说不清）', () => {
    const harness = mountSelected(['i_a', 'i_b'])
    const before = harness.state().nodes.length
    press('c')
    press('v')
    expect(harness.state().nodes).toHaveLength(before)
  })
})
