import { describe, expect, it } from 'vitest'

import { projectScriptDocToGraph } from '@/lib/node-workflow-script-doc'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type {
  NodeWorkflowNodeData,
  NodeWorkflowState,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'

const EMPTY_STATE: NodeWorkflowState = { nodes: [], edges: [] }
const ANCHOR = { x: 0, y: 0 }

// Deterministic id factory so node/edge ids are stable + assertable.
function deterministicMakeId() {
  let counter = 0
  return (prefix: string) => {
    counter += 1
    return `${prefix}-${counter}`
  }
}

const TWO_SHOT_DOC: ScriptDoc = {
  title: 'Test',
  logline: '',
  roles: [
    { id: 'role-1', name: 'Mira', description: 'a botanist' },
    { id: 'role-2', name: 'Theo', description: 'a radio engineer' },
  ],
  shots: [
    {
      id: 'shot-1',
      summary: 'Mira kneels by the flowers',
      roleIds: ['role-1'],
      dialogue: [{ id: 'line-1', speakerRoleId: 'role-1', line: 'Here.' }],
    },
    {
      id: 'shot-2',
      summary: 'Theo tunes the dial',
      roleIds: ['role-2'],
      dialogue: [],
    },
  ],
}

function countType(
  result: { nodesToAdd: NodeWorkflowState['nodes'] },
  type: string,
) {
  return result.nodesToAdd.filter((node) => node.type === type).length
}

describe('projectScriptDocToGraph', () => {
  it('spawns character / shotText / seedance / voice / merge for a two-shot doc', () => {
    const result = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
    })

    // 2 characters + 2 shotText + 2 seedance + 1 voice + 1 merge = 8
    expect(result.created).toBe(8)
    expect(result.nodesToAdd).toHaveLength(8)
    // Projected role nodes are unified image nodes (option B) with role=character.
    expect(countType(result, NODE_TYPE_IDS.image)).toBe(2)
    expect(
      result.nodesToAdd
        .filter((node) => node.type === NODE_TYPE_IDS.image)
        .every((node) => node.data.role === NODE_IMAGE_ROLE_IDS.character),
    ).toBe(true)
    expect(countType(result, NODE_TYPE_IDS.shotText)).toBe(2)
    expect(countType(result, NODE_TYPE_IDS.seedance)).toBe(2)
    expect(countType(result, NODE_TYPE_IDS.voice)).toBe(1)
    expect(countType(result, NODE_TYPE_IDS.videoMerge)).toBe(1)

    // Voice nodes are pure timbre donors (剧本后置): the spoken line is NOT
    // projected onto the node — it stays in the ScriptDoc + shot prompt, linked
    // by scriptRef. Lock that contract so the write-only orphan never returns.
    const voiceNode = result.nodesToAdd.find(
      (node) => node.type === NODE_TYPE_IDS.voice,
    )
    expect(voiceNode?.data.dialogue).toBeUndefined()

    // shotText→seedance (2) + character→seedance (2) + voice→seedance (1)
    // + seedance→merge (2) = 7
    expect(result.edgesToAdd).toHaveLength(7)
  })

  it('is idempotent — re-projecting the same doc adds nothing', () => {
    const makeId = deterministicMakeId()
    const first = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId,
      anchor: ANCHOR,
    })

    const appliedState: NodeWorkflowState = {
      nodes: first.nodesToAdd,
      edges: first.edgesToAdd,
    }

    const second = projectScriptDocToGraph(TWO_SHOT_DOC, appliedState, {
      makeId,
      anchor: ANCHOR,
    })

    expect(second.created).toBe(0)
    expect(second.updated).toBe(0)
    expect(second.nodesToAdd).toHaveLength(0)
    expect(second.nodesToUpdate).toHaveLength(0)
    expect(second.edgesToAdd).toHaveLength(0)
    expect(second.skipped).toBeGreaterThan(0)
  })

  it('updates existing ScriptDoc-owned node fields when the outline changes', () => {
    const makeId = deterministicMakeId()
    const first = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId,
      anchor: ANCHOR,
    })
    const appliedState: NodeWorkflowState = {
      nodes: first.nodesToAdd,
      edges: first.edgesToAdd,
    }
    const revised: ScriptDoc = {
      ...TWO_SHOT_DOC,
      roles: [
        {
          ...TWO_SHOT_DOC.roles[0],
          name: 'Mira Vale',
          description: 'a botanist in a silver raincoat',
        },
        TWO_SHOT_DOC.roles[1],
      ],
      shots: [
        {
          ...TWO_SHOT_DOC.shots[0],
          summary: 'Mira studies glowing flowers in heavy rain',
          camera: 'slow push-in',
          dialogue: [
            {
              ...TWO_SHOT_DOC.shots[0].dialogue[0],
              line: 'The petals are listening.',
            },
          ],
        },
        TWO_SHOT_DOC.shots[1],
      ],
    }

    const result = projectScriptDocToGraph(revised, appliedState, {
      makeId,
      anchor: ANCHOR,
    })

    expect(result.created).toBe(0)
    expect(result.updated).toBeGreaterThanOrEqual(3)
    expect(result.nodesToUpdate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            characterName: 'Mira Vale',
            prompt: 'a botanist in a silver raincoat',
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'Mira studies glowing flowers in heavy rain',
            camera: 'slow push-in',
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            voiceName: 'Mira Vale',
          }),
        }),
      ]),
    )
  })

  it('removes stale ScriptDoc-managed edges when role or merge wiring changes', () => {
    const makeId = deterministicMakeId()
    const first = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId,
      anchor: ANCHOR,
    })
    const appliedState: NodeWorkflowState = {
      nodes: first.nodesToAdd,
      edges: first.edgesToAdd,
    }
    const oneShotWithoutRoles: ScriptDoc = {
      ...TWO_SHOT_DOC,
      shots: [
        {
          ...TWO_SHOT_DOC.shots[0],
          roleIds: [],
          dialogue: [],
        },
      ],
    }

    const result = projectScriptDocToGraph(oneShotWithoutRoles, appliedState, {
      makeId,
      anchor: ANCHOR,
    })

    expect(result.created).toBe(0)
    expect(result.edgesToAdd).toHaveLength(0)
    expect(result.removedEdges).toBeGreaterThan(0)
    expect(result.edgesToRemove).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.any(String),
          target: expect.any(String),
        }),
      ]),
    )
  })

  it('omits the videoMerge for a single-shot doc', () => {
    const oneShot: ScriptDoc = {
      ...TWO_SHOT_DOC,
      shots: [TWO_SHOT_DOC.shots[0]],
    }
    const result = projectScriptDocToGraph(oneShot, EMPTY_STATE, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
    })
    expect(countType(result, NODE_TYPE_IDS.videoMerge)).toBe(0)
  })

  it('names the voice node after the speaker role and wires it to that shot', () => {
    const result = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
    })

    const voice = result.nodesToAdd.find(
      (node) => node.type === NODE_TYPE_IDS.voice,
    )
    expect(voice?.data.voiceName).toBe('Mira')
    expect(voice?.data.scriptRef).toEqual({ kind: 'voice', sourceId: 'line-1' })

    const seedanceShot1 = result.nodesToAdd.find(
      (node) =>
        node.type === NODE_TYPE_IDS.seedance &&
        node.data.scriptRef?.sourceId === 'shot-1',
    )
    const voiceEdge = result.edgesToAdd.find(
      (edge) => edge.source === voice?.id && edge.target === seedanceShot1?.id,
    )
    expect(voiceEdge).toBeTruthy()
  })

  it('reuses an Agent-path character node matched by character.characterId', () => {
    const existingState: NodeWorkflowState = {
      nodes: [
        {
          id: 'existing-char',
          type: NODE_TYPE_IDS.characterImage,
          position: { x: 0, y: 0 },
          data: {
            prompt: 'a botanist',
            status: NODE_STATUS_IDS.idle,
            character: {
              characterId: 'role-1',
              name: 'Mira',
              visualSeed: 'a botanist',
            },
          } as NodeWorkflowNodeData,
        },
      ],
      edges: [],
    }

    const result = projectScriptDocToGraph(TWO_SHOT_DOC, existingState, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
    })

    // role-1 reuses the existing node — only role-2 gets a new character node.
    // The new node is a unified image node (option B); the existing legacy
    // characterImage node is still matched + reused by character.characterId.
    const newCharacters = result.nodesToAdd.filter(
      (node) => node.type === NODE_TYPE_IDS.image,
    )
    expect(newCharacters).toHaveLength(1)
    expect(newCharacters[0]?.data.character?.characterId).toBe('role-2')

    // The role-1 → shot-1 seedance edge sources from the EXISTING node.
    const seedanceShot1 = result.nodesToAdd.find(
      (node) =>
        node.type === NODE_TYPE_IDS.seedance &&
        node.data.scriptRef?.sourceId === 'shot-1',
    )
    const reuseEdge = result.edgesToAdd.find(
      (edge) =>
        edge.source === 'existing-char' && edge.target === seedanceShot1?.id,
    )
    expect(reuseEdge).toBeTruthy()
  })
})
