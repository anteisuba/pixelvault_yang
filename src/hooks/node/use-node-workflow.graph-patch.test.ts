import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflow } from './use-node-workflow'

vi.mock('next-intl', () => {
  const translate = (key: string) => key
  return { useTranslations: () => translate }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

/**
 * C1 给画布操作员开的三个口：`readState` / `applyGraphPatch` / `readUndoTarget`。
 * 服务端 API 全部拒掉（fetch 抛），hook 会退回本地 —— 这里只验撤销栈与图的语义。
 */
function makeNode(id: string): NodeWorkflowNode {
  return {
    id,
    type: NODE_TYPE_IDS.image,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle' },
  } as NodeWorkflowNode
}

function renderWorkflow() {
  return renderHook(() =>
    useNodeWorkflow({ defaultProjectName: 'Untitled', clerkId: 'user_c1' }),
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline'))),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNodeWorkflow · graph patch（C1）', () => {
  it('readState 读的是此刻的项目状态，与 nodes 那份 render 快照同源', () => {
    const { result } = renderWorkflow()
    act(() => {
      result.current.applyGraphPatch({
        addNodes: [makeNode('a')],
        removeNodeIds: [],
        addEdges: [],
        removeEdgeIds: [],
        nodeData: [],
      })
    })
    expect(result.current.readState().nodes.map((node) => node.id)).toEqual([
      'a',
    ])
    expect(result.current.nodes.map((node) => node.id)).toEqual(['a'])
  })

  it('applyGraphPatch 一次提交 = 一个撤销步；空补丁不记账', () => {
    const { result } = renderWorkflow()
    act(() => {
      result.current.applyGraphPatch({
        addNodes: [makeNode('a'), makeNode('b')],
        removeNodeIds: [],
        addEdges: [{ id: 'e', source: 'a', target: 'b' }],
        removeEdgeIds: [],
        nodeData: [{ nodeId: 'b', data: { prompt: 'x' } }],
      })
    })
    expect(result.current.nodes).toHaveLength(2)
    expect(result.current.edges).toHaveLength(1)
    expect(result.current.nodes[1].data.prompt).toBe('x')
    expect(result.current.canUndo).toBe(true)

    const before = result.current.readUndoTarget()
    act(() => {
      result.current.applyGraphPatch({
        addNodes: [],
        removeNodeIds: [],
        addEdges: [],
        removeEdgeIds: [],
        nodeData: [],
      })
    })
    // 空补丁不换引用、不记账：栈顶还是同一个对象。
    expect(result.current.readUndoTarget()).toBe(before)

    act(() => {
      result.current.undo()
    })
    expect(result.current.nodes).toEqual([])
    expect(result.current.readUndoTarget()).toBeUndefined()
  })

  it('readUndoTarget 是「按一次撤销会回到的那份状态」的引用：批内不变，批后才动', async () => {
    const { result } = renderWorkflow()
    let inside: unknown = 'unset'
    await act(async () => {
      await result.current.runAsSingleHistoryStep(() => {
        inside = result.current.readUndoTarget()
        result.current.applyGraphPatch({
          addNodes: [makeNode('a')],
          removeNodeIds: [],
          addEdges: [],
          removeEdgeIds: [],
          nodeData: [],
        })
        result.current.applyGraphPatch({
          addNodes: [makeNode('b')],
          removeNodeIds: [],
          addEdges: [],
          removeEdgeIds: [],
          nodeData: [],
        })
        // 批内第二次写入不再记账 —— 栈顶没动。
        expect(result.current.readUndoTarget()).toBe(inside)
      })
    })
    expect(result.current.readUndoTarget()).toBe(inside)
    expect(result.current.nodes).toHaveLength(2)
    act(() => {
      result.current.deleteNode('b')
    })
    expect(result.current.readUndoTarget()).not.toBe(inside)
  })
})
