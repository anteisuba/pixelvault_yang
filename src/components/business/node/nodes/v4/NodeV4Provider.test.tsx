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

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import { useNodeV4Canvas, type NodeV4CanvasContextValue } from './NodeV4Context'
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
    return (
      <NodeV4Provider state={state} onStateChange={setState}>
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

  it('onFocusNode / onDeriveFromText 未接时是 no-op，⛔ 不抛错', () => {
    const harness = mount(scene())
    expect(() => {
      harness.ctx().onFocusNode('i_a')
      harness.ctx().onDeriveFromText('t_1', 'shotImage')
    }).not.toThrow()
  })
})
