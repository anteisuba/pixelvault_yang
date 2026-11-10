import { ASSISTANT_OPERATOR_STOP_REASONS } from '@/constants/assistant-operator'
import type {
  AssistantOperatorBenchOpen,
  AssistantOperatorEvent,
  AssistantOperatorRoundSummary,
} from '@/types/assistant-operator'
import type {
  StudioOperatorStatus,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

/**
 * 流里那几种**只改时间线**的帧该怎么落 —— 纯函数层（拆前端第 2 片，11-10）。
 *
 * ⭐ 这里只做**判断**：正文这一段写回此刻那条还是另起一条、定稿写进哪几条、`stopped`
 *   帧落成什么。读写状态仓库、念出来、改 run 闭包里的变量，全在 `use-assistant-operator`
 *   那一侧，按这里的结论去做。
 *
 * ⚠ 正文按序号认条目（`runKey:…msg-N`），序号只在这一段**已经被别的条目压在下面**时才进位：
 *   压在下面 = 后面的字属于新的一段（写回上面那条读起来像时间倒流）；还在线程末尾 =
 *   就是同一段，写回它。
 */

type ThreadEntries = readonly StudioOperatorThreadEntry[]
type MessageEntry = Extract<StudioOperatorThreadEntry, { kind: 'message' }>
type StoppedEvent = Extract<AssistantOperatorEvent, { type: 'stopped' }>

function messageAt(
  entries: ThreadEntries,
  id: string,
): { index: number; entry: MessageEntry | undefined } {
  const index = entries.findIndex(
    (entry) => entry.kind === 'message' && entry.id === id,
  )
  const entry = index >= 0 ? entries[index] : undefined
  return { index, entry: entry?.kind === 'message' ? entry : undefined }
}

/**
 * 正文增量来了，要不要另起一条（序号进一位）。
 *
 * 🔬 2026-09-30 真机：模型在工具轮先写了一句旁白，工具步随后压在它下面；收尾轮的增量若还
 * 写回那条，正文就接在旁白后面，定稿再另起一条 —— 同一段回答出现两遍。
 * ⚠ `restart`（这一步重写了一份新稿）：还在流的旧稿就地换掉；已经定稿的那段不动，新稿另起一条。
 */
export function deltaStartsNewMessage(
  entries: ThreadEntries,
  id: string,
  restart: boolean,
): boolean {
  const { index, entry } = messageAt(entries, id)
  if (index < 0) return false
  if (index !== entries.length - 1) return true
  return restart && entry !== undefined && !entry.streaming
}

/**
 * 思考帧来了，要不要另起一条：那一格已经被压在下面、或已经收成回执（不再 `streaming`），
 * 这一段就是新的一段。
 */
export function thinkingStartsNewMessage(
  entries: ThreadEntries,
  id: string,
): boolean {
  const { index, entry } = messageAt(entries, id)
  if (!entry) return false
  return index !== entries.length - 1 || !entry.streaming
}

export type MessageFinal =
  /** 增量已经把这一段写全了：就地定稿这几条（中间可能被一步联网隔成两条）。 */
  | { kind: 'streamed'; entries: { id: string; text: string }[] }
  /** 写进此刻那一条；`startsNew` = 先进一位再写。 */
  | { kind: 'single'; startsNew: boolean }

/**
 * 定稿帧（`message`）写进哪几条 —— 正文**按条目覆盖**，⛔ 不追加。
 *
 * 🔬 2026-10-25 真机：模型先说一句、再联网查（厂商自己跑的那一步在流的中途落进线程，压在这句
 * 下面），定稿帧随后到 —— 按「被压在下面就另起一条」会把同一句话再写一遍。所以先看这一次调用的
 * 增量写进了哪几条（`deltaIds`）：拼起来就是定稿那段，就地定稿它们；拼不上（少见：增量丢了 /
 * 改写过）才按序号覆盖此刻那一条。
 */
export function finalMessagePlan(
  entries: ThreadEntries,
  deltaIds: readonly string[],
  id: string,
  text: string,
): MessageFinal {
  const streamed = deltaIds.flatMap((deltaId) => {
    const entry = messageAt(entries, deltaId).entry
    return entry ? [entry] : []
  })
  if (
    streamed.length > 0 &&
    streamed
      .map((entry) => entry.text)
      .join('')
      .trim() === text.trim()
  ) {
    return {
      kind: 'streamed',
      entries: streamed.map((entry) => ({
        id: entry.id,
        text: entry.text.trim(),
      })),
    }
  }
  const { index } = messageAt(entries, id)
  return {
    kind: 'single',
    startsNew: index >= 0 && index !== entries.length - 1,
  }
}

export type StoppedOutcome =
  /** 开台（第 9e 步）：这一跳交给那个台。 */
  | { kind: 'benchOpen'; open: AssistantOperatorBenchOpen }
  /** 接力：画布同步那一跳，或时间用到头了（`relay` = 这一跳之后接着发）。 */
  | { kind: 'relay'; relay: boolean }
  /** 这一轮停在这里。`status` 为 null = 不动现在的状态。 */
  | {
      kind: 'settle'
      outOfSteps: boolean
      roundSummary: AssistantOperatorRoundSummary | null
      status: Extract<StudioOperatorStatus, 'awaitingConfirm' | 'idle'> | null
    }

/**
 * `stopped` 帧落成什么。
 *
 * ⚠ **`awaitingPlan` 不被这一帧降级**：计划卡那一支自己已经把状态说清楚了，而服务端只会笼统地
 *   说一句 `awaiting_confirm` —— 盖过去的表现是图标轨上「待你定」变成「待确认」。
 * ⚠ 画布 `canvas_sync`：新内核（收到过本轮记录）**落没落都接力**，落地失败的原因作为工具结果
 *   交回模型；旧内核这里直接收尾。
 * ⭐ `time_budget`（服务端在平台 300 秒杀函数之前自己收的尾）：画布与新内核都接力（服务端交了
 *   接力条才接，没交就照常收尾）；别的出「继续 / 先到这里」。
 * ⭐ 停在确认卡 / 问题卡上的那一轮也带结论（2026-09-12 实测第 2 组），缺席是常态，⛔ 不画空块。
 */
export function stoppedOutcome(
  event: StoppedEvent,
  context: {
    onCanvas: boolean
    /** 这一跳在画布上落了改动，或有输入要同步。 */
    canvasChanged: boolean
    /** 收到过本轮记录（新内核）。 */
    hasTranscript: boolean
    status: StudioOperatorStatus
  },
): StoppedOutcome {
  if (event.reason === ASSISTANT_OPERATOR_STOP_REASONS.benchOpen && event.open)
    return { kind: 'benchOpen', open: event.open }
  if (
    context.onCanvas &&
    event.reason === ASSISTANT_OPERATOR_STOP_REASONS.canvasSync
  )
    return {
      kind: 'relay',
      relay: context.canvasChanged || context.hasTranscript,
    }
  const timeUp = event.reason === ASSISTANT_OPERATOR_STOP_REASONS.timeBudget
  if (timeUp && (context.onCanvas || context.hasTranscript))
    return { kind: 'relay', relay: true }
  return {
    kind: 'settle',
    outOfSteps:
      timeUp || event.reason === ASSISTANT_OPERATOR_STOP_REASONS.tokenBudget,
    roundSummary: event.roundSummary ?? null,
    status:
      context.status === 'awaitingPlan'
        ? null
        : event.reason === ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm
          ? 'awaitingConfirm'
          : 'idle',
  }
}
