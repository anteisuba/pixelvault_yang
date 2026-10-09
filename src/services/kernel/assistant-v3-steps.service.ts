import 'server-only'

import {
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  type AssistantOperatorRejectReason,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_FACE_IDS,
  type AssistantV3Face,
} from '@/constants/assistant-v3'
import { logger } from '@/lib/logger'
import type { AssistantV3Handles } from '@/lib/assistant-v3-board'
import type { PromptAssistantResponseLanguage } from '@/types'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import {
  isFatalOperatorToolError,
  planTool,
  recordLedgerStep,
  rememberStepArtifacts,
  TOOL_FAILED_DETAIL,
  toStepEvent,
  type PreparedOperatorTurn,
  type ToolPlan,
} from '@/services/kernel/assistant-operator.service'

/**
 * v3 两张脸共用的那一层（S6）：过程行、调旧执行器、把执行器的计划变成步与工具结果。
 * ⚠ 画布与工作台只差一处 —— 改动型那一步：画布要前端落完再接力（`pending`），
 *   工作台随步落、当场就有结果。
 */

export const TITLE_TEXT: Record<
  PromptAssistantResponseLanguage,
  {
    read: string
    look: string
    add: string
    set: string
    connect: string
    disconnect: string
    delete: string
    move: string
    reorder: string
    project: string
    write: string
    edit: string
    generate: string
    searchWeb: string
    searchLibrary: string
    inspect: string
    searchLora: string
    model: string
    params: string
    weight: string
    unmount: string
    setup: string
    picks: string
    prompt: string
    negative: string
    more: (count: number) => string
  }
> = {
  chinese: {
    read: '读取',
    look: '查看',
    add: '新建',
    set: '设置',
    connect: '连接',
    disconnect: '断开',
    delete: '删除',
    move: '移动',
    reorder: '调整镜头顺序',
    project: '投影剧本',
    write: '改写',
    edit: '修改',
    generate: '准备生成',
    searchWeb: '联网查',
    searchLibrary: '素材库找',
    inspect: '核对参考图',
    searchLora: '找 LoRA',
    model: '换底模',
    params: '调参数',
    weight: '调权重',
    unmount: '卸下',
    setup: '摆搭配卡',
    picks: '在库页圈出',
    prompt: '提示词',
    negative: '负面',
    more: (count) => `等 ${count} 项`,
  },
  japanese: {
    read: '読み込み',
    look: '確認',
    add: '作成',
    set: '設定',
    connect: '接続',
    disconnect: '切断',
    delete: '削除',
    move: '移動',
    reorder: 'ショット順を変更',
    project: '脚本を展開',
    write: '書き換え',
    edit: '修正',
    generate: '生成を準備',
    searchWeb: 'Web 検索',
    searchLibrary: '素材検索',
    inspect: '参照画像を確認',
    searchLora: 'LoRA を検索',
    model: 'ベースモデルを変更',
    params: 'パラメータを調整',
    weight: '重みを調整',
    unmount: '外す',
    setup: '組み合わせカードを出す',
    picks: 'ライブラリで囲む',
    prompt: 'プロンプト',
    negative: 'ネガティブ',
    more: (count) => `ほか ${count} 件`,
  },
  english: {
    read: 'Read',
    look: 'Look at',
    add: 'Add',
    set: 'Set',
    connect: 'Connect',
    disconnect: 'Disconnect',
    delete: 'Delete',
    move: 'Move',
    reorder: 'Reorder shots',
    project: 'Project script',
    write: 'Rewrite',
    edit: 'Edit',
    generate: 'Prepare',
    searchWeb: 'Search the web for',
    searchLibrary: 'Search the library for',
    inspect: 'Check references',
    searchLora: 'Search LoRAs for',
    model: 'Switch base model',
    params: 'Adjust parameters',
    weight: 'Set weight of',
    unmount: 'Unmount',
    setup: 'Propose a setup',
    picks: 'Ring in the library',
    prompt: 'prompt',
    negative: 'negative',
    more: (count) => `+${count} more`,
  },
}

export function clampTitle(value: string): string {
  const max = ASSISTANT_OPERATOR_LIMITS.maxTitleChars
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export type V3Outcome =
  | { kind: 'result'; output: string; error: boolean; failureKey?: string }
  /** 交给前端落了，结果等接力那一跳再补。 */
  | { kind: 'pending' }
  /** 停在问题卡 / 确认卡上，等创作者。 */
  | { kind: 'stop'; todo: string }

export interface V3Context {
  /** 哪张脸：画布的改动要前端落完再接力，工作台的改动随步落、当场就有结果。 */
  readonly face: AssistantV3Face
  readonly clerkId: string
  readonly prepared: PreparedOperatorTurn
  readonly request: AssistantOperatorRequest
  /** 画布上的卡（别的脸是空的）。 */
  readonly nodes: readonly AssistantOperatorCanvasNode[]
  /** 板子上的句柄：画布是卡，LoRA 台是挂着的那几把。 */
  readonly handles: AssistantV3Handles
  readonly language: PromptAssistantResponseLanguage
  readonly stepPrefix: string
  /** 本轮记录（同一个数组，回合循环往里追加）—— 出片前核对过没有，从这里看。 */
  readonly transcript: AssistantV3Transcript
  /** 这一条回复模型自己写了的正文（停在卡上时，没写才替它说 `say`）。 */
  readonly replyText: { current: string }
}

/** 停在卡上的那一轮：模型这条回复没写正文，就把卡上的 `say` 说出来。 */
export function* sayAboveCard(
  context: V3Context,
  say: string,
): Generator<AssistantOperatorEvent> {
  const text = say.trim()
  if (!text || context.replyText.current.trim()) return
  context.replyText.current = text
  yield { type: ASSISTANT_OPERATOR_EVENTS.message, text }
}

export function joinPhrases(
  context: V3Context,
  phrases: readonly string[],
): string {
  const text = TITLE_TEXT[context.language]
  const head = phrases.slice(0, 2).join('；')
  return clampTitle(
    phrases.length > 2 ? `${head} ${text.more(phrases.length - 2)}` : head,
  )
}

export function nextStep(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
) {
  const run = context.prepared.run
  run.stepSeq += 1
  return {
    id: `${context.stepPrefix}-${run.stepSeq}`,
    tool,
    verb: ASSISTANT_OPERATOR_TOOL_VERBS[tool],
    title: clampTitle(title || tool),
  }
}

export function planSafely(
  context: V3Context,
  tool: AssistantOperatorTool,
  args: unknown,
): Promise<ToolPlan> {
  return planGuarded(context, tool, () =>
    planTool(context.prepared.run, tool, args, context.prepared.user.id),
  )
}

export async function planGuarded(
  context: V3Context,
  tool: AssistantOperatorTool,
  plan: () => Promise<ToolPlan>,
): Promise<ToolPlan> {
  const run = context.prepared.run
  try {
    const planned = await plan()
    run.signal?.throwIfAborted()
    return planned
  } catch (error) {
    run.signal?.throwIfAborted()
    if (isFatalOperatorToolError(error)) throw error
    logger.warn('assistant v3 tool failed while planning', {
      userId: context.clerkId,
      tool,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      kind: 'rejected',
      reason: REJECT.toolFailed,
      detail: TOOL_FAILED_DETAIL,
    }
  }
}

/** 写提示词时规划器顺手复核过参考图：那一步也要在时间线上留一行。 */
export function* flushInspectedReferences(
  context: V3Context,
): Generator<AssistantOperatorEvent> {
  const run = context.prepared.run
  if (!run.inspectedCanvasReferences) return
  const analysis = run.inspectedCanvasReferences
  run.inspectedCanvasReferences = null
  const step = nextStep(
    context,
    TOOL.analyzeReferences,
    TITLE_TEXT[context.language].inspect,
  )
  yield toStepEvent({
    ...step,
    status: STATUS.done,
    payload: {},
    result: analysis,
  })
}

export function* rejectedStep(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
  reason: AssistantOperatorRejectReason,
  detail: string,
  draft: boolean,
): Generator<AssistantOperatorEvent, V3Outcome> {
  yield toStepEvent({
    ...nextStep(context, tool, title),
    status: STATUS.error,
    error: {
      reason,
      detail: detail.slice(0, ASSISTANT_OPERATOR_LIMITS.maxReasonChars),
    },
    ...(draft ? { draft: true } : {}),
  })
  return {
    kind: 'result',
    output: detail,
    error: true,
    failureKey: `${tool}:${reason}`,
  }
}

/** 旧执行器给回来的那份计划 → 时间线上的步 + 给模型的结果。 */
export async function* settlePlan(
  context: V3Context,
  tool: AssistantOperatorTool,
  title: string,
  plan: ToolPlan,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  const run = context.prepared.run
  yield* flushInspectedReferences(context)
  switch (plan.kind) {
    case 'rejected':
      // 一改什么都没变（要的值卡上本来就是）：不算一步，⛔ 在时间线上留一条红行。
      if (plan.reason === REJECT.repeatedStep)
        return {
          kind: 'result',
          output: plan.detail ?? 'Nothing changed: the board already had that.',
          error: false,
        }
      return yield* rejectedStep(
        context,
        tool,
        title,
        plan.reason,
        plan.detail ?? plan.reason,
        plan.quiet === true,
      )
    case 'read': {
      const step = nextStep(context, tool, title)
      yield toStepEvent({
        ...step,
        status: STATUS.running,
        payload: plan.payload,
        result: null,
      })
      let outcome: Awaited<ReturnType<typeof plan.run>>
      try {
        outcome = await plan.run()
      } catch (error) {
        run.signal?.throwIfAborted()
        if (isFatalOperatorToolError(error)) throw error
        yield toStepEvent({
          ...step,
          status: STATUS.error,
          error: { reason: REJECT.toolFailed },
        })
        return {
          kind: 'result',
          output: TOOL_FAILED_DETAIL,
          error: true,
          failureKey: `${tool}:${REJECT.toolFailed}`,
        }
      }
      const done = {
        ...step,
        status: STATUS.done,
        payload: plan.payload,
        result: outcome.result,
      }
      yield toStepEvent(done)
      rememberStepArtifacts(run, done)
      recordLedgerStep(run, step.verb, step.title, outcome.observation)
      return { kind: 'result', output: outcome.observation, error: false }
    }
    case 'mutate': {
      const step = nextStep(context, tool, title)
      const applied = { ...step, payload: plan.payload, inverse: plan.inverse }
      yield toStepEvent({ ...applied, status: STATUS.running })
      plan.apply()
      yield toStepEvent({ ...applied, status: STATUS.done })
      recordLedgerStep(run, step.verb, step.title, plan.observation)
      // 画布的改动要等前端落完再接力；工作台的改动随这一步落下，当场就算数。
      return context.face === ASSISTANT_V3_FACE_IDS.canvas
        ? { kind: 'pending' }
        : { kind: 'result', output: plan.observation, error: false }
    }
    case 'ask':
      yield { type: ASSISTANT_OPERATOR_EVENTS.ask, questions: [plan.question] }
      return { kind: 'stop', todo: plan.todo }
    case 'confirmGenerate':
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.confirm,
        confirm: {
          kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
          request: plan.request,
        },
      }
      return {
        kind: 'stop',
        todo: plan.request.canvasNode
          ? `等你确认生成「${plan.request.canvasNode.name}」`
          : `等你确认生成 ${plan.request.count} 张`,
      }
    case 'confirmLoraSetup':
      // 搭配卡：一把都没挂、一格都没改，创作者点「应用」时客户端逐行落。
      yield {
        type: ASSISTANT_OPERATOR_EVENTS.confirm,
        confirm: {
          kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraSetup,
          setup: plan.setup,
        },
      }
      return { kind: 'stop', todo: '等你决定要不要应用这套搭配' }
    default:
      return yield* rejectedStep(
        context,
        tool,
        title,
        REJECT.noSuchControl,
        'This step is not available in this assistant yet.',
        false,
      )
  }
}
