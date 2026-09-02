import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { NODE_STUDIO_CHARACTER_IMAGE_REFERENCES } from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type {
  NodeWorkflowEdge,
  NodeWorkflowModelOption,
  NodeWorkflowNode,
} from '@/types/node-workflow'

import {
  applyCanvasOperatorStep,
  CANVAS_OPERATOR_APPLY_REFUSAL_IDS,
  isCanvasOperatorBatchStep,
  type CanvasOperatorAppliedStep,
  type CanvasOperatorApplyInput,
  type CanvasOperatorApplyOutcome,
} from './canvas-operator-apply'
import { applyNodeWorkflowGraphPatch } from './node-workflow-graph-patch'

// ─── 夹具 ───────────────────────────────────────────────────────────

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 100, y: 50 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

const IMAGE_URL = 'https://cdn.example.com/hero.png'
const HERO = makeNode('hero', NODE_TYPE_IDS.image, {
  role: NODE_IMAGE_ROLE_IDS.character,
  characterName: '小林',
  prompt: 'red scarf',
  mediaUrl: IMAGE_URL,
  referenceAssets: [],
})
const SHOT = makeNode('shot', NODE_TYPE_IDS.shotText, { action: '走进雨里' })
const VIDEO = makeNode('video', NODE_TYPE_IDS.seedance, {
  prompt: '',
  duration: '',
})
const LOOSE = makeNode('loose', NODE_TYPE_IDS.image, {
  imageCategory: 'custom',
  imageCategoryLabel: '我的分类',
})

const MODEL_OPTION: NodeWorkflowModelOption = {
  optionId: 'workspace:seedance-2.0',
  modelId: 'seedance-2.0',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal', baseUrl: 'https://fal.run' },
  requestCount: 10,
  sourceType: 'workspace',
  freeTier: true,
}

function makeInput(): CanvasOperatorApplyInput & { ids: string[] } {
  let seq = 0
  const ids: string[] = []
  return {
    ids,
    createId: (prefix) => {
      seq += 1
      const id = `${prefix}-${seq}`
      ids.push(id)
      return id
    },
    now: () => '2026-09-02T09:00:00.000Z',
    resolveModelOption: (nodeType, modelId, optionId) =>
      nodeType === NODE_TYPE_IDS.seedance &&
      modelId === MODEL_OPTION.modelId &&
      optionId === MODEL_OPTION.optionId
        ? MODEL_OPTION
        : null,
  }
}

const BASE = { id: 'step-1', title: '一步', status: 'done' } as const

function step(
  tool: CanvasOperatorAppliedStep['tool'],
  payload: Record<string, unknown>,
  inverse: Record<string, unknown>,
): CanvasOperatorAppliedStep {
  return {
    ...BASE,
    tool,
    payload,
    inverse,
  } as unknown as CanvasOperatorAppliedStep
}

function graphOf(
  nodes: NodeWorkflowNode[],
  edges: NodeWorkflowEdge[] = [],
): { nodes: NodeWorkflowNode[]; edges: NodeWorkflowEdge[] } {
  return { nodes, edges }
}

function expectPatch(outcome: CanvasOperatorApplyOutcome) {
  if (outcome.kind !== 'patch') {
    throw new Error(`expected a patch, got ${outcome.kind}`)
  }
  return outcome
}

/** 应用 → 逆补丁 → 回到起点：应用与撤销是同一份判据的两侧（拍板 18）。 */
function expectRoundTrip(
  graph: ReturnType<typeof graphOf>,
  outcome: ReturnType<typeof expectPatch>,
) {
  const applied = applyNodeWorkflowGraphPatch(graph, outcome.patch)
  const reverted = applyNodeWorkflowGraphPatch(applied, outcome.inverse)
  expect(reverted).toEqual(graph)
  return applied
}

// ─── 用例 ───────────────────────────────────────────────────────────

describe('applyCanvasOperatorStep · 十条工具', () => {
  it('两条读什么都不落（与工作台 read_state 同一档）', () => {
    const input = makeInput()
    for (const tool of [
      ASSISTANT_OPERATOR_TOOL_IDS.readGraph,
      ASSISTANT_OPERATOR_TOOL_IDS.readNode,
    ] as const) {
      const outcome = applyCanvasOperatorStep(
        graphOf([HERO]),
        {
          ...BASE,
          tool,
          payload: { nodeId: 'hero' },
          result: null,
        } as unknown as CanvasOperatorAppliedStep,
        new Map(),
        input,
      )
      expect(outcome).toEqual({ kind: 'read', tool })
    }
    expect(input.ids).toEqual([])
  })

  it('update_script_doc 归 C3：类型化 notApplicable，不是空补丁', () => {
    const outcome = applyCanvasOperatorStep(
      graphOf([HERO]),
      step(
        ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
        { doc: { title: 'Rain', logline: '', roles: [], shots: [] } },
        { doc: null },
      ),
      new Map(),
      makeInput(),
    )
    expect(outcome).toEqual({
      kind: 'notApplicable',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
      slice: 'C3',
    })
  })

  it('stage_nodes：真实 id 由注入的 helper 分配，形状与人手建节点一致，别名表随返回值走', () => {
    const input = makeInput()
    const graph = graphOf([HERO])
    const outcome = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
          {
            items: [
              {
                alias: 'new:1',
                type: NODE_TYPE_IDS.image,
                role: NODE_IMAGE_ROLE_IDS.character,
                title: '阿瑞',
                fields: { prompt: 'silver hair' },
              },
              { alias: 'new:2', type: NODE_TYPE_IDS.shotText },
              { alias: 'new:3', type: NODE_TYPE_IDS.videoReference },
            ],
          },
          { nodeIds: ['new:1', 'new:2', 'new:3'] },
        ),
        new Map(),
        input,
      ),
    )
    expect(outcome.batch).toBe(true)
    expect(isCanvasOperatorBatchStep(outcome)).toBe(true)
    expect(outcome.patch.addNodes.map((node) => node.id)).toEqual([
      'node-1',
      'node-2',
      'node-3',
    ])
    expect([...outcome.aliases]).toEqual([
      ['new:1', 'node-1'],
      ['new:2', 'node-2'],
      ['new:3', 'node-3'],
    ])
    const [character, shotText, videoRef] = outcome.patch.addNodes
    // role 盖章 + 显示名走 buildDisplayNamePatch + 助手写的字段。
    expect(character.type).toBe(NODE_TYPE_IDS.image)
    expect(character.data.role).toBe(NODE_IMAGE_ROLE_IDS.character)
    expect(character.data.characterName).toBe('阿瑞')
    expect(character.data.prompt).toBe('silver hair')
    expect(character.data.referenceAssets).toEqual([])
    // 镜头文本的四栏默认值来自 createDefaultNodeData，不是手写。
    expect(shotText.data).toMatchObject({ scene: '', action: '', camera: '' })
    // videoReference 建时要给显式尺寸（与 addNode 同一条）。
    expect(videoRef.width).toBeGreaterThan(0)
    // 整批落在现有图右侧、按网格铺开 —— 三张不重叠。
    const positions = outcome.patch.addNodes.map((node) => node.position)
    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(3)
    expect(positions[0].x).toBeGreaterThan(HERO.position.x)
    expect(outcome.inverse.removeNodeIds).toEqual([
      'node-1',
      'node-2',
      'node-3',
    ])
    expect(outcome.changes).toEqual(['node-1:nodes'])
    expectRoundTrip(graph, outcome)
  })

  it('批内别名：stage_nodes 之后同一 run 的 connect_nodes 可引用 new:1，边指向真实 id', () => {
    const input = makeInput()
    const staged = expectPatch(
      applyCanvasOperatorStep(
        graphOf([HERO]),
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
          { items: [{ alias: 'new:1', type: NODE_TYPE_IDS.seedance }] },
          { nodeIds: ['new:1'] },
        ),
        new Map(),
        input,
      ),
    )
    const graph = applyNodeWorkflowGraphPatch(graphOf([HERO]), staged.patch)
    const connected = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
          { items: [{ source: 'hero', target: 'new:1' }] },
          { items: [{ source: 'hero', target: 'new:1' }] },
        ),
        staged.aliases,
        input,
      ),
    )
    expect(connected.batch).toBe(true)
    expect(connected.patch.addEdges).toHaveLength(1)
    expect(connected.patch.addEdges[0]).toMatchObject({
      id: 'edge-2',
      source: 'hero',
      target: 'node-1',
    })
    expect(connected.inverse.removeEdgeIds).toEqual(['edge-2'])
    expect(connected.changes).toEqual(['hero:edges'])
    // 别名表原样带回（这一步没建节点）。
    expect(connected.aliases).toBe(staged.aliases)
    const wired = expectRoundTrip(graph, connected)
    expect(wired.edges[0].target).toBe('node-1')
  })

  it('connect_nodes：别名没登记 / 节点不在图上 → 类型化拒绝；已连的对幂等跳过', () => {
    const input = makeInput()
    const connect = (source: string, target: string) =>
      step(
        ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
        { items: [{ source, target }] },
        { items: [{ source, target }] },
      )
    expect(
      applyCanvasOperatorStep(
        graphOf([HERO, VIDEO]),
        connect('hero', 'new:9'),
        new Map(),
        input,
      ),
    ).toEqual({
      kind: 'refused',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
      reason: CANVAS_OPERATOR_APPLY_REFUSAL_IDS.aliasUnresolved,
      ref: 'new:9',
    })
    expect(
      applyCanvasOperatorStep(
        graphOf([HERO]),
        connect('hero', 'ghost'),
        new Map(),
        input,
      ),
    ).toMatchObject({
      kind: 'refused',
      reason: CANVAS_OPERATOR_APPLY_REFUSAL_IDS.unknownNode,
      ref: 'ghost',
    })
    const already = expectPatch(
      applyCanvasOperatorStep(
        graphOf([HERO, VIDEO], [{ id: 'e', source: 'hero', target: 'video' }]),
        connect('hero', 'video'),
        new Map(),
        input,
      ),
    )
    expect(already.patch.addEdges).toEqual([])
    expect(input.ids).toEqual([])
  })

  it('set_node_fields：replace / append（协议分隔符，空框视同替换）/ title 落显示名字段 / 逆补丁回原值', () => {
    const input = makeInput()
    const graph = graphOf([HERO, SHOT])
    const outcome = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
          {
            items: [
              {
                nodeId: 'hero',
                fields: { prompt: 'blue eyes', title: '林小雨' },
                mode: 'append',
              },
              {
                nodeId: 'shot',
                fields: { scene: '雨夜巷口', action: '停住脚步' },
                mode: 'append',
              },
            ],
          },
          {
            items: [
              {
                nodeId: 'hero',
                fields: { prompt: 'red scarf', title: '小林' },
              },
              { nodeId: 'shot', fields: { scene: null, action: '走进雨里' } },
            ],
          },
        ),
        new Map(),
        input,
      ),
    )
    expect(outcome.batch).toBe(false)
    expect(outcome.patch.nodeData).toEqual([
      {
        nodeId: 'hero',
        data: {
          prompt: `red scarf${ASSISTANT_OPERATOR_APPEND_SEPARATOR}blue eyes`,
          characterName: '林小雨',
        },
      },
      {
        nodeId: 'shot',
        // scene 原本是空的 → 直接替换，不拼分隔符；action 非空 → 追加。
        data: {
          scene: '雨夜巷口',
          action: `走进雨里${ASSISTANT_OPERATOR_APPEND_SEPARATOR}停住脚步`,
        },
      },
    ])
    expect(outcome.inverse.nodeData).toEqual([
      { nodeId: 'hero', data: { prompt: 'red scarf', characterName: '小林' } },
      { nodeId: 'shot', data: { scene: undefined, action: '走进雨里' } },
    ])
    expect(outcome.changes).toEqual([
      'hero:prompt',
      'hero:title',
      'shot:scene',
      'shot:action',
    ])
    expectRoundTrip(graph, outcome)
  })

  it('set_node_fields：档位落视频节点（duration 存字符串、seed 存数字）；imageCategory 顺手清自定义名', () => {
    const input = makeInput()
    const graph = graphOf([VIDEO, LOOSE])
    const outcome = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
          {
            items: [
              {
                nodeId: 'video',
                fields: {
                  duration: 6,
                  seed: 42,
                  resolution: '720p',
                  generateAudio: true,
                },
                mode: 'replace',
              },
              {
                nodeId: 'loose',
                fields: { imageCategory: 'frameStart' },
                mode: 'replace',
              },
            ],
          },
          { items: [] },
        ),
        new Map(),
        input,
      ),
    )
    expect(outcome.patch.nodeData[0].data).toEqual({
      duration: '6',
      seed: 42,
      resolution: '720p',
      generateAudio: true,
    })
    expect(outcome.patch.nodeData[1].data).toEqual({
      imageCategory: 'frameStart',
      imageCategoryLabel: undefined,
    })
    expect(outcome.inverse.nodeData[1].data).toEqual({
      imageCategory: 'custom',
      imageCategoryLabel: '我的分类',
    })
    const applied = expectRoundTrip(graph, outcome)
    expect(applied.nodes[1].data.imageCategoryLabel).toBeUndefined()
  })

  it('set_node_model：目录查表落整条选择（渠道字段一个都不是模型写的）；不在表里就拒', () => {
    const input = makeInput()
    const graph = graphOf([VIDEO])
    const outcome = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel,
          {
            nodeId: 'video',
            modelId: MODEL_OPTION.modelId,
            optionId: MODEL_OPTION.optionId,
          },
          { nodeId: 'video', model: null },
        ),
        new Map(),
        input,
      ),
    )
    expect(outcome.patch.nodeData[0].data.model).toEqual({
      optionId: MODEL_OPTION.optionId,
      modelId: MODEL_OPTION.modelId,
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: MODEL_OPTION.providerConfig,
    })
    expect(outcome.inverse.nodeData[0].data).toEqual({ model: undefined })
    expect(outcome.changes).toEqual(['video:model'])
    expectRoundTrip(graph, outcome)

    expect(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel,
          {
            nodeId: 'video',
            modelId: 'seedance-2.0',
            optionId: 'byteplus:seedance-2.0',
          },
          { nodeId: 'video', model: null },
        ),
        new Map(),
        input,
      ),
    ).toMatchObject({
      kind: 'refused',
      reason: CANVAS_OPERATOR_APPLY_REFUSAL_IDS.unknownModel,
      ref: 'byteplus:seedance-2.0',
    })
  })

  it('attach_refs：按服务端分配的 id 追加到引用架尾部，默认权重同一个常量，撤销回原数组', () => {
    const input = makeInput()
    const existing = {
      id: 'ref-old',
      url: 'https://cdn.example.com/old.png',
      role: 'identity',
      weight: 0.5,
      source: 'upload',
    }
    const target = makeNode('card', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      referenceAssets: [existing],
    })
    const graph = graphOf([target, HERO])
    const outcome = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.attachRefs,
          {
            nodeId: 'card',
            refs: [
              {
                id: 'ref-3-1',
                url: IMAGE_URL,
                role: 'pose',
                source: 'canvas',
                sourceId: 'hero',
                name: '小林',
              },
            ],
          },
          { nodeId: 'card', refIds: ['ref-3-1'] },
        ),
        new Map(),
        input,
      ),
    )
    expect(outcome.patch.nodeData[0].data.referenceAssets).toEqual([
      existing,
      {
        id: 'ref-3-1',
        url: IMAGE_URL,
        role: 'pose',
        weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
        source: 'canvas',
        sourceId: 'hero',
        name: '小林',
      },
    ])
    expect(outcome.inverse.nodeData[0].data).toEqual({
      referenceAssets: [existing],
    })
    expect(outcome.changes).toEqual(['card:references'])
    expectRoundTrip(graph, outcome)
  })

  it('set_review_state：按主媒体 URL 写审核记录；approved 硬禁；没媒体拒', () => {
    const input = makeInput()
    const graph = graphOf([HERO, VIDEO])
    const rejected = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
          {
            nodeId: 'hero',
            state: NODE_REVIEW_STATE_IDS.rejected,
            reason: 'hands',
          },
          { nodeId: 'hero', state: null },
        ),
        new Map(),
        input,
      ),
    )
    expect(rejected.patch.nodeData[0].data.mediaReview).toEqual({
      [IMAGE_URL]: {
        state: NODE_REVIEW_STATE_IDS.rejected,
        reason: 'hands',
        reviewedAt: '2026-09-02T09:00:00.000Z',
      },
    })
    expect(rejected.inverse.nodeData[0].data).toEqual({
      mediaReview: undefined,
    })
    expect(rejected.changes).toEqual(['hero:reviewState'])
    expectRoundTrip(graph, rejected)

    const awaiting = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
          { nodeId: 'hero', state: NODE_REVIEW_STATE_IDS.awaitingReview },
          { nodeId: 'hero', state: null },
        ),
        new Map(),
        input,
      ),
    )
    expect(awaiting.patch.nodeData[0].data.mediaReview).toEqual({
      [IMAGE_URL]: {
        state: NODE_REVIEW_STATE_IDS.awaitingReview,
        markedAt: '2026-09-02T09:00:00.000Z',
      },
    })

    expect(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
          { nodeId: 'hero', state: NODE_REVIEW_STATE_IDS.approved },
          { nodeId: 'hero', state: null },
        ),
        new Map(),
        input,
      ),
    ).toMatchObject({
      kind: 'refused',
      reason: CANVAS_OPERATOR_APPLY_REFUSAL_IDS.approvedForbidden,
    })
    expect(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
          { nodeId: 'video', state: NODE_REVIEW_STATE_IDS.rejected },
          { nodeId: 'video', state: null },
        ),
        new Map(),
        input,
      ),
    ).toMatchObject({
      kind: 'refused',
      reason: CANVAS_OPERATOR_APPLY_REFUSAL_IDS.noMedia,
    })
  })

  it('prime_node_generate：只写 assistantPrimed，撤销回缺席', () => {
    const graph = graphOf([VIDEO])
    const outcome = expectPatch(
      applyCanvasOperatorStep(
        graph,
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
          { nodeId: 'video', primed: true },
          { nodeId: 'video', primed: false },
        ),
        new Map(),
        makeInput(),
      ),
    )
    expect(outcome.patch.nodeData).toEqual([
      { nodeId: 'video', data: { assistantPrimed: true } },
    ])
    expect(outcome.inverse.nodeData).toEqual([
      { nodeId: 'video', data: { assistantPrimed: undefined } },
    ])
    expect(outcome.batch).toBe(false)
    expect(outcome.changes).toEqual(['video:primed'])
    const applied = expectRoundTrip(graph, outcome)
    expect(applied.nodes[0].data.assistantPrimed).toBe(true)
  })

  it('改动型引用一个被人手删掉的节点 → unknownNode，⛔ 不静默', () => {
    const outcome = applyCanvasOperatorStep(
      graphOf([]),
      step(
        ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
        { nodeId: 'gone', primed: true },
        { nodeId: 'gone', primed: false },
      ),
      new Map(),
      makeInput(),
    )
    expect(outcome).toEqual({
      kind: 'refused',
      tool: ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
      reason: CANVAS_OPERATOR_APPLY_REFUSAL_IDS.unknownNode,
      ref: 'gone',
    })
  })
})
