import { act, renderHook, waitFor } from '@testing-library/react'
import type { Connection } from '@xyflow/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_STUDIO_WORKFLOW_STORAGE } from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { NodeWorkflowStateSchema } from '@/types/node-workflow'

import { useNodeWorkflow } from './use-node-workflow'

const FIRST_POSITION = { x: 20, y: 40 }
const SECOND_POSITION = { x: 220, y: 40 }
const MOVED_POSITION = { x: 80, y: 120 }

function readStoredSnapshot() {
  const raw = window.localStorage.getItem(NODE_STUDIO_WORKFLOW_STORAGE.key)
  expect(raw).not.toBeNull()
  return NodeWorkflowStateSchema.parse(JSON.parse(raw ?? '{}') as unknown)
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('useNodeWorkflow', () => {
  it('starts with an empty workflow when localStorage is empty', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it('adds a composer node with default data', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0]).toMatchObject({
      id: nodeId,
      type: NODE_TYPE_IDS.composer,
      position: FIRST_POSITION,
      data: {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
      },
    })
  })

  it('updates node data without replacing unrelated node fields', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      result.current.updateNodeData(nodeId, { prompt: 'A quiet studio' })
    })

    expect(result.current.nodes[0]?.position).toEqual(FIRST_POSITION)
    expect(result.current.nodes[0]?.data.prompt).toBe('A quiet studio')
    expect(result.current.nodes[0]?.data.status).toBe(NODE_STATUS_IDS.idle)
  })

  it('deletes a node and removes connected edges', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    let sourceId = ''
    let targetId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      targetId = result.current.addNode(NODE_TYPE_IDS.composer, SECOND_POSITION)
      result.current.onConnect({
        source: sourceId,
        target: targetId,
        sourceHandle: null,
        targetHandle: null,
      })
      result.current.deleteNode(sourceId)
    })

    expect(result.current.nodes.map((node) => node.id)).toEqual([targetId])
    expect(result.current.edges).toEqual([])
  })

  it('moves nodes through React Flow node changes', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      result.current.onNodesChange([
        {
          id: nodeId,
          type: 'position',
          position: MOVED_POSITION,
          dragging: false,
        },
      ])
    })

    expect(result.current.nodes[0]?.position).toEqual(MOVED_POSITION)
  })

  it('creates an edge through React Flow connections', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    let sourceId = ''
    let targetId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      targetId = result.current.addNode(NODE_TYPE_IDS.composer, SECOND_POSITION)
    })

    const connection: Connection = {
      source: sourceId,
      target: targetId,
      sourceHandle: null,
      targetHandle: null,
    }

    act(() => {
      result.current.onConnect(connection)
    })

    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0]).toMatchObject({
      source: sourceId,
      target: targetId,
    })
  })

  it('hydrates nodes, edges, and prompt data from a valid snapshot', async () => {
    window.localStorage.setItem(
      NODE_STUDIO_WORKFLOW_STORAGE.key,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        nodes: [
          {
            id: 'node-existing',
            type: NODE_TYPE_IDS.composer,
            position: FIRST_POSITION,
            data: {
              prompt: 'Stored prompt',
              status: NODE_STATUS_IDS.idle,
            },
          },
        ],
        edges: [],
      }),
    )

    const { result } = renderHook(() => useNodeWorkflow())

    expect(result.current.nodes).toEqual([])

    await waitFor(() => {
      expect(result.current.nodes).toHaveLength(1)
    })
    expect(result.current.nodes[0]?.data.prompt).toBe('Stored prompt')
  })

  it('falls back to an empty workflow when localStorage is invalid JSON', async () => {
    window.localStorage.setItem(NODE_STUDIO_WORKFLOW_STORAGE.key, 'not-json')

    const { result } = renderHook(() => useNodeWorkflow())

    await waitFor(() => {
      expect(result.current.nodes).toEqual([])
    })
    expect(result.current.edges).toEqual([])
  })

  it('falls back to an empty workflow when the snapshot schema is invalid', async () => {
    window.localStorage.setItem(
      NODE_STUDIO_WORKFLOW_STORAGE.key,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        nodes: [
          {
            id: 'node-invalid',
            type: NODE_TYPE_IDS.composer,
            position: FIRST_POSITION,
            data: {
              status: NODE_STATUS_IDS.idle,
            },
          },
        ],
        edges: [],
      }),
    )

    const { result } = renderHook(() => useNodeWorkflow())

    await waitFor(() => {
      expect(result.current.nodes).toEqual([])
    })
  })

  it('debounces localStorage persistence', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useNodeWorkflow())

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs - 1)
    })
    expect(
      window.localStorage.getItem(NODE_STUDIO_WORKFLOW_STORAGE.key),
    ).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    const snapshot = readStoredSnapshot()
    expect(snapshot.nodes).toHaveLength(1)
    expect(snapshot.nodes[0]?.position).toEqual(FIRST_POSITION)
  })
})
