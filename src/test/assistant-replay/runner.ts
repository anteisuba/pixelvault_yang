/**
 * 回放的「前端」：照 `useAssistantOperator` + 画布宿主那样拼请求、读流、落改动、接力。
 *
 * ⭐ 用的都是前端真用的那几个纯函数 —— 快照（`buildCanvasOperatorSnapshot`）、`@` 那一套
 *   （`describeMentionNote` / `toMentionRef`）、落一批（`applyCanvasBatchV4`）、写词前的引用线
 *   检查（`resolveMentionsToSlots`）、读帧（`readAssistantOperatorStream`）。请求打的是真路由的
 *   `POST`，后面整条 v3 环原样跑。
 * ⚠ 前端的 React 状态（线程条目、队列、撤销栈）不在这里：只留接力要用的那几样 —— 本轮的步
 *   （`priorSteps`）、本轮记录（`v3.transcript`）、画布步数（`stepBudget`）。
 */
import type { NextRequest } from 'next/server'

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_MENTION_KIND_IDS,
  ASSISTANT_MENTION_SCOPE_IDS,
} from '@/constants/assistant-mention'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { readAssistantOperatorStream } from '@/lib/api-client/assistant-operator'
import { describeMentionNote, toMentionRef } from '@/lib/assistant-mention'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import { resolveMentionsToSlots } from '@/lib/node-mentions-to-slots'
import { buildCanvasOperatorSnapshot } from '@/lib/studio-operator-canvas-snapshot'
import { planClipFrames } from '@/lib/video-frame-plan'
import { createPOST } from '@/test/api-helpers'
import type { AssistantMention } from '@/types/assistant-mention'
import type {
  AssistantOperatorEvent,
  AssistantOperatorPriorStep,
  AssistantOperatorRequest,
  AssistantOperatorStep,
  AssistantOperatorVideoClip,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

import type { ReplayBoard, ReplayCase } from './fixture'
import { replayAssetBytes } from './fake-network'

const ROUTE_PATH = '/api/studio/assistant-operator'
/** 一轮最多接力几次（前端的上限是步数 `maxCanvasSteps`，这里再兜一道防死循环）。 */
const MAX_REQUESTS = 8

export type ReplayPost = (request: NextRequest) => Promise<Response>

export interface ReplayRun {
  readonly initial: NodeWorkflowStateV4
  readonly final: NodeWorkflowStateV4
  readonly requests: AssistantOperatorRequest[]
  /** 每次请求读到的事件（已过客户端的 schema；坏帧会变成 `STREAM_INTERRUPTED`）。 */
  readonly events: AssistantOperatorEvent[][]
  /** 落到画布上的 op（整轮，按落的顺序）。 */
  readonly landedOps: NodeAssistantOpV4[]
  /** 每一步的最终状态（前端落完改写过的那一份）。 */
  readonly steps: AssistantOperatorStep[]
  /** 非 200 的回复（鉴权 / 校验那一类，流还没开始）。 */
  readonly httpError: { status: number; body: unknown } | null
}

/** 确定的 id：`<前缀>a1000N00-…`，句柄（前 6 位）各不相同。 */
function createMintId() {
  let counter = 0
  return (prefix: string) => {
    counter += 1
    const head = (0xa10000 + counter).toString(16)
    return `${prefix}${head}00-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`
  }
}

/** 板上已有的模型选择当目录：`set_model` 只认板上出现过的型号（真画布认用户可用的那张表）。 */
function createResolveModel(state: NodeWorkflowStateV4) {
  return (modelId: string) => {
    for (const node of state.nodes) {
      const data = node.data
      if (
        data.kind !== NODE_MEDIA_KIND_IDS.text &&
        data.model?.modelId === modelId
      )
        return data.model
    }
    return undefined
  }
}

function nodeByName(state: NodeWorkflowStateV4, name: string): NodeV4 {
  const hits = state.nodes.filter((node) => node.data.name === name)
  if (hits.length !== 1)
    throw new Error(
      `replay: board has ${hits.length} cards named "${name}" (need exactly one)`,
    )
  return hits[0]!
}

/** 画布宿主的 `@` 插件对一张卡给出的那条引用（`use-canvas-operator-host.ts`）。 */
function canvasMention(node: NodeV4): AssistantMention {
  const data = node.data
  const url = data.kind === NODE_MEDIA_KIND_IDS.text ? undefined : data.url
  return {
    kind:
      data.kind === NODE_MEDIA_KIND_IDS.image
        ? ASSISTANT_MENTION_KIND_IDS.image
        : data.kind === NODE_MEDIA_KIND_IDS.video
          ? ASSISTANT_MENTION_KIND_IDS.video
          : data.kind === NODE_MEDIA_KIND_IDS.audio
            ? ASSISTANT_MENTION_KIND_IDS.audio
            : ASSISTANT_MENTION_KIND_IDS.text,
    id: node.id,
    label: data.name,
    scope: ASSISTANT_MENTION_SCOPE_IDS.canvas,
    nodeId: node.id,
    ...(url ? { url } : {}),
  }
}

/** 浏览器抽好的帧（按 `planClipFrames` 的计划，每帧一张真 webp）。 */
async function captureFrames(
  url: string,
  seconds: number,
): Promise<NonNullable<AssistantOperatorVideoClip['frames']>> {
  const plan = planClipFrames(seconds)
  return Promise.all(
    plan.entries.map(async (entry) => {
      const bytes = await replayAssetBytes(
        `${url}#frame-${entry.index}.webp`,
        'image/webp',
      )
      return {
        index: entry.index,
        timestampSeconds: entry.timestampSeconds,
        dataUrl: `data:image/webp;base64,${bytes.toString('base64')}`,
      }
    }),
  )
}

/** 创作者这一句：`@{名字}` → 正文里的「名字」+ 一条 `@` 引用。 */
function parseSay(say: string, state: NodeWorkflowStateV4) {
  const mentions: AssistantMention[] = []
  const text = say.replace(/@\{([^}]+)\}/g, (_match, name: string) => {
    const node = nodeByName(state, name)
    if (!mentions.some((mention) => mention.nodeId === node.id))
      mentions.push(canvasMention(node))
    return `「${name}」`
  })
  return { text, mentions }
}

/** 写词会不会顺手改到引用线（画布宿主 `promptInputSyncFor` 的同一道检查）。 */
function promptInputSyncFor(
  state: NodeWorkflowStateV4,
  op: NodeAssistantOpV4,
): string | undefined {
  if (op.op !== NODE_ASSISTANT_OP_V4_IDS.setPrompt) return undefined
  const target = state.nodes.find((node) => node.id === op.target)
  if (target?.data.kind !== NODE_MEDIA_KIND_IDS.image) return undefined
  const previous = target.data.prompt ?? ''
  const prompt =
    op.mode === 'append' && previous ? `${previous}\n\n${op.prompt}` : op.prompt
  const diff = resolveMentionsToSlots(state, target.id, prompt)
  const disconnect = diff.toDisconnect[0]
  const connect = diff.toConnect[0]
  const firstOp = disconnect
    ? { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: disconnect.edgeId }
    : connect
      ? {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: connect.sourceNodeId,
          target: connect.targetNodeId,
          slot: connect.slot,
        }
      : undefined
  return firstOp
    ? `First canvas_apply ${JSON.stringify(firstOp)}. Then retry set_prompt after canvas_sync; prompt and inputs are unchanged.`
    : undefined
}

/** 一批改动落到画布上，回前端改写过的那一步（全落 / 落一部分 / 一条没落）。 */
function landBatch(
  canvas: { state: NodeWorkflowStateV4 },
  step: AssistantOperatorStep,
  context: {
    mintId: (prefix: string) => string
    resolveModel: ReturnType<typeof createResolveModel>
    landed: NodeAssistantOpV4[]
  },
): AssistantOperatorStep {
  // ⭐ 只在 `done` 那一次落（`running` 也落就落两遍），与 `useAssistantOperator` 同一个判据。
  if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return step
  if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch) return step
  const ops = step.payload.ops
  for (const [index, op] of ops.entries()) {
    const sync = promptInputSyncFor(canvas.state, op)
    if (sync)
      return {
        ...step,
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
        error: {
          reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.referenceInputsChanged,
          detail: `ops[${index}]: ${sync}`.slice(
            0,
            ASSISTANT_OPERATOR_LIMITS.maxReasonChars,
          ),
        },
      }
  }
  const batch = applyCanvasBatchV4(canvas.state, ops, {
    mintId: context.mintId,
    resolveModel: context.resolveModel,
  })
  canvas.state = batch.state
  const failed = new Set(batch.failures.map((failure) => failure.index))
  ops.forEach((op, index) => {
    if (!failed.has(index)) context.landed.push(op)
  })
  if (batch.applied === 0)
    return {
      ...step,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: {
        reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl,
        // ⚠ 真画布这里是界面上那句翻译过的失败原因（`onOpFailed`），回放写原始理由码。
        ...(batch.failures.at(-1)
          ? { detail: batch.failures.at(-1)!.reason }
          : {}),
      },
    }
  if (batch.failures.length === 0) return step
  return {
    ...step,
    status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
    error: {
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.canvasBatchPartial,
      detail:
        `${ops.length - batch.failures.length} of ${ops.length} landed. Not landed: ${batch.failures
          .map(
            (failure) =>
              `ops[${failure.index}] ${ops[failure.index]?.op ?? '?'} — ${failure.reason}`,
          )
          .join('; ')}`.slice(0, ASSISTANT_OPERATOR_LIMITS.maxReasonChars),
    },
  }
}

function toPriorStep(step: AssistantOperatorStep): AssistantOperatorPriorStep {
  return {
    tool: step.tool,
    status: step.status,
    summary: step.title.slice(
      0,
      ASSISTANT_OPERATOR_LIMITS.maxPriorStepSummaryChars,
    ),
    ...(step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
      ? {
          rejectReason: step.error.reason,
          ...(step.error.detail
            ? {
                detail: step.error.detail.slice(
                  0,
                  ASSISTANT_OPERATOR_LIMITS.maxReasonChars,
                ),
              }
            : {}),
        }
      : {}),
    thisTurn: true,
  }
}

export async function runReplayTurn(
  testCase: ReplayCase,
  board: ReplayBoard,
  post: ReplayPost,
): Promise<ReplayRun> {
  const initial = board.state
  const canvas = { state: initial }
  const mintId = createMintId()
  const resolveModel = createResolveModel(initial)
  const { turn } = testCase
  const { text, mentions } = parseSay(turn.say, initial)
  const pointedMentions = mentions.map(toMentionRef)
  const mentionedAssets = mentions.flatMap((mention) =>
    mention.kind === ASSISTANT_MENTION_KIND_IDS.image && mention.url
      ? [
          {
            id: mention.id,
            url: mention.url,
            label: mention.label,
            ...(mention.nodeId ? { nodeId: mention.nodeId } : {}),
          },
        ]
      : [],
  )
  const videoClips: AssistantOperatorVideoClip[] = []
  for (const mention of mentions) {
    if (mention.kind !== ASSISTANT_MENTION_KIND_IDS.video || !mention.url)
      continue
    const seconds = turn.clipSeconds[mention.label]
    videoClips.push({
      sourceUrl: mention.url,
      label: mention.label,
      ...(mention.nodeId ? { nodeId: mention.nodeId } : {}),
      ...(seconds
        ? {
            durationSeconds: seconds,
            frames: await captureFrames(mention.url, seconds),
          }
        : {}),
    })
  }
  const selectedNodeIds = turn.selected.map(
    (name) => nodeByName(initial, name).id,
  )
  const conversation: AssistantOperatorRequest['messages'] = [
    ...turn.history,
    { role: 'user', content: `${text}${describeMentionNote(mentions)}` },
  ]

  const requests: AssistantOperatorRequest[] = []
  const events: AssistantOperatorEvent[][] = []
  const landed: NodeAssistantOpV4[] = []
  /** 本轮的步，按到达顺序；同一个 id 后到的盖前面的（running → done / error）。 */
  const steps = new Map<string, AssistantOperatorStep>()
  let canvasSteps = 0
  let transcript: AssistantV3Transcript | null = null
  let httpError: ReplayRun['httpError'] = null

  for (let hop = 0; hop < MAX_REQUESTS; hop += 1) {
    const state = canvas.state
    const referenceUrls = state.nodes.flatMap((node) =>
      node.data.kind === NODE_MEDIA_KIND_IDS.image && node.data.url
        ? [node.data.url]
        : [],
    )
    const currentShotNo =
      state.nodes.find((node) => node.id === selectedNodeIds[0])?.data.shotNo ??
      null
    const mentionedNodeIds = mentions.flatMap((mention) =>
      mention.nodeId && state.nodes.some((node) => node.id === mention.nodeId)
        ? [mention.nodeId]
        : [],
    )
    const request: AssistantOperatorRequest = {
      messages: conversation,
      domain: 'canvas',
      workspaceKey: `canvas:${board.projectId}`,
      snapshot: {
        prompt: '',
        availableModels: [],
        references: {
          items: referenceUrls
            .slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
            .map((url) => ({
              url,
              name: state.nodes.find(
                (node) =>
                  node.data.kind === NODE_MEDIA_KIND_IDS.image &&
                  node.data.url === url,
              )!.data.name,
              implicit: true,
            })),
          limit: ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences,
        },
        canvas: buildCanvasOperatorSnapshot({
          referenceUrls,
          nodes: state.nodes,
          edges: state.edges,
          currentShotNo,
          selectedNodeIds,
          ...(mentionedNodeIds.length ? { mentionedNodeIds } : {}),
        }),
      },
      stepBudget: ASSISTANT_OPERATOR_LIMITS.maxCanvasSteps - canvasSteps,
      priorSteps: [...steps.values()]
        .filter(
          (step) => step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
        )
        .map(toPriorStep)
        .slice(-ASSISTANT_OPERATOR_LIMITS.maxPriorSteps),
      ...(mentionedAssets.length ? { mentionedAssets } : {}),
      ...(pointedMentions.length ? { mentions: pointedMentions } : {}),
      ...(turn.searchWithGrok ? { searchWithGrok: true as const } : {}),
      // 与前端同一条：只有开轮那一跳带上一轮找到的东西（接力那几跳板子里已经冻着）。
      ...(!transcript && turn.priorFinds?.length
        ? { priorFinds: turn.priorFinds }
        : {}),
      ...(videoClips.length ? { videoClips } : {}),
      ...(hop > 0 ? { planApproved: true } : {}),
      responseLanguage: turn.responseLanguage,
      ...(transcript ? { v3: { transcript } } : {}),
    }
    requests.push(request)

    const response = await post(createPOST(ROUTE_PATH, request))
    if (!response.ok || !response.body) {
      httpError = {
        status: response.status,
        body: await response.json().catch(() => null),
      }
      break
    }
    const hopEvents: AssistantOperatorEvent[] = []
    events.push(hopEvents)
    let canvasSync = false
    for await (const event of readAssistantOperatorStream(response.body)) {
      hopEvents.push(event)
      if (event.type === ASSISTANT_OPERATOR_EVENTS.transcript)
        transcript = event.transcript
      if (event.type === ASSISTANT_OPERATOR_EVENTS.message && event.text.trim())
        conversation.push({ role: 'assistant', content: event.text })
      if (event.type === ASSISTANT_OPERATOR_EVENTS.step) {
        const step = landBatch(canvas, event.step, {
          mintId,
          resolveModel,
          landed,
        })
        steps.set(step.id, step)
        if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
          canvasSteps += 1
      }
      if (
        event.type === ASSISTANT_OPERATOR_EVENTS.stopped &&
        (event.reason === ASSISTANT_OPERATOR_STOP_REASONS.canvasSync ||
          event.reason === ASSISTANT_OPERATOR_STOP_REASONS.timeBudget)
      )
        canvasSync = true
    }
    if (!canvasSync || canvasSteps >= ASSISTANT_OPERATOR_LIMITS.maxCanvasSteps)
      break
  }

  return {
    initial,
    final: canvas.state,
    requests,
    events,
    landedOps: landed,
    steps: [...steps.values()],
    httpError,
  }
}
