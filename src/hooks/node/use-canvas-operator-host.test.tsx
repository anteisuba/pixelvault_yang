import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS } from '@/constants/studio-assistant-operator'
import { AssistantOperatorSnapshotSchema } from '@/types/assistant-operator'
import type {
  NodeWorkflowGraphPatch,
  NodeWorkflowModelOption,
  NodeWorkflowNode,
  NodeWorkflowState,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'
import type { ApplyScriptDocResult } from '@/hooks/node/use-node-workflow'
import {
  getOperatorScriptDocProjection,
  getOperatorState,
  resetOperatorThread,
  setOperatorScriptDocProjection,
} from '@/hooks/use-studio-operator-store'
import type { CanvasOperatorAppliedStep } from '@/lib/canvas-operator-apply'
import { applyNodeWorkflowGraphPatch } from '@/lib/node-workflow-graph-patch'
import {
  applyOperatorStep,
  revertOperatorStep,
} from '@/lib/studio-operator-apply'

import {
  useCanvasOperatorHost,
  type CanvasOperatorWorkflow,
} from './use-canvas-operator-host'

// ─── 夹具：一份会记账的假工作流（语义照抄 useNodeWorkflow 的撤销栈）────────

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

const HERO = makeNode('hero', NODE_TYPE_IDS.image, {
  role: NODE_IMAGE_ROLE_IDS.character,
  characterName: '小林',
  mediaUrl: 'https://cdn.example.com/hero.png',
})
const VIDEO = makeNode('video', NODE_TYPE_IDS.seedance, {
  model: { optionId: 'workspace:seedance-2.0', modelId: 'seedance-2.0' },
})

const SEEDANCE_OPTION: NodeWorkflowModelOption = {
  optionId: 'workspace:seedance-2.0',
  modelId: 'seedance-2.0',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal', baseUrl: 'https://fal.run' },
  requestCount: 10,
  sourceType: 'workspace',
  freeTier: true,
}

interface FakeWorkflow extends CanvasOperatorWorkflow {
  past: NodeWorkflowState[]
  state(): NodeWorkflowState
  /** 剧本文档那三只手的记账（C3）—— 断言「写了什么 / 投了几次」用。 */
  scriptDocWrites: (ScriptDoc | undefined)[]
  projections: number
  preview: ApplyScriptDocResult
}

function makeWorkflow(nodes: NodeWorkflowNode[]): FakeWorkflow {
  let state: NodeWorkflowState = { nodes, edges: [] }
  const past: NodeWorkflowState[] = []
  let suppressed = false
  const record = () => {
    if (suppressed) return
    if (past[past.length - 1] === state) return
    past.push(state)
  }
  return {
    past,
    state: () => state,
    get nodes() {
      return state.nodes
    },
    get edges() {
      return state.edges
    },
    currentProjectId: 'p1',
    currentProjectName: '雨夜',
    scriptDoc: undefined,
    scriptDocWrites: [],
    projections: 0,
    /** 默认「有东西可投」；单个用例按需改成 refusal / 全零。 */
    preview: {
      created: 3,
      updated: 1,
      skipped: 0,
      removed: 2,
      removedEdges: 1,
      refusal: null,
    },
    setScriptDoc(next) {
      this.scriptDocWrites.push(next)
      this.scriptDoc = next
    },
    previewScriptDocProjection() {
      return this.preview
    },
    applyScriptDocToGraph() {
      this.projections += 1
      return this.preview
    },
    readState: () => state,
    applyGraphPatch: (patch: NodeWorkflowGraphPatch) => {
      record()
      state = applyNodeWorkflowGraphPatch(state, patch)
    },
    runAsSingleHistoryStep: async (run) => {
      if (suppressed) return run()
      record()
      suppressed = true
      try {
        return await run()
      } finally {
        suppressed = false
      }
    },
    readUndoTarget: () => past[past.length - 1],
    undo: () => {
      const previous = past.pop()
      if (previous) state = previous
    },
  }
}

const BASE = { title: '一步', status: 'done' } as const
let stepSeq = 0
function step(
  tool: CanvasOperatorAppliedStep['tool'],
  payload: Record<string, unknown>,
  inverse: Record<string, unknown> = {},
): CanvasOperatorAppliedStep {
  stepSeq += 1
  return {
    ...BASE,
    id: `step-${stepSeq}`,
    tool,
    payload,
    inverse,
  } as unknown as CanvasOperatorAppliedStep
}

function setup(nodes: NodeWorkflowNode[] = [HERO, VIDEO]) {
  const workflow = makeWorkflow(nodes)
  const hook = renderHook(() =>
    useCanvasOperatorHost({
      workflow,
      modelOptionsByType: { [NODE_TYPE_IDS.seedance]: [SEEDANCE_OPTION] },
      getNodeTypeLabel: (type) => `type:${type}`,
      open: false,
      setOpen: () => {},
    }),
  )
  return { workflow, host: () => hook.result.current }
}

/**
 * ⚠ 两步之间要冲一次微任务：`runAsSingleHistoryStep` 的 `finally` 在 await 之后才把
 * 批次开关放下，同一个同步 tick 里连落两步会被折成一批（真实路径上两步隔着一次
 * SSE 宏任务，这里用 async act 模拟）。
 */
async function stageAndConnect(host: ReturnType<typeof setup>['host']) {
  const stage = step(
    ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
    {
      items: [
        { alias: 'new:1', type: NODE_TYPE_IDS.seedance, title: '第二镜' },
      ],
    },
    { nodeIds: ['new:1'] },
  )
  const connect = step(
    ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
    { items: [{ source: 'hero', target: 'new:1' }] },
    { items: [{ source: 'hero', target: 'new:1' }] },
  )
  await act(async () => {
    host().apply.canvas?.apply(stage)
  })
  await act(async () => {
    host().apply.canvas?.apply(connect)
  })
  return { stage, connect }
}

beforeEach(() => {
  resetOperatorThread()
  // ⚠ 投影确认门是模块级的（与 `runner` / `pendingAttachment` 同一层），
  //    不清会漏进下一个用例 —— 那正是本仓 mock 队列踩过的同一种坑。
  setOperatorScriptDocProjection(null)
})

describe('useCanvasOperatorHost', () => {
  it('域是 canvas；快照过协议 schema、根上没有 prompt、目录带 optionId 与相对价签', () => {
    const { host } = setup()
    expect(host().domain).toBe(ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas)
    const snapshot = host().buildSnapshot()
    expect(AssistantOperatorSnapshotSchema.safeParse(snapshot).success).toBe(
      true,
    )
    expect('prompt' in snapshot).toBe(false)
    expect(snapshot.canvas?.nodes.map((node) => node.id)).toEqual([
      'hero',
      'video',
    ])
    expect(snapshot.canvas?.modelOptions).toEqual([
      expect.objectContaining({
        nodeType: NODE_TYPE_IDS.seedance,
        modelId: 'seedance-2.0',
        optionId: 'workspace:seedance-2.0',
        priceLabel: 'free',
      }),
    ])
    expect(host().apply.canvas).toBeDefined()
  })

  it('快照每次现读：图变了之后再 build 看到的是新图', async () => {
    const { host, workflow } = setup()
    await stageAndConnect(host)
    const snapshot = host().buildSnapshot()
    expect(snapshot.canvas?.nodes).toHaveLength(3)
    expect(snapshot.canvas?.edges).toHaveLength(1)
    expect(workflow.state().edges[0].target).toBe(workflow.state().nodes[2].id)
  })

  it('落笔经 runAsSingleHistoryStep：一批 = 一个撤销步，别名跨步解析成真实 id', async () => {
    const { host, workflow } = setup()
    await stageAndConnect(host)
    expect(workflow.past).toHaveLength(2)
    const staged = workflow.state().nodes[2]
    expect(staged.type).toBe(NODE_TYPE_IDS.seedance)
    expect(staged.data.mediaLabel).toBe('第二镜')
    expect(workflow.state().edges[0]).toMatchObject({
      source: 'hero',
      target: staged.id,
    })
    expect(host().apply.canvas?.changes()).toEqual([
      `${staged.id}:nodes`,
      'hero:edges',
    ])
  })

  it('批撤只在最近一步可点：先撤连再撤建，撤过的不能再撤，set_* 不走这道门', async () => {
    const { host, workflow } = setup()
    const { stage, connect } = await stageAndConnect(host)
    const canvas = () => host().apply.canvas!

    expect(canvas().canUndoBatch(stage)).toEqual({
      ok: false,
      reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.notLatest,
    })
    expect(canvas().canUndoBatch(connect)).toEqual({ ok: true })

    await act(async () => {
      expect(canvas().revert(connect)).toEqual({ ok: true })
    })
    expect(workflow.state().edges).toEqual([])
    // 批撤走 undo()：栈顶弹回去，前一批又成了最近一步。
    expect(canvas().canUndoBatch(stage)).toEqual({ ok: true })
    expect(canvas().canUndoBatch(connect)).toEqual({
      ok: false,
      reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.alreadyUndone,
    })

    await act(async () => {
      expect(canvas().revert(stage)).toEqual({ ok: true })
    })
    expect(workflow.state().nodes.map((node) => node.id)).toEqual([
      'hero',
      'video',
    ])

    const unknown = step(
      ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
      { items: [{ alias: 'new:1', type: NODE_TYPE_IDS.shotText }] },
      { nodeIds: ['new:1'] },
    )
    expect(canvas().canUndoBatch(unknown)).toEqual({
      ok: false,
      reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.unknownStep,
    })

    const prime = step(
      ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
      { nodeId: 'video', primed: true },
      { nodeId: 'video', primed: false },
    )
    await act(async () => {
      canvas().apply(prime)
    })
    expect(canvas().canUndoBatch(prime)).toEqual({
      ok: false,
      reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.notBatch,
    })
  })

  it('人手动过画布之后，批不再是最近一步', async () => {
    const { host, workflow } = setup()
    const { connect } = await stageAndConnect(host)
    await act(async () => {
      workflow.applyGraphPatch({
        addNodes: [makeNode('manual', NODE_TYPE_IDS.image)],
        removeNodeIds: [],
        addEdges: [],
        removeEdgeIds: [],
        nodeData: [],
      })
    })
    expect(host().apply.canvas?.canUndoBatch(connect)).toEqual({
      ok: false,
      reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.notLatest,
    })
  })

  it('set_* 字段级 inverse：撤销回落笔前的值，登记簿随之清掉', async () => {
    const { host, workflow } = setup()
    const prime = step(
      ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
      { nodeId: 'video', primed: true },
      { nodeId: 'video', primed: false },
    )
    await act(async () => {
      host().apply.canvas?.apply(prime)
    })
    expect(workflow.state().nodes[1].data.assistantPrimed).toBe(true)
    expect(host().apply.canvas?.changes()).toEqual(['video:primed'])
    await act(async () => {
      expect(host().apply.canvas?.revert(prime)).toEqual({ ok: true })
    })
    expect(workflow.state().nodes[1].data.assistantPrimed).toBeUndefined()
    expect(host().apply.canvas?.changes()).toEqual([])
    // 撤销本身也是一步（字段级走逆补丁 + runAsSingleHistoryStep）。
    expect(workflow.past).toHaveLength(2)
  })

  it('落不下去：往线程里插系统行，⛔ 不静默', async () => {
    const { host, workflow } = setup()
    await act(async () => {
      host().apply.canvas?.apply(
        step(
          ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
          { nodeId: 'gone', primed: true },
          { nodeId: 'gone', primed: false },
        ),
      )
    })
    expect(
      getOperatorState().entries.map((entry) =>
        entry.kind === 'system' ? entry.code : entry.kind,
      ),
    ).toEqual(['canvasStepRefused'])
    expect(workflow.past).toHaveLength(0)
  })

  // ─── update_script_doc（C3）───────────────────────────────────────

  const SCRIPT_DOC: ScriptDoc = {
    title: '雨夜',
    logline: '她在雨里找一把伞',
    roles: [],
    shots: [{ id: 's1', summary: '走进雨里', roleIds: [], dialogue: [] }],
  }

  function scriptDocStep(doc: ScriptDoc = SCRIPT_DOC) {
    return step(
      ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
      { doc },
      {
        doc: null,
      },
    )
  }

  it('⭐ 写文档 → 挂起投影确认门（⛔ 不自动投影：投影会删节点）', async () => {
    const { host, workflow } = setup()
    await act(async () => {
      host().apply.canvas?.apply(scriptDocStep())
    })

    expect(workflow.scriptDocWrites).toEqual([SCRIPT_DOC])
    // 写文档是一步撤销（包在 runAsSingleHistoryStep 里）。
    expect(workflow.past).toHaveLength(1)
    // ⛔ 没有自动落到画布上。
    expect(workflow.projections).toBe(0)

    const pending = getOperatorScriptDocProjection()
    expect(pending).not.toBeNull()
    expect(pending?.title).toBe('雨夜')
    expect(pending?.created).toBe(3)
    expect(pending?.removed).toBe(2)

    // 线程里说明白了「写好了但还没投」，破坏性的那两个数进 count。
    const entries = getOperatorState().entries
    const system = entries.find((entry) => entry.kind === 'system')
    expect(system).toMatchObject({
      code: 'canvasScriptDocPending',
      subject: '雨夜',
      count: 3,
    })
  })

  it('确认之后才走 applyScriptDocToGraph，门随即收掉', async () => {
    const { host, workflow } = setup()
    await act(async () => {
      host().apply.canvas?.apply(scriptDocStep())
    })
    act(() => {
      getOperatorScriptDocProjection()?.confirm()
    })
    expect(workflow.projections).toBe(1)
    expect(getOperatorScriptDocProjection()).toBeNull()
  })

  it('取消只收门，文档留着（⚠ 取消的是这一次投影，不是那次写入）', async () => {
    const { host, workflow } = setup()
    await act(async () => {
      host().apply.canvas?.apply(scriptDocStep())
    })
    act(() => {
      getOperatorScriptDocProjection()?.cancel()
    })
    expect(workflow.projections).toBe(0)
    expect(getOperatorScriptDocProjection()).toBeNull()
    expect(workflow.scriptDoc).toEqual(SCRIPT_DOC)
  })

  it('投影无事可做时不挂门，⛔ 也不静默 —— 换一条系统行', async () => {
    const { host, workflow } = setup()
    workflow.preview = {
      created: 0,
      updated: 0,
      skipped: 2,
      removed: 0,
      removedEdges: 0,
      refusal: null,
    }
    await act(async () => {
      host().apply.canvas?.apply(scriptDocStep())
    })
    expect(getOperatorScriptDocProjection()).toBeNull()
    expect(
      getOperatorState().entries.map((entry) =>
        entry.kind === 'system' ? entry.code : entry.kind,
      ),
    ).toEqual(['canvasScriptDocNothing'])
  })

  it('撤销把文档写回改前那份，并收掉还没确认的那道门', async () => {
    const { host, workflow } = setup()
    const prior: ScriptDoc = {
      title: '旧',
      logline: '',
      roles: [],
      shots: [],
    }
    workflow.scriptDoc = prior
    const entry = scriptDocStep()
    await act(async () => {
      host().apply.canvas?.apply(entry)
    })
    expect(getOperatorScriptDocProjection()).not.toBeNull()

    await act(async () => {
      expect(host().apply.canvas?.revert(entry)).toEqual({ ok: true })
    })
    expect(workflow.scriptDoc).toEqual(prior)
    expect(getOperatorScriptDocProjection()).toBeNull()
    // ⚠ 撤的是文档，⛔ 不是「撤销这一批」那道门（它不是批步）。
    expect(host().apply.canvas?.canUndoBatch(entry)).toEqual({
      ok: false,
      reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.notBatch,
    })
  })

  it('登记簿粒度是 `${projectId}:scriptDoc`（项目级，不是某个节点的）', async () => {
    const { host } = setup()
    await act(async () => {
      host().apply.canvas?.apply(scriptDocStep())
    })
    expect(host().apply.canvas?.changes()).toEqual(['p1:scriptDoc'])
  })

  it('经 applyOperatorStep / revertOperatorStep 分派：画布步落到图上、返回 null（登记簿归画布自己）', async () => {
    const { host, workflow } = setup()
    const fields = step(
      ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
      {
        items: [
          { nodeId: 'hero', fields: { prompt: 'red scarf' }, mode: 'replace' },
        ],
      },
      { items: [{ nodeId: 'hero', fields: { prompt: '' } }] },
    )
    let outcome: unknown = 'unset'
    await act(async () => {
      outcome = applyOperatorStep(fields, host().apply)
    })
    expect(outcome).toBeNull()
    expect(workflow.state().nodes[0].data.prompt).toBe('red scarf')
    await act(async () => {
      revertOperatorStep(fields, host().apply)
    })
    expect(workflow.state().nodes[0].data.prompt).toBe('')
  })
})
