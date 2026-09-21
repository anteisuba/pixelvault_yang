import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { buildAssistantSetModelPatch } from '@/lib/node-assistant-op-patch'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { resolveRelativePlacement, useNodeGraphV4 } from './use-node-graph-v4'

const NOW = '2026-09-08T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
  position = { x: 0, y: 0 },
): NodeV4 {
  return {
    id,
    position,
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 {
  return { id, source, sourceHandle: NODE_SLOT_OUTPUT_IDS.out, target, slot }
}

function stateOf(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[] = [],
): NodeWorkflowStateV4 {
  return { version: 4, nodes: [...nodes], edges: [...edges] }
}

/**
 * 引擎是受控的（`state` 进、`onStateChange` 出），所以测试要自己当那个「壳」：
 * 把新 state 回灌成下一次 render 的 prop。⛔ 不在 hook 里藏一份内部 state ——
 * 真实调用方是 `use-node-workflow-store`，它就是这样受控的。
 */
function renderGraph(initial: NodeWorkflowStateV4) {
  const onOpFailed = vi.fn()
  const view = renderHook(
    ({ state }: { state: NodeWorkflowStateV4 }) =>
      useNodeGraphV4({
        state,
        onStateChange: (next) => view.rerender({ state: next }),
        onOpFailed,
      }),
    { initialProps: { state: initial } },
  )
  return { view, onOpFailed }
}

const firstFrame = node('img1', {
  kind: 'image',
  subtype: 'shot',
  name: '首帧图',
  url: 'https://cdn/first.png',
})
const shot = node(
  'shot1',
  { kind: 'video', subtype: 'shot', name: '走廊', label: '走廊' },
  { x: 400, y: 0 },
)

describe('useNodeGraphV4 · 图动作', () => {
  it('助手能为六个空节点设置完整模型、提示词和参考图，并逐步撤销', () => {
    const selection = buildAssistantSetModelPatch({
      optionId: 'test-image-route',
      modelId: 'test-image-model',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'test route', baseUrl: 'https://example.com' },
      apiKeyId: 'test-key',
      sourceType: 'saved',
      requestCount: 1,
    }).model!
    const onOpFailed = vi.fn()
    const view = renderHook(
      ({ state }: { state: NodeWorkflowStateV4 }) =>
        useNodeGraphV4({
          state,
          onStateChange: (next) => view.rerender({ state: next }),
          resolveModel: (id) =>
            id === selection.modelId ? selection : undefined,
          onOpFailed,
        }),
      { initialProps: { state: stateOf([firstFrame]) } },
    )
    for (let i = 0; i < 6; i += 1) {
      act(() => {
        expect(
          view.result.current.dispatch({
            op: 'add_node',
            kind: 'image',
            subtype: 'shot',
            name: `方案${i + 1}`,
          }),
        ).toBe(true)
      })
      const target = view.result.current.nodes.at(-1)!.id
      act(() => {
        expect(
          view.result.current.dispatch({
            op: 'set_model',
            target,
            modelId: selection.modelId,
          }),
        ).toBe(true)
      })
      act(() => {
        expect(
          view.result.current.dispatch({
            op: 'set_prompt',
            target,
            prompt: `保持原图画风，换装方案${i + 1}`,
            mode: 'replace',
          }),
        ).toBe(true)
      })
      act(() => {
        expect(
          view.result.current.dispatch({
            op: 'connect',
            source: firstFrame.id,
            target,
            slot: 'reference',
          }),
        ).toBe(true)
      })
      const data = view.result.current.nodes.find((n) => n.id === target)!.data
      expect(data.kind !== 'text' && data.model).toEqual(selection)
      expect(data.kind !== 'text' && data.prompt).toContain(`方案${i + 1}`)
    }
    expect(onOpFailed).not.toHaveBeenCalled()
    expect(view.result.current.nodes).toHaveLength(7)
    expect(view.result.current.edges).toHaveLength(6)
    for (let i = 0; i < 24; i += 1) act(() => view.result.current.undo())
    expect(view.result.current.nodes).toEqual([firstFrame])
    expect(view.result.current.edges).toEqual([])
  })

  it('addNode 走 op 表并回新 id', () => {
    const { view } = renderGraph(stateOf([]))
    let created: string | null = null
    act(() => {
      created = view.result.current.addNode('image', 'result')
    })
    expect(created).toBeTruthy()
    expect(view.result.current.nodes).toHaveLength(1)
    expect(view.result.current.nodes[0]?.data.kind).toBe('image')
  })

  it('connect 过 canConnect：合法的落槽、非法的出声不落', () => {
    const { view, onOpFailed } = renderGraph(stateOf([firstFrame, shot]))
    act(() => {
      view.result.current.connect('img1', 'shot1', NODE_SLOT_IDS.firstFrame)
    })
    expect(view.result.current.edges).toHaveLength(1)
    expect(view.result.current.edges[0]?.slot).toBe(NODE_SLOT_IDS.firstFrame)

    // 反向（镜头 → 图片的首帧槽）在端口表上不存在。
    act(() => {
      view.result.current.connect('shot1', 'img1', NODE_SLOT_IDS.firstFrame)
    })
    expect(view.result.current.edges).toHaveLength(1)
    expect(onOpFailed).toHaveBeenCalled()
  })

  it('disconnect 删边并回落槽绑定', () => {
    const { view } = renderGraph(
      stateOf(
        [firstFrame, shot],
        [edge('e1', 'img1', 'shot1', NODE_SLOT_IDS.firstFrame)],
      ),
    )
    act(() => {
      view.result.current.disconnect('e1')
    })
    expect(view.result.current.edges).toHaveLength(0)
  })

  it('deleteNodes 多选删除只记一个撤销条目', () => {
    const { view } = renderGraph(stateOf([firstFrame, shot]))
    act(() => {
      view.result.current.deleteNodes(['img1', 'shot1'])
    })
    expect(view.result.current.nodes).toHaveLength(0)
    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.nodes).toHaveLength(2)
    expect(view.result.current.canUndo).toBe(false)
  })

  it('duplicate 只克隆形状：同 kind/subtype，不带媒体', () => {
    const { view } = renderGraph(stateOf([firstFrame]))
    act(() => {
      view.result.current.duplicate(['img1'])
    })
    expect(view.result.current.nodes).toHaveLength(2)
    const clone = view.result.current.nodes[1]
    expect(clone?.data.kind).toBe('image')
    expect(clone?.data.subtype).toBe('shot')
    expect(
      clone?.data.kind === 'image' ? clone.data.url : undefined,
    ).toBeUndefined()
  })

  it('moveNodes 写坐标但**不进**撤销栈', () => {
    const { view } = renderGraph(stateOf([firstFrame]))
    act(() => {
      view.result.current.moveNodes([
        { id: 'img1', position: { x: 90, y: 12 } },
      ])
    })
    expect(view.result.current.nodes[0]?.position).toEqual({ x: 90, y: 12 })
    expect(view.result.current.canUndo).toBe(false)
  })

  it('tidyLayout 按镜头带重排且不进撤销栈', () => {
    const { view } = renderGraph(
      stateOf([
        node(
          'shotA',
          { kind: 'video', subtype: 'shot', name: 'A', label: 'A', shotNo: 1 },
          { x: 999, y: 999 },
        ),
      ]),
    )
    act(() => {
      view.result.current.tidyLayout()
    })
    expect(view.result.current.nodes[0]?.position).not.toEqual({
      x: 999,
      y: 999,
    })
    expect(view.result.current.canUndo).toBe(false)
  })
})

describe('useNodeGraphV4 · 撤销栈只有一份', () => {
  it('撤销 → 重做 → 再撤销回到起点', () => {
    const { view } = renderGraph(stateOf([]))
    act(() => {
      view.result.current.addNode('image', 'result')
    })
    expect(view.result.current.nodes).toHaveLength(1)
    const createdId = view.result.current.nodes[0]?.id

    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.nodes).toHaveLength(0)
    expect(view.result.current.canRedo).toBe(true)

    act(() => {
      view.result.current.redo()
    })
    // 重做放回的必须是**同一个节点**（同 id），否则指向它的边会指空。
    expect(view.result.current.nodes[0]?.id).toBe(createdId)

    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.nodes).toHaveLength(0)
  })

  /**
   * 云端往返（保存后重新拉取项目 / 助手一轮 op 回执）只换**快照对象**，⛔ 不动
   * 撤销栈：`state` 是受控 prop，同样的内容换一个新对象回灌进来时，撤销栈必须
   * 原样活着，⌘Z 也必须能落在新快照上。⚠ 别在引擎里加「state 变了就清栈」那种
   * 保险——那正是「保存一下撤销就失效」的来源。
   */
  it('云端往返换掉快照对象后撤销栈原样活着', () => {
    const { view } = renderGraph(stateOf([]))
    act(() => {
      view.result.current.addNode('image', 'result')
    })
    expect(view.result.current.canUndo).toBe(true)
    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.canRedo).toBe(true)
    act(() => {
      view.result.current.redo()
    })

    // 服务端回执：内容一样、对象是新的（JSON 往返 = 引用全断）。
    const roundTripped = JSON.parse(
      JSON.stringify({
        version: 4,
        nodes: view.result.current.nodes,
        edges: view.result.current.edges,
      }),
    ) as NodeWorkflowStateV4
    act(() => {
      view.rerender({ state: roundTripped })
    })

    expect(view.result.current.nodes).toHaveLength(1)
    expect(view.result.current.canUndo).toBe(true)
    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.nodes).toHaveLength(0)
    expect(view.result.current.canRedo).toBe(true)
  })

  it('新动作清空重做栈', () => {
    const { view } = renderGraph(stateOf([]))
    act(() => {
      view.result.current.addNode('image', 'result')
    })
    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.canRedo).toBe(true)
    act(() => {
      view.result.current.addNode('text', 'script')
    })
    expect(view.result.current.canRedo).toBe(false)
  })
})

describe('useNodeGraphV4 · 展开唯一 + 邻居让位', () => {
  it('同一时刻只有一个展开态，再点同一张收起', () => {
    const { view } = renderGraph(stateOf([firstFrame, shot]))
    act(() => {
      view.result.current.toggleExpanded('img1')
    })
    expect(view.result.current.expandedNodeId).toBe('img1')
    act(() => {
      view.result.current.toggleExpanded('shot1')
    })
    expect(view.result.current.expandedNodeId).toBe('shot1')
    act(() => {
      view.result.current.toggleExpanded('shot1')
    })
    expect(view.result.current.expandedNodeId).toBeNull()
  })

  it('展开时右侧且纵向重叠的邻居让位，左侧的不动', () => {
    const left = node(
      'left',
      { kind: 'image', subtype: 'result' },
      { x: -400, y: 0 },
    )
    const right = node(
      'right',
      { kind: 'image', subtype: 'result' },
      { x: 500, y: 0 },
    )
    const { view } = renderGraph(stateOf([firstFrame, left, right]))
    act(() => {
      view.result.current.setExpanded('img1')
    })
    const offsets = view.result.current.neighborOffsets
    expect(offsets.get('left')).toBeUndefined()
    expect(offsets.get('right')).toEqual({
      x: NODE_V4_CARD.expandedWidth - NODE_V4_CARD.collapsedWidth,
      y: 0,
    })
  })

  it('展开的节点被删之后展开态归零（⛔ 不留悬空 id）', () => {
    const { view } = renderGraph(stateOf([firstFrame]))
    act(() => {
      view.result.current.setExpanded('img1')
    })
    act(() => {
      view.result.current.deleteNodes(['img1'])
    })
    expect(view.result.current.expandedNodeId).toBeNull()
  })
})

describe('useNodeGraphV4 · 剪贴板', () => {
  it('复制选中的一张 → 粘贴出同类空节点', () => {
    const { view } = renderGraph(stateOf([firstFrame]))
    act(() => {
      view.result.current.onRfNodesChange([
        { id: 'img1', type: 'select', selected: true },
      ])
    })
    expect(view.result.current.selectedNodeIds).toEqual(['img1'])
    act(() => {
      expect(view.result.current.copySelection()).toBe(true)
    })
    act(() => {
      view.result.current.pasteClipboard()
    })
    expect(view.result.current.nodes).toHaveLength(2)
    expect(view.result.current.nodes[1]?.data.subtype).toBe('shot')
  })

  it('多选时不复制（一次只记一个形状）', () => {
    const { view } = renderGraph(stateOf([firstFrame, shot]))
    act(() => {
      view.result.current.onRfNodesChange([
        { id: 'img1', type: 'select', selected: true },
        { id: 'shot1', type: 'select', selected: true },
      ])
    })
    act(() => {
      expect(view.result.current.copySelection()).toBe(false)
    })
  })
})

describe('相对落位（S5d：派生卡落在本卡右侧，⛔ 不丢到默认布局的左下角）', () => {
  const anchor = node('a_1', { kind: 'audio' }, { x: 100, y: 200 })

  it('四个方向按参照卡的尺寸 + 间距算绝对坐标', () => {
    const size = { width: 300, height: 80 }
    const at = (side: 'right' | 'left' | 'below' | 'above') =>
      resolveRelativePlacement([anchor], {
        relativeTo: 'a_1',
        side,
        gap: 40,
        size,
      })
    expect(at('right')).toEqual({ x: 440, y: 200 })
    expect(at('left')).toEqual({ x: -240, y: 200 })
    expect(at('below')).toEqual({ x: 100, y: 320 })
    expect(at('above')).toEqual({ x: 100, y: 80 })
  })

  it('参照卡不在图里就返回 undefined（⛔ 不落到 0,0）', () => {
    expect(
      resolveRelativePlacement([anchor], {
        relativeTo: 'gone',
        side: 'right',
        gap: 40,
      }),
    ).toBeUndefined()
  })

  it('addNode 的 placement 解析成坐标；显式 position 更具体，它赢', () => {
    const { view } = renderGraph(stateOf([anchor]))
    act(() => {
      view.result.current.addNode('text', 'script', {
        placement: {
          relativeTo: 'a_1',
          side: 'right',
          gap: 40,
          size: { width: 300, height: 80 },
        },
      })
    })
    const created = view.result.current.nodes.at(-1)!
    expect(created.position).toEqual({ x: 440, y: 200 })

    act(() => {
      view.result.current.addNode('text', 'script', {
        position: { x: 7, y: 7 },
        placement: { relativeTo: 'a_1', side: 'right', gap: 40 },
      })
    })
    expect(view.result.current.nodes.at(-1)!.position).toEqual({
      x: 7,
      y: 7,
    })
  })
})

describe('异步生成回填', () => {
  it('清理任务和失败状态连续提交不会恢复旧任务 ID', () => {
    const { view } = renderGraph(
      stateOf([
        node('v', { kind: 'video', mediaJobId: 'job', status: 'running' }),
      ]),
    )
    const graph = view.result.current
    act(() => {
      graph.setMedia('v', { mediaJobId: undefined })
      graph.setRunState('v', 'failed')
    })
    expect(view.result.current.nodes[0]?.data).toMatchObject({
      status: 'failed',
      mediaJobId: undefined,
    })
  })

  it('早先启动的媒体回填保留后来新增的节点', () => {
    const { view } = renderGraph(stateOf([node('v', { kind: 'video' })]))
    const backfill = view.result.current.setMedia
    act(() => {
      view.result.current.addNode('text', 'script')
    })
    act(() => {
      backfill('v', { url: 'https://cdn/result.mp4' })
    })
    expect(view.result.current.nodes).toHaveLength(2)
    expect(view.result.current.nodes[0]?.data).toMatchObject({
      url: 'https://cdn/result.mp4',
    })
  })
})

it('失败原因经过项目序列化保留，开始新任务和上传成功时清除', async () => {
  const { NodeWorkflowStateV4Schema } = await import('@/types/node-workflow')
  const { view } = renderGraph(stateOf([shot]))
  act(() =>
    view.result.current.setMedia('shot1', {
      mediaJobId: undefined,
      generationFailure: {
        error: 'copyright restriction',
        errorCode: 'CONTENT_FILTERED',
      },
    }),
  )
  const restored = NodeWorkflowStateV4Schema.parse(
    JSON.parse(JSON.stringify(stateOf(view.result.current.nodes))),
  )
  expect(restored.nodes[0]?.data).toMatchObject({
    status: 'failed',
    generationFailure: { error: 'copyright restriction' },
  })
  act(() => view.result.current.setMedia('shot1', { mediaJobId: 'retry-job' }))
  expect(view.result.current.nodes[0]?.data).toMatchObject({
    status: 'running',
    generationFailure: undefined,
  })
  act(() =>
    view.result.current.setMedia('shot1', {
      generationFailure: { error: 'failed again' },
    }),
  )
  act(() =>
    view.result.current.setMedia('shot1', { url: 'https://cdn/success.mp4' }),
  )
  expect(view.result.current.nodes[0]?.data).toMatchObject({
    status: 'done',
    generationFailure: undefined,
  })
})
