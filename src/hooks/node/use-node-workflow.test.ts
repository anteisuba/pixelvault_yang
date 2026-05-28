import { act, renderHook, waitFor } from '@testing-library/react'
import type { Connection } from '@xyflow/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getNodeStudioWorkflowStorageKey,
  NODE_STUDIO_AGENT_MODE_IDS,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NodeWorkflowStorageSchema } from '@/types/node-workflow'
import type {
  ScriptBreakdownPlanner,
  ScriptBreakdownResult,
} from '@/types/script-breakdown'
import type {
  SeedancePromptPlanPlanner,
  SeedancePromptPlanResult,
} from '@/types/seedance-prompt-plan'

import { useNodeWorkflow } from './use-node-workflow'

const FIRST_POSITION = { x: 20, y: 40 }
const SECOND_POSITION = { x: 220, y: 40 }
const MOVED_POSITION = { x: 80, y: 120 }
const DEFAULT_PROJECT_NAME = 'Untitled project'
const TEST_CLERK_ID = 'user_test_clerk_1'
const OTHER_CLERK_ID = 'user_test_clerk_2'
const TEST_STORAGE_KEY = getNodeStudioWorkflowStorageKey(TEST_CLERK_ID)

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
    {
      id: 'char-2',
      label: 'Guide',
      nameSuggestion: 'Sol',
      role: 'Signal keeper',
      functionInStory: 'Guards the route beacon.',
      personality: 'Measured and dryly funny.',
      visualSeed: 'silver-haired signal keeper with prism lantern',
      goal: 'Keep the beacon alive.',
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
  modelId: 'gemini-3.1-flash-lite',
  label: 'Gemini',
}

const FAKE_SEEDANCE_PLAN: SeedancePromptPlanResult = {
  title: 'Quiet Orbit Prompt',
  visualDescription: 'A cartographer crosses a silent lunar ridge at dawn.',
  timeline: [
    {
      startSecond: 0,
      endSecond: 4,
      action: 'The cartographer steps across glowing moon dust.',
      camera: 'Wide lateral tracking shot.',
      composition: 'Tiny figure against a broad glowing horizon.',
    },
  ],
  motion: 'Slow lateral walk, drifting dust, subtle sunrise glow.',
  camera: 'Wide cinematic tracking shot with a slow push-in.',
  duration: '8s',
  audioIntent: 'Low wind, soft suit movement, no music.',
  finalPrompt:
    'A cartographer crosses a silent lunar ridge at dawn. 0-4s: wide lateral tracking shot, drifting dust, sunrise glow. Background audio: low wind.',
  copyRisk: 'low',
}

const FAKE_SEEDANCE_PLANNER: SeedancePromptPlanPlanner = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  modelId: 'gemini-3.5-flash',
  label: 'Gemini',
}

function renderNodeWorkflowHook(clerkId: string | null = TEST_CLERK_ID) {
  return renderHook(() =>
    useNodeWorkflow({
      defaultProjectName: DEFAULT_PROJECT_NAME,
      clerkId,
    }),
  )
}

function readStoredStorage(clerkId: string = TEST_CLERK_ID) {
  const raw = window.localStorage.getItem(
    getNodeStudioWorkflowStorageKey(clerkId),
  )
  expect(raw).not.toBeNull()
  return NodeWorkflowStorageSchema.parse(JSON.parse(raw ?? '{}') as unknown)
}

function readStoredCurrentState() {
  const storage = readStoredStorage()
  const currentProject = storage.projects.find(
    (project) => project.id === storage.currentProjectId,
  )

  expect(currentProject).toBeDefined()
  return currentProject?.state ?? { nodes: [], edges: [] }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('useNodeWorkflow', () => {
  it('starts with an empty workflow when localStorage is empty', async () => {
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
    expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
    expect(result.current.projects).toHaveLength(1)
  })

  it('adds a composer node with default data', () => {
    const { result } = renderNodeWorkflowHook()

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
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
    })

    expect(result.current.nodes[0]).toMatchObject({
      type: NODE_TYPE_IDS.agent,
      position: SECOND_POSITION,
      data: {
        prompt: '',
        agentMode: NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown,
        status: NODE_STATUS_IDS.idle,
      },
    })
  })

  it('adds a character image node with choice-mode defaults', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.characterImage, SECOND_POSITION)
    })

    expect(result.current.nodes[0]).toMatchObject({
      type: NODE_TYPE_IDS.characterImage,
      position: SECOND_POSITION,
      data: {
        prompt: '',
        status: NODE_STATUS_IDS.idle,
        generationStatus: NODE_GENERATION_STATUS_IDS.idle,
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
        referenceAssets: [],
        loras: [],
      },
    })
  })

  it.each([
    [NODE_TYPE_IDS.shotText, NODE_MEDIA_KIND_IDS.text, undefined],
    [
      NODE_TYPE_IDS.shot,
      NODE_MEDIA_KIND_IDS.image,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.backgroundImage,
      NODE_MEDIA_KIND_IDS.image,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.frameImage,
      NODE_MEDIA_KIND_IDS.image,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.voice,
      NODE_MEDIA_KIND_IDS.audio,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
    [
      NODE_TYPE_IDS.seedance,
      NODE_MEDIA_KIND_IDS.video,
      NODE_GENERATION_STATUS_IDS.idle,
    ],
  ] satisfies Array<
    [
      NodeWorkflowNodeType,
      (typeof NODE_MEDIA_KIND_IDS)[keyof typeof NODE_MEDIA_KIND_IDS],
      typeof NODE_GENERATION_STATUS_IDS.idle | undefined,
    ]
  >)(
    'adds %s node with media defaults',
    (type, mediaKind, generationStatus) => {
      const { result } = renderNodeWorkflowHook()

      act(() => {
        result.current.addNode(type, SECOND_POSITION)
      })

      expect(result.current.nodes[0]).toMatchObject({
        type,
        position: SECOND_POSITION,
        data: {
          prompt: '',
          status: NODE_STATUS_IDS.idle,
          mediaKind,
        },
      })
      expect(result.current.nodes[0]?.data.generationStatus).toBe(
        generationStatus,
      )
    },
  )

  it('updates node data without replacing unrelated node fields', () => {
    const { result } = renderNodeWorkflowHook()

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      result.current.updateNodeData(nodeId, { prompt: 'A quiet studio' })
    })

    expect(result.current.nodes[0]?.position).toEqual(FIRST_POSITION)
    expect(result.current.nodes[0]?.data.prompt).toBe('A quiet studio')
    expect(result.current.nodes[0]?.data.status).toBe(NODE_STATUS_IDS.idle)
  })

  it('stores an existing image output on a character image node', () => {
    const { result } = renderNodeWorkflowHook()

    let nodeId = ''
    act(() => {
      nodeId = result.current.addNode(
        NODE_TYPE_IDS.characterImage,
        FIRST_POSITION,
      )
      result.current.updateNodeData(nodeId, {
        generationId: 'generation-existing',
        generationStatus: NODE_GENERATION_STATUS_IDS.success,
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        imageUrl: 'https://cdn.example.com/existing.png',
        sourceGenerationId: 'generation-existing',
        sourceLabel: 'Existing portrait',
        status: NODE_STATUS_IDS.done,
      })
    })

    expect(result.current.nodes[0]?.data).toMatchObject({
      generationId: 'generation-existing',
      generationStatus: NODE_GENERATION_STATUS_IDS.success,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
      imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
      imageUrl: 'https://cdn.example.com/existing.png',
      sourceGenerationId: 'generation-existing',
      sourceLabel: 'Existing portrait',
      status: NODE_STATUS_IDS.done,
    })
  })

  it('deletes a node and removes connected edges', () => {
    const { result } = renderNodeWorkflowHook()

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
    const { result } = renderNodeWorkflowHook()

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
    const { result } = renderNodeWorkflowHook()

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
    const { result } = renderNodeWorkflowHook()

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
    const { result } = renderNodeWorkflowHook()

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

  it('stores Seedance prompt plan data on an agent node', () => {
    const { result } = renderNodeWorkflowHook()

    let agentId = ''
    act(() => {
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      result.current.updateSeedancePromptPlan(
        agentId,
        FAKE_SEEDANCE_PLAN,
        FAKE_SEEDANCE_PLANNER,
      )
    })

    expect(result.current.nodes[0]?.data).toMatchObject({
      agentMode: NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt,
      seedancePromptPlan: FAKE_SEEDANCE_PLAN,
      plannerLabel: FAKE_SEEDANCE_PLANNER.label,
      plannerModelId: FAKE_SEEDANCE_PLANNER.modelId,
      status: NODE_STATUS_IDS.done,
    })
  })

  it('applies a Seedance prompt plan to a connected video node', () => {
    const { result } = renderNodeWorkflowHook()

    let agentId = ''
    let seedanceId = ''
    let applyResult: ReturnType<
      typeof result.current.applySeedancePromptPlanToSeedance
    >
    act(() => {
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, FIRST_POSITION)
      seedanceId = result.current.addNode(
        NODE_TYPE_IDS.seedance,
        SECOND_POSITION,
      )
      result.current.updateSeedancePromptPlan(
        agentId,
        FAKE_SEEDANCE_PLAN,
        FAKE_SEEDANCE_PLANNER,
      )
      result.current.onConnect({
        source: agentId,
        target: seedanceId,
        sourceHandle: null,
        targetHandle: null,
      })
      applyResult = result.current.applySeedancePromptPlanToSeedance(agentId)
    })

    const seedanceNode = result.current.nodes.find(
      (node) => node.id === seedanceId,
    )

    expect(applyResult!).toEqual({ appliedNodeId: seedanceId })
    expect(seedanceNode?.data).toMatchObject({
      prompt: FAKE_SEEDANCE_PLAN.finalPrompt,
      [NODE_WORKFLOW_FIELD_IDS.motion]: FAKE_SEEDANCE_PLAN.motion,
      [NODE_WORKFLOW_FIELD_IDS.camera]: FAKE_SEEDANCE_PLAN.camera,
      [NODE_WORKFLOW_FIELD_IDS.duration]: FAKE_SEEDANCE_PLAN.duration,
      [NODE_WORKFLOW_FIELD_IDS.audioIntent]: FAKE_SEEDANCE_PLAN.audioIntent,
      timeline: FAKE_SEEDANCE_PLAN.timeline,
      status: NODE_STATUS_IDS.ready,
    })
  })

  it('does not apply a Seedance prompt plan without a connected video node', () => {
    const { result } = renderNodeWorkflowHook()

    let agentId = ''
    let applyResult: ReturnType<
      typeof result.current.applySeedancePromptPlanToSeedance
    >
    act(() => {
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, FIRST_POSITION)
      result.current.updateSeedancePromptPlan(
        agentId,
        FAKE_SEEDANCE_PLAN,
        FAKE_SEEDANCE_PLANNER,
      )
      applyResult = result.current.applySeedancePromptPlanToSeedance(agentId)
    })

    expect(applyResult!).toEqual({
      appliedNodeId: null,
      reason: 'missingSeedanceTarget',
    })
  })

  it('spawns character image nodes from an agent breakdown', () => {
    const { result } = renderNodeWorkflowHook()

    let agentId = ''
    let spawnResult: ReturnType<
      typeof result.current.spawnCharactersFromBreakdown
    >
    act(() => {
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      result.current.updateScriptBreakdown(
        agentId,
        FAKE_BREAKDOWN,
        FAKE_PLANNER,
      )
      spawnResult = result.current.spawnCharactersFromBreakdown(agentId)
    })

    const characterNodes = result.current.nodes.filter(
      (node) => node.type === NODE_TYPE_IDS.characterImage,
    )
    const firstY =
      SECOND_POSITION.y -
      ((FAKE_BREAKDOWN.characters.length - 1) *
        NODE_STUDIO_NODE_PLACEMENT.characterSpawn.offsetY) /
        2

    expect(spawnResult!.createdNodeIds).toHaveLength(2)
    expect(spawnResult!.skippedCharacterIds).toEqual([])
    expect(characterNodes).toHaveLength(2)
    expect(characterNodes[0]).toMatchObject({
      type: NODE_TYPE_IDS.characterImage,
      position: {
        x:
          SECOND_POSITION.x + NODE_STUDIO_NODE_PLACEMENT.characterSpawn.offsetX,
        y: firstY,
      },
      data: {
        prompt: FAKE_BREAKDOWN.characters[0]?.visualSeed,
        status: NODE_STATUS_IDS.idle,
        generationStatus: NODE_GENERATION_STATUS_IDS.idle,
        character: {
          characterId: 'char-1',
          name: 'Mira',
        },
      },
    })
    expect(result.current.edges).toHaveLength(2)
    expect(result.current.edges[0]).toMatchObject({
      source: agentId,
      target: characterNodes[0]?.id,
    })
  })

  it('does not spawn characters when the agent is missing or has no breakdown', () => {
    const { result } = renderNodeWorkflowHook()

    let agentId = ''
    let missingResult: ReturnType<
      typeof result.current.spawnCharactersFromBreakdown
    >
    let emptyAgentResult: ReturnType<
      typeof result.current.spawnCharactersFromBreakdown
    >
    act(() => {
      missingResult = result.current.spawnCharactersFromBreakdown('missing')
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      emptyAgentResult = result.current.spawnCharactersFromBreakdown(agentId)
    })

    expect(missingResult!).toEqual({
      createdNodeIds: [],
      skippedCharacterIds: [],
    })
    expect(emptyAgentResult!).toEqual({
      createdNodeIds: [],
      skippedCharacterIds: [],
    })
    expect(
      result.current.nodes.filter(
        (node) => node.type === NODE_TYPE_IDS.characterImage,
      ),
    ).toEqual([])
  })

  it('keeps character spawning idempotent', () => {
    const { result } = renderNodeWorkflowHook()

    let agentId = ''
    let secondSpawn: ReturnType<
      typeof result.current.spawnCharactersFromBreakdown
    >
    act(() => {
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      result.current.updateScriptBreakdown(
        agentId,
        FAKE_BREAKDOWN,
        FAKE_PLANNER,
      )
      result.current.spawnCharactersFromBreakdown(agentId)
      secondSpawn = result.current.spawnCharactersFromBreakdown(agentId)
    })

    expect(secondSpawn!).toEqual({
      createdNodeIds: [],
      skippedCharacterIds: ['char-1', 'char-2'],
    })
    expect(
      result.current.nodes.filter(
        (node) => node.type === NODE_TYPE_IDS.characterImage,
      ),
    ).toHaveLength(2)
  })

  it('recreates only missing character image nodes', () => {
    const { result } = renderNodeWorkflowHook()

    let agentId = ''
    let deletedCharacterId = ''
    let respawn: ReturnType<typeof result.current.spawnCharactersFromBreakdown>
    act(() => {
      agentId = result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
      result.current.updateScriptBreakdown(
        agentId,
        FAKE_BREAKDOWN,
        FAKE_PLANNER,
      )
      const firstSpawn = result.current.spawnCharactersFromBreakdown(agentId)
      deletedCharacterId = firstSpawn.createdNodeIds[0] ?? ''
      result.current.deleteNode(deletedCharacterId)
      respawn = result.current.spawnCharactersFromBreakdown(agentId)
    })

    const characterNodes = result.current.nodes.filter(
      (node) => node.type === NODE_TYPE_IDS.characterImage,
    )

    expect(deletedCharacterId).not.toBe('')
    expect(respawn!.createdNodeIds).toHaveLength(1)
    expect(respawn!.skippedCharacterIds).toEqual(['char-2'])
    expect(
      characterNodes.map((node) => node.data.character?.characterId),
    ).toEqual(['char-2', 'char-1'])
  })

  it('creates a new project and keeps workflow state isolated', () => {
    const { result } = renderNodeWorkflowHook()

    let firstProjectId = ''
    let secondProjectId = ''
    let firstNodeId = ''
    let secondNodeId = ''
    act(() => {
      firstProjectId = result.current.currentProjectId
      firstNodeId = result.current.addNode(
        NODE_TYPE_IDS.composer,
        FIRST_POSITION,
      )
      secondProjectId = result.current.createProject('Storyboard pass')
    })

    expect(result.current.currentProjectId).toBe(secondProjectId)
    expect(result.current.currentProjectName).toBe('Storyboard pass')
    expect(result.current.nodes).toEqual([])

    act(() => {
      secondNodeId = result.current.addNode(
        NODE_TYPE_IDS.agent,
        SECOND_POSITION,
      )
      result.current.switchProject(firstProjectId)
    })

    expect(result.current.nodes.map((node) => node.id)).toEqual([firstNodeId])

    act(() => {
      result.current.switchProject(secondProjectId)
    })

    expect(result.current.nodes.map((node) => node.id)).toEqual([secondNodeId])
  })

  it('renames the current project', () => {
    const { result } = renderNodeWorkflowHook()

    act(() => {
      result.current.renameCurrentProject('Renamed workflow')
    })

    expect(result.current.currentProjectName).toBe('Renamed workflow')
    expect(result.current.projects[0]?.name).toBe('Renamed workflow')
  })

  it('deletes the current project and switches to another project', () => {
    const { result } = renderNodeWorkflowHook()

    let firstProjectId = ''
    let secondProjectId = ''
    let deletedProjectName = ''
    act(() => {
      firstProjectId = result.current.currentProjectId
      secondProjectId = result.current.createProject('Second workflow')
      deletedProjectName =
        result.current.deleteProject(secondProjectId)?.name ?? ''
    })

    expect(deletedProjectName).toBe('Second workflow')
    expect(result.current.currentProjectId).toBe(firstProjectId)
    expect(result.current.projects).toHaveLength(1)
  })

  it('creates a blank default project when deleting the last project', () => {
    const { result } = renderNodeWorkflowHook()

    let deletedNodeCount = 0
    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      deletedNodeCount =
        result.current.deleteProject(result.current.currentProjectId)
          ?.nodeCount ?? 0
    })

    expect(deletedNodeCount).toBe(1)
    expect(result.current.projects).toHaveLength(1)
    expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
    expect(result.current.nodes).toEqual([])
  })

  it('persists multiple projects and the selected current project', async () => {
    vi.useFakeTimers()
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    let firstProjectId = ''
    let secondProjectId = ''
    act(() => {
      firstProjectId = result.current.currentProjectId
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
      secondProjectId = result.current.createProject('Second workflow')
      result.current.addNode(NODE_TYPE_IDS.agent, SECOND_POSITION)
    })

    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    const storage = readStoredStorage()
    const firstProject = storage.projects.find(
      (project) => project.id === firstProjectId,
    )
    const secondProject = storage.projects.find(
      (project) => project.id === secondProjectId,
    )

    expect(storage.currentProjectId).toBe(secondProjectId)
    expect(storage.projects).toHaveLength(2)
    expect(firstProject?.state.nodes).toHaveLength(1)
    expect(secondProject?.state.nodes).toHaveLength(1)
  })

  it('hydrates from a valid multi-project snapshot', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: TEST_CLERK_ID,
        currentProjectId: 'project-b',
        projects: [
          {
            id: 'project-a',
            name: DEFAULT_PROJECT_NAME,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: {
              nodes: [],
              edges: [],
            },
          },
          {
            id: 'project-b',
            name: 'Hydrated workflow',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            state: {
              nodes: [
                {
                  id: 'node-hydrated',
                  type: NODE_TYPE_IDS.composer,
                  position: FIRST_POSITION,
                  data: {
                    prompt: 'Hydrated prompt',
                    status: NODE_STATUS_IDS.idle,
                  },
                },
              ],
              edges: [],
            },
          },
        ],
      }),
    )

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.currentProjectName).toBe('Hydrated workflow')
    })
    expect(result.current.nodes[0]?.data.prompt).toBe('Hydrated prompt')
    expect(result.current.projects).toHaveLength(2)
  })

  it('hydrates nodes, edges, and prompt data from a valid snapshot', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.legacyVersion,
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

    const { result } = renderNodeWorkflowHook()

    expect(result.current.nodes).toEqual([])

    await waitFor(() => {
      expect(result.current.nodes).toHaveLength(1)
    })
    expect(result.current.nodes[0]?.data.prompt).toBe('Stored prompt')
    expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
  })

  it('falls back to an empty workflow when localStorage is invalid JSON', async () => {
    window.localStorage.setItem(TEST_STORAGE_KEY, 'not-json')

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.nodes).toEqual([])
    })
    expect(result.current.edges).toEqual([])
  })

  it('falls back to an empty workflow when the snapshot schema is invalid', async () => {
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.legacyVersion,
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

    const { result } = renderNodeWorkflowHook()

    await waitFor(() => {
      expect(result.current.nodes).toEqual([])
    })
  })

  it('debounces localStorage persistence', async () => {
    vi.useFakeTimers()
    const { result } = renderNodeWorkflowHook()

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs - 1)
    })
    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    const storage = readStoredStorage()
    const snapshot = readStoredCurrentState()
    expect(storage.version).toBe(NODE_STUDIO_WORKFLOW_STORAGE.version)
    expect(storage.ownerClerkId).toBe(TEST_CLERK_ID)
    expect(snapshot.nodes).toHaveLength(1)
    expect(snapshot.nodes[0]?.position).toEqual(FIRST_POSITION)
  })

  it('parks itself and never writes localStorage while clerkId is null', async () => {
    vi.useFakeTimers()
    const { result } = renderNodeWorkflowHook(null)

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })

    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs + 10)
    })

    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).toBeNull()
    expect(
      window.localStorage.getItem(
        getNodeStudioWorkflowStorageKey(OTHER_CLERK_ID),
      ),
    ).toBeNull()
  })

  it('scopes localStorage per clerkId so two accounts cannot see each other', async () => {
    vi.useFakeTimers()
    // User A writes a project into their own slot.
    const userARender = renderNodeWorkflowHook(TEST_CLERK_ID)
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      userARender.result.current.addNode(NODE_TYPE_IDS.composer, FIRST_POSITION)
    })
    act(() => {
      vi.advanceTimersByTime(NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
    })

    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).not.toBeNull()
    // User B's slot is empty — user A's edit did not leak across.
    expect(
      window.localStorage.getItem(
        getNodeStudioWorkflowStorageKey(OTHER_CLERK_ID),
      ),
    ).toBeNull()

    userARender.unmount()
    // Swap back to real timers — waitFor below polls on wall-clock time
    // and would otherwise spin forever against the frozen fake clock.
    vi.useRealTimers()

    // User B mounts on the same browser and sees an empty workflow.
    const userBRender = renderNodeWorkflowHook(OTHER_CLERK_ID)
    await act(async () => {
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(userBRender.result.current.nodes).toEqual([])
    })
    expect(userBRender.result.current.currentProjectName).toBe(
      DEFAULT_PROJECT_NAME,
    )
  })

  it('refuses to hydrate a snapshot whose ownerClerkId does not match', async () => {
    // Stash a snapshot under user A's key that *claims* to belong to user B.
    // The per-user storage key would normally make this impossible, but if
    // it ever happens (sync, manual import) we must not render the wrong
    // user's data.
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify({
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: OTHER_CLERK_ID,
        currentProjectId: 'project-foreign',
        projects: [
          {
            id: 'project-foreign',
            name: 'Foreign workflow',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            state: {
              nodes: [
                {
                  id: 'node-foreign',
                  type: NODE_TYPE_IDS.composer,
                  position: FIRST_POSITION,
                  data: {
                    prompt: 'Foreign data',
                    status: NODE_STATUS_IDS.idle,
                  },
                },
              ],
              edges: [],
            },
          },
        ],
      }),
    )

    const { result } = renderNodeWorkflowHook(TEST_CLERK_ID)

    await waitFor(() => {
      expect(result.current.currentProjectName).toBe(DEFAULT_PROJECT_NAME)
    })
    expect(result.current.nodes).toEqual([])
  })

  it('purges the pre-v3 global localStorage key on mount', async () => {
    window.localStorage.setItem(
      NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey,
      JSON.stringify({ version: 1, nodes: [], edges: [] }),
    )

    renderNodeWorkflowHook()
    await act(async () => {
      await Promise.resolve()
    })

    // The legacy key is wiped, regardless of whether the hydrate flow
    // would have read from it.
    if (
      NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey !==
      getNodeStudioWorkflowStorageKey(TEST_CLERK_ID)
    ) {
      expect(
        window.localStorage.getItem(
          NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey,
        ),
      ).toBeNull()
    }
  })
})
