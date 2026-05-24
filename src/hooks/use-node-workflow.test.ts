import { act, renderHook, waitFor } from '@testing-library/react'
import type { Connection } from '@xyflow/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { NODE_STUDIO_WORKFLOW_STORAGE } from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { NodeWorkflowStateSchema } from '@/types/node-workflow'
import type {
  ScriptBreakdownPlanner,
  ScriptBreakdownResult,
} from '@/types/script-breakdown'

import { useNodeWorkflow } from './use-node-workflow'

const FIRST_POSITION = { x: 20, y: 40 }
const SECOND_POSITION = { x: 220, y: 40 }
const MOVED_POSITION = { x: 80, y: 120 }

const FAKE_BREAKDOWN: ScriptBreakdownResult = {
  title: 'Quiet Orbit',
  logline: 'A cartographer maps a silent moon before sunrise.',
  referenceIntent: 'Soft cinematic sci-fi with warm practical light.',
  copyRisk: 'low',
  characters: [
    {
      id: 'char-1',
      label: 'Lead',
      nameSuggestion: 'Mira',
      role: 'Cartographer',
      functionInStory: 'Maps the moon route.',
      personality: 'Patient and observant.',
      visualSeed: 'weathered explorer in amber field jacket',
      goal: 'Find the hidden landing path.',
    },
  ],
  scenes: [
    {
      id: 'scene-1',
      label: 'Moon Ridge',
      summary: 'Mira studies a luminous ridge.',
      location: 'Lunar plateau',
      timeOfDay: 'Dawn',
      mood: 'Quiet resolve',
    },
  ],
  actions: [
    {
      id: 'action-1',
      sceneId: 'scene-1',
      label: 'Trace route',
      description: 'Mira traces a route across the glowing dust.',
    },
  ],
  beats: [
    {
      id: 'beat-1',
      sceneId: 'scene-1',
      label: 'Discovery',
      emotionalTurn: 'Doubt becomes focus.',
      description: 'The map reveals a hidden pass.',
    },
  ],
  shots: [
    {
      id: 'shot-1',
      sceneId: 'scene-1',
      beatId: 'beat-1',
      label: 'Wide ridge',
      camera: 'Slow lateral move',
      composition: 'Tiny figure against a broad glowing horizon',
      promptSeed: 'wide lunar ridge at dawn with amber light',
    },
  ],
}

const FAKE_PLANNER: ScriptBreakdownPlanner = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  modelId: 'gemini-2.5-flash-lite',
  label: 'Gemini',
}

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

  it('adds an agent node with default data', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
    })

    expect(result.current.nodes[0]).toMatchObject({
      type: NODE_TYPE_IDS.agent,
      position: SECOND_POSITION,
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

  it('finds the first outgoing target by node type', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    let sourceId = ''
    let agentId = ''
    act(() => {
      sourceId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      result.current.onConnect({
        source: sourceId,
        target: agentId,
        sourceHandle: null,
        targetHandle: null,
      })
    })

    expect(
      result.current.getOutgoingTargetByType(sourceId, NODE_TYPE_IDS.agent)?.id,
    ).toBe(agentId)
    expect(
      result.current.getOutgoingTargetByType(agentId, NODE_TYPE_IDS.agent),
    ).toBeNull()
  })

  it('stores script breakdown data on an agent node', () => {
    const { result } = renderHook(() => useNodeWorkflow())

    let agentId = ''
    act(() => {
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      result.current.updateScriptBreakdown(
        agentId,
        FAKE_BREAKDOWN,
        FAKE_PLANNER,
      )
    })

    expect(result.current.nodes[0]?.data).toMatchObject({
      breakdown: FAKE_BREAKDOWN,
      plannerLabel: FAKE_PLANNER.label,
      plannerModelId: FAKE_PLANNER.modelId,
      status: NODE_STATUS_IDS.done,
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
