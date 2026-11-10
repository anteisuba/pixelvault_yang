/**
 * L2c 画布下一轮对账：画布那两条工具（`canvas_apply` / `canvas_batch`）服务端一格台面都不动
 * （`apply` 是空的），后果全靠浏览器落到图上、下一轮带新快照回来。所以这里核的是：
 * 这一步过客户端 schema → 真 `applyOperatorStep` → 宿主同一个纯执行器 `applyCanvasBatchV4`
 * 落进真图 → 宿主同一份 `buildCanvasOperatorSnapshot` → 真 `prepareOperatorTurn`（真库），
 * 下一轮读到的那张卡**真变了**，变成这一步说的样子。
 * ⚠ `ctx.canvas` 的落法逐条抄 `use-canvas-operator-host.ts`（单条也走批执行器，与 `dispatchBatch` 同源）。
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS as T,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { NODE_ASSISTANT_OP_V4_IDS as OP } from '@/constants/node-assistant-ops'
import { prepareOperatorTurn } from '@/features/assistant/services/assistant-operator-turn.service'
import { planTool } from '@/features/assistant/services/assistant-operator-tools.service'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import {
  applyOperatorStep,
  type StudioOperatorApplyContext,
} from '@/lib/studio-operator-apply'
import { buildCanvasOperatorSnapshot } from '@/lib/studio-operator-canvas-snapshot'
import {
  AssistantOperatorAppliedStepSchema,
  type AssistantOperatorSnapshot,
} from '@/types/assistant-operator'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  NodeWorkflowStateV4Schema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Run = Awaited<ReturnType<typeof prepareOperatorTurn>>['run']

const CREATED_AT = '2026-11-03T00:00:00.000Z'

function board() {
  let graph: NodeWorkflowStateV4 = NodeWorkflowStateV4Schema.parse({
    version: 4,
    nodes: [
      {
        id: 'n_note',
        position: { x: 0, y: 0 },
        data: {
          kind: 'text',
          subtype: 'shotNote',
          name: '旁白',
          label: '旁白',
          body: '开场',
          createdAt: CREATED_AT,
        },
      },
      {
        id: 'n_shot',
        position: { x: 400, y: 0 },
        data: {
          kind: 'image',
          subtype: 'shot',
          name: '镜1',
          status: 'idle',
          prompt: 'a fox',
          createdAt: CREATED_AT,
        },
      },
    ],
    edges: [],
  })
  let counter = 0
  const mintId = (prefix: string) => `${prefix}${++counter}`

  const snapshot = (): AssistantOperatorSnapshot => ({
    prompt: '',
    availableModels: [],
    references: {
      items: [],
      limit: ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences,
    },
    canvas: buildCanvasOperatorSnapshot({
      nodes: graph.nodes,
      edges: graph.edges,
      currentShotNo: null,
      // 两张都「点着」：快照里点着的卡给全文，和创作者 @ 过一样。
      selectedNodeIds: graph.nodes.map((node) => node.id),
    }),
  })

  const land = (ops: readonly NodeAssistantOpV4[]) => {
    const batch = applyCanvasBatchV4(graph, ops, { mintId })
    graph = batch.state
    return batch
  }

  const ctx = {
    canvas: {
      applyOp: (_stepId: string, op: NodeAssistantOpV4) =>
        land([op]).applied > 0,
      applyOps: (_stepId: string, ops: readonly NodeAssistantOpV4[]) => {
        const batch = land(ops)
        return { applied: batch.applied, failures: batch.failures }
      },
      revertOp: () => false,
      generate: () => {},
    },
  } as unknown as StudioOperatorApplyContext

  return { snapshot, ctx, graph: () => graph }
}

let user: Awaited<ReturnType<typeof createTestUser>>
let projectId: string

beforeEach(async () => {
  await resetDatabase()
  user = await createTestUser()
  await seedAssistantKey(user.id)
  projectId = (
    await db.nodeWorkflowProject.create({
      data: {
        userId: user.id,
        name: '画布对账',
        state: { version: 4, nodes: [], edges: [] },
      },
    })
  ).id
})

async function openTurn(snapshot: AssistantOperatorSnapshot) {
  const prepared = await prepareOperatorTurn(
    user.clerkId,
    {
      messages: [{ role: 'user', content: '帮我改一下画布' }],
      domain: 'canvas',
      workspaceKey: `canvas:${projectId}`,
      snapshot,
    },
    new AbortController().signal,
  )
  prepared.run.nextKernel = true
  return prepared.run
}

function cards(run: Run) {
  return (run.state.canvas?.shots ?? []).flatMap((shot) =>
    shot.expanded ? shot.nodes : [],
  )
}

const CASES: Array<{
  name: string
  tool: AssistantOperatorTool
  args: Record<string, unknown>
  /** 下一轮读到的画布上该看见的。 */
  expectNext: (next: Run) => void
}> = [
  {
    name: 'canvas_apply 写镜头词',
    tool: T.canvasApply,
    args: {
      op: OP.setPrompt,
      target: 'n_shot',
      prompt: 'a red fox in snow',
      mode: 'replace',
    },
    expectNext: (next) =>
      expect(cards(next).find((card) => card.id === 'n_shot')?.text).toBe(
        'a red fox in snow',
      ),
  },
  {
    name: 'canvas_apply 改文字卡正文',
    tool: T.canvasApply,
    args: { op: OP.setText, target: 'n_note', body: '天亮了', mode: 'append' },
    expectNext: (next) =>
      expect(cards(next).find((card) => card.id === 'n_note')?.text).toContain(
        '天亮了',
      ),
  },
  {
    name: 'canvas_batch 新建一张卡并接到镜头上',
    tool: T.canvasBatch,
    args: {
      ops: [
        {
          op: OP.addNode,
          kind: 'image',
          subtype: 'background',
          ref: 'bg',
          name: '雪地',
        },
        { op: OP.connect, source: 'bg', target: 'n_shot', slot: 'reference' },
      ],
    },
    expectNext: (next) => {
      const created = cards(next).find((card) => card.name === '雪地')
      expect(created, '新卡没出现在下一轮的画布上').toBeDefined()
      const shot = cards(next).find((card) => card.id === 'n_shot')
      expect(JSON.stringify(shot)).toContain(created!.id)
    },
  },
]

describe('画布：这一步落到图上之后，下一轮读到的就是这一步说的样子', () => {
  it.each(CASES)('$name', async ({ tool, args, expectNext }) => {
    const canvas = board()
    const run = await openTurn(canvas.snapshot())

    const plan = await planTool(run, tool, args, user.id)
    expect(plan.kind, JSON.stringify(plan).slice(0, 400)).toBe('mutate')
    if (plan.kind !== 'mutate') return
    plan.apply()

    const before = canvas.graph()
    const step = AssistantOperatorAppliedStepSchema.parse({
      id: 'step-1',
      verb: ASSISTANT_OPERATOR_TOOL_VERBS[tool],
      title: tool,
      tool,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      payload: plan.payload,
      inverse: plan.inverse,
    })
    applyOperatorStep(step, canvas.ctx)
    expect(canvas.graph(), '这一步没落到图上').not.toBe(before)

    expectNext(await openTurn(canvas.snapshot()))
  })
})
