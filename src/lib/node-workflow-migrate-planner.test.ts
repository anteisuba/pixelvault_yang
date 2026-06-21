import { describe, expect, it } from 'vitest'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowState,
} from '@/types/node-workflow'
import type { ScriptBreakdownResult } from '@/types/script-breakdown'

import {
  breakdownToScriptDoc,
  migrateRetirePlanner,
} from './node-workflow-migrate-planner'

function makeNode(
  id: string,
  type: NodeWorkflowNodeType,
  data: Partial<NodeWorkflowNodeData> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data } as NodeWorkflowNodeData,
  }
}

function makeEdge(
  id: string,
  source: string,
  target: string,
): NodeWorkflowEdge {
  return { id, source, target }
}

const BREAKDOWN: ScriptBreakdownResult = {
  title: 'Neon Runner',
  logline: 'A courier races through a rain-soaked city.',
  referenceIntent: 'Cyberpunk, high-contrast neon, anamorphic flares.',
  copyRisk: 'low',
  characters: [
    {
      id: 'char-1',
      label: 'The Courier',
      nameSuggestion: 'Rin',
      role: 'protagonist',
      functionInStory: 'drives the plot',
      personality: 'restless',
      visualSeed: 'lean figure in a wet bomber jacket, cropped hair',
      goal: 'deliver the package',
    },
    {
      id: 'char-2',
      label: 'The Fixer',
      nameSuggestion: 'Mara',
      role: 'ally',
      functionInStory: 'guides the courier',
      personality: 'calm',
      visualSeed: 'older woman, augmented eye, trench coat',
      goal: 'protect the courier',
    },
  ],
  scenes: [
    {
      id: 'scene-1',
      label: 'Rooftop',
      summary: 'opening on the rooftop',
      location: 'rooftop',
      timeOfDay: 'night',
      mood: 'tense',
    },
  ],
  actions: [
    {
      id: 'action-1',
      sceneId: 'scene-1',
      label: 'sprint',
      description: 'the courier sprints',
    },
  ],
  beats: [
    {
      id: 'beat-1',
      sceneId: 'scene-1',
      label: 'turn',
      emotionalTurn: 'fear to resolve',
      description: 'decides to jump',
    },
  ],
  shots: [
    {
      id: 'shot-1',
      sceneId: 'scene-1',
      label: 'wide establishing',
      camera: 'wide, slow push-in',
      composition: 'rule of thirds',
      promptSeed: 'rain-soaked rooftop, neon skyline behind',
      characterIds: ['char-1', 'char-unknown'],
    },
    {
      id: 'shot-2',
      sceneId: 'scene-missing',
      label: 'close up',
      camera: 'close-up',
      composition: 'centered',
      promptSeed: 'courier eyes, rain on visor',
      characterIds: ['char-2'],
    },
  ],
}

describe('breakdownToScriptDoc', () => {
  it('maps title / logline / styleNote', () => {
    const doc = breakdownToScriptDoc(BREAKDOWN)
    expect(doc.title).toBe('Neon Runner')
    expect(doc.logline).toBe('A courier races through a rain-soaked city.')
    expect(doc.styleNote).toBe(
      'Cyberpunk, high-contrast neon, anamorphic flares.',
    )
  })

  it('maps characters to roles (visualSeed → description)', () => {
    const doc = breakdownToScriptDoc(BREAKDOWN)
    expect(doc.roles).toHaveLength(2)
    expect(doc.roles[0]).toEqual({
      id: 'char-1',
      name: 'Rin',
      description: 'lean figure in a wet bomber jacket, cropped hair',
    })
  })

  it('maps shots: promptSeed → summary, scene label lookup, empty dialogue', () => {
    const doc = breakdownToScriptDoc(BREAKDOWN)
    expect(doc.shots).toHaveLength(2)
    expect(doc.shots[0]).toEqual({
      id: 'shot-1',
      sceneLabel: 'Rooftop',
      summary: 'rain-soaked rooftop, neon skyline behind',
      camera: 'wide, slow push-in',
      roleIds: ['char-1'], // char-unknown filtered out
      dialogue: [],
    })
  })

  it('drops sceneLabel when the scene id is unknown', () => {
    const doc = breakdownToScriptDoc(BREAKDOWN)
    expect(doc.shots[1].sceneLabel).toBeUndefined()
    expect(doc.shots[1].roleIds).toEqual(['char-2'])
  })
})

describe('migrateRetirePlanner', () => {
  it('returns the same state reference when there are no planner nodes', () => {
    const state: NodeWorkflowState = {
      nodes: [makeNode('s1', NODE_TYPE_IDS.seedance)],
      edges: [],
    }
    expect(migrateRetirePlanner(state)).toBe(state)
  })

  it('removes composer + agent nodes', () => {
    const state: NodeWorkflowState = {
      nodes: [
        makeNode('c1', NODE_TYPE_IDS.composer),
        makeNode('a1', NODE_TYPE_IDS.agent),
        makeNode('s1', NODE_TYPE_IDS.seedance),
      ],
      edges: [],
    }
    const next = migrateRetirePlanner(state)
    expect(next.nodes.map((n) => n.id)).toEqual(['s1'])
  })

  it('removes edges that touch a removed node, keeps the rest', () => {
    const state: NodeWorkflowState = {
      nodes: [
        makeNode('c1', NODE_TYPE_IDS.composer),
        makeNode('a1', NODE_TYPE_IDS.agent),
        makeNode('ch1', NODE_TYPE_IDS.characterImage),
        makeNode('s1', NODE_TYPE_IDS.seedance),
      ],
      edges: [
        makeEdge('e1', 'c1', 'a1'), // both removed
        makeEdge('e2', 'a1', 's1'), // source removed
        makeEdge('e3', 'ch1', 's1'), // survives
      ],
    }
    const next = migrateRetirePlanner(state)
    expect(next.edges.map((e) => e.id)).toEqual(['e3'])
  })

  it('derives a ScriptDoc from the agent breakdown when none exists', () => {
    const state: NodeWorkflowState = {
      nodes: [makeNode('a1', NODE_TYPE_IDS.agent, { breakdown: BREAKDOWN })],
      edges: [],
    }
    const next = migrateRetirePlanner(state)
    expect(next.scriptDoc?.title).toBe('Neon Runner')
    expect(next.scriptDoc?.roles).toHaveLength(2)
    expect(next.scriptDoc?.shots).toHaveLength(2)
  })

  it('does not overwrite an existing ScriptDoc', () => {
    const existing = {
      title: 'Hand-authored',
      logline: '',
      roles: [],
      shots: [],
    }
    const state: NodeWorkflowState = {
      nodes: [makeNode('a1', NODE_TYPE_IDS.agent, { breakdown: BREAKDOWN })],
      edges: [],
      scriptDoc: existing,
    }
    const next = migrateRetirePlanner(state)
    expect(next.scriptDoc).toBe(existing)
  })

  it('uses the first agent breakdown when several exist', () => {
    const second: ScriptBreakdownResult = { ...BREAKDOWN, title: 'Second' }
    const state: NodeWorkflowState = {
      nodes: [
        makeNode('a1', NODE_TYPE_IDS.agent, { breakdown: BREAKDOWN }),
        makeNode('a2', NODE_TYPE_IDS.agent, { breakdown: second }),
      ],
      edges: [],
    }
    expect(migrateRetirePlanner(state).scriptDoc?.title).toBe('Neon Runner')
  })

  it('leaves scriptDoc undefined when agents carry no breakdown', () => {
    const state: NodeWorkflowState = {
      nodes: [makeNode('a1', NODE_TYPE_IDS.agent)],
      edges: [],
    }
    expect(migrateRetirePlanner(state).scriptDoc).toBeUndefined()
  })

  it('is idempotent — a second run is a no-op', () => {
    const state: NodeWorkflowState = {
      nodes: [
        makeNode('a1', NODE_TYPE_IDS.agent, { breakdown: BREAKDOWN }),
        makeNode('s1', NODE_TYPE_IDS.seedance),
      ],
      edges: [makeEdge('e1', 'a1', 's1')],
    }
    const once = migrateRetirePlanner(state)
    const twice = migrateRetirePlanner(once)
    expect(twice).toBe(once)
    expect(once.nodes.map((n) => n.id)).toEqual(['s1'])
  })
})
