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

function countImageRole(
  result: { nodesToAdd: NodeWorkflowState['nodes'] },
  role: string,
) {
  return result.nodesToAdd.filter(
    (node) => node.type === NODE_TYPE_IDS.image && node.data.role === role,
  ).length
}

function findByRef(
  nodes: NodeWorkflowState['nodes'],
  kind: string,
  sourceId: string,
) {
  return nodes.find(
    (node) =>
      node.data.scriptRef?.kind === kind &&
      node.data.scriptRef?.sourceId === sourceId,
  )
}

describe('projectScriptDocToGraph', () => {
  it('spawns character / shotText / shotStill / seedance / voice / merge for a two-shot doc', () => {
    const result = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
    })

    // 2 characters + 2 shotText + 2 stills + 2 seedance + 1 voice + 1 merge = 10
    expect(result.created).toBe(10)
    expect(result.nodesToAdd).toHaveLength(10)
    // Both projected image families are unified image nodes (option B),
    // separated only by role: character (角色图) and shot (分镜静帧).
    expect(countType(result, NODE_TYPE_IDS.image)).toBe(4)
    expect(countImageRole(result, NODE_IMAGE_ROLE_IDS.character)).toBe(2)
    expect(countImageRole(result, NODE_IMAGE_ROLE_IDS.shot)).toBe(2)
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

    // shotText→seedance (2) + still→seedance (2) + character→seedance (2)
    // + character→still (2) + voice→seedance (1) + seedance→merge (2) = 11
    // 没有 shotText→still —— 见投影里那段「有意不连」的注释。
    expect(result.edgesToAdd).toHaveLength(11)
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

  it('removes orphaned nodes + their edges when a role/shot is deleted from the outline', () => {
    const makeId = deterministicMakeId()
    const first = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId,
      anchor: ANCHOR,
    })
    const appliedState: NodeWorkflowState = {
      nodes: first.nodesToAdd,
      edges: first.edgesToAdd,
    }

    // Delete shot-2 and role-2 entirely; keep shot-1 + role-1.
    const trimmed: ScriptDoc = {
      ...TWO_SHOT_DOC,
      roles: [TWO_SHOT_DOC.roles[0]],
      shots: [TWO_SHOT_DOC.shots[0]],
    }
    const result = projectScriptDocToGraph(trimmed, appliedState, {
      makeId,
      anchor: ANCHOR,
    })

    expect(result.created).toBe(0)
    expect(result.removed).toBeGreaterThan(0)

    const removedRefs = result.nodesToRemove.map(
      (node) => `${node.data.scriptRef?.kind}:${node.data.scriptRef?.sourceId}`,
    )
    // role-2 char + shot-2's shotText/still/seedance + the merge (single shot now).
    expect(removedRefs).toEqual(
      expect.arrayContaining([
        'character:role-2',
        'shotText:shot-2',
        'shotStill:shot-2',
        'seedance:shot-2',
        'merge:merge',
      ]),
    )
    // shot-1's nodes survive.
    expect(removedRefs).not.toContain('shotText:shot-1')
    expect(removedRefs).not.toContain('shotStill:shot-1')
    expect(removedRefs).not.toContain('character:role-1')
    // Edges into the removed nodes are torn down too.
    expect(result.removedEdges).toBeGreaterThan(0)
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

  // ── 分镜静帧 (包 3 / Q5「默认开 · 项目级可关」) ──────────────────────────

  it('projects one role=shot still per shot, seeded from the shot summary', () => {
    const result = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
    })

    const still = findByRef(result.nodesToAdd, 'shotStill', 'shot-1')
    expect(still?.type).toBe(NODE_TYPE_IDS.image)
    // role=shot ⇒ 生成表单 / 散图卡, never the identity card (G5 存废未定).
    expect(still?.data.role).toBe(NODE_IMAGE_ROLE_IDS.shot)
    // `prompt` is the only field `buildNodeWorkflowPrompt` reads for a unified
    // image node, so it carries the summary — and nothing duplicates it.
    expect(still?.data.prompt).toBe('Mira kneels by the flowers')
    expect(still?.data.action).toBeUndefined()
  })

  it('wires character→still→seedance, and deliberately leaves shotText→still out', () => {
    const result = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
    })

    const still = findByRef(result.nodesToAdd, 'shotStill', 'shot-1')
    const shotText = findByRef(result.nodesToAdd, 'shotText', 'shot-1')
    const seedance = findByRef(result.nodesToAdd, 'seedance', 'shot-1')
    const character = findByRef(result.nodesToAdd, 'character', 'role-1')
    const hasEdge = (source?: string, target?: string) =>
      result.edgesToAdd.some(
        (edge) => edge.source === source && edge.target === target,
      )

    // The still harvests the character as a NAMED reference, which is what
    // keeps the face on model — without this edge it generates from bare text.
    expect(hasEdge(character?.id, still?.id)).toBe(true)
    // Purely additive: the pre-existing character→video edge is untouched.
    expect(hasEdge(character?.id, seedance?.id)).toBe(true)
    // The still rides into the video as a plain visual reference.
    expect(hasEdge(still?.id, seedance?.id)).toBe(true)
    // ⚠ Locked ABSENCE: a shotText→still edge would be drawable but never
    // consumed (image nodes don't harvest upstream shotText), and its content
    // is both duplicated and video-flavoured. See the projection's comment.
    expect(hasEdge(shotText?.id, still?.id)).toBe(false)
  })

  it('spawns no new stills when the project toggle is off', () => {
    const result = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId: deterministicMakeId(),
      anchor: ANCHOR,
      shotStills: false,
    })

    expect(countImageRole(result, NODE_IMAGE_ROLE_IDS.shot)).toBe(0)
    // Back to the pre-包 3 shape: 2 char + 2 shotText + 2 seedance + 1 voice + 1 merge.
    expect(result.created).toBe(8)
    expect(result.edgesToAdd).toHaveLength(7)
  })

  it('keeps stills that already exist when the toggle is turned off', () => {
    const makeId = deterministicMakeId()
    const first = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId,
      anchor: ANCHOR,
    })
    const appliedState: NodeWorkflowState = {
      nodes: first.nodesToAdd,
      edges: first.edgesToAdd,
    }

    const afterOff = projectScriptDocToGraph(TWO_SHOT_DOC, appliedState, {
      makeId,
      anchor: ANCHOR,
      shotStills: false,
    })

    // A settings toggle must never delete an image the user already paid for:
    // existing stills stay claimed, so the orphan sweep leaves them alone.
    expect(afterOff.created).toBe(0)
    expect(afterOff.removed).toBe(0)
    expect(afterOff.removedEdges).toBe(0)
    expect(
      afterOff.nodesToRemove.some(
        (node) => node.data.scriptRef?.kind === 'shotStill',
      ),
    ).toBe(false)
  })

  it('never overwrites a still prompt when the outline is redrafted', () => {
    const makeId = deterministicMakeId()
    const first = projectScriptDocToGraph(TWO_SHOT_DOC, EMPTY_STATE, {
      makeId,
      anchor: ANCHOR,
    })
    const still = findByRef(first.nodesToAdd, 'shotStill', 'shot-1')
    const appliedState: NodeWorkflowState = {
      nodes: first.nodesToAdd,
      edges: first.edgesToAdd,
    }
    const revised: ScriptDoc = {
      ...TWO_SHOT_DOC,
      shots: [
        {
          ...TWO_SHOT_DOC.shots[0],
          summary: 'Mira studies glowing flowers in heavy rain',
          camera: 'slow push-in',
        },
        TWO_SHOT_DOC.shots[1],
      ],
    }

    const result = projectScriptDocToGraph(revised, appliedState, {
      makeId,
      anchor: ANCHOR,
    })

    const stillPatch = result.nodesToUpdate.find(
      (update) => update.id === still?.id,
    )
    // Structural field follows the doc…
    expect(stillPatch?.data.camera).toBe('slow push-in')
    // …but the prompt is the creator's to精修 — re-drafting must not wipe it.
    expect(stillPatch?.data).not.toHaveProperty('prompt')
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
      (node) =>
        node.type === NODE_TYPE_IDS.image &&
        node.data.role === NODE_IMAGE_ROLE_IDS.character,
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
