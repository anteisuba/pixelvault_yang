/**
 * 每轮的过程记录（`AssistantTurnRecord`）落库前的那几步纯函数：摘 data: 地址与帧、挑出回放要用的
 * 请求字段、按 256 KB 的上限一样一样截。写库在 `services/assistant-turn-record.service.ts`。
 *
 * ⚠ 字节按 `JSON.stringify` 的 UTF-8 算（三段 JSON 加起来），与 Postgres jsonb 落盘的字节不是一回事
 *   —— 上限管的是「我们交给库的东西」，⛔ 别拿 `pg_column_size` 来对账。
 */
import {
  ASSISTANT_TURN_RECORD_CUT_IDS,
  ASSISTANT_TURN_RECORD_CUTS,
  ASSISTANT_TURN_RECORD_LIMITS,
} from '@/constants/assistant-turn-record'
import { ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS } from '@/constants/assistant-v3'
import { carriedWebFinds } from '@/lib/assistant-web-finds'
import type {
  AssistantOperatorRequest,
  AssistantOperatorSnapshot,
} from '@/types/assistant-operator'
import type {
  AssistantTurnRecordGap,
  AssistantTurnRecordInput,
} from '@/types/assistant-turn-record'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import type { AssistantWebFind } from '@/types/assistant-web-finds'

const LIMITS = ASSISTANT_TURN_RECORD_LIMITS
const ENTRY = ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS

/** 摘掉的 data: 地址换成这一句：还是合法的 URL（读回来过得了 schema），但一个字节的图都不剩。 */
export const TURN_RECORD_DATA_URL_PLACEHOLDER = 'data:,omitted'

const ENCODER = new TextEncoder()

/** 一段 JSON 交给库时的 UTF-8 字节。 */
export function turnRecordJsonBytes(value: unknown): number {
  return ENCODER.encode(JSON.stringify(value) ?? '').length
}

/** 深拷贝一份，途中把 data: 地址（剪贴板图、帧）换成占位。 */
export function stripTurnRecordDataUrls<T>(value: T): T {
  if (typeof value === 'string')
    return (
      /^data:/i.test(value) ? TURN_RECORD_DATA_URL_PLACEHOLDER : value
    ) as T
  if (Array.isArray(value))
    return value.map((item: unknown) => stripTurnRecordDataUrls(item)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value))
      if (item !== undefined) out[key] = stripTurnRecordDataUrls(item)
    return out as T
  }
  return value
}

/** 开轮时的快照，摘掉 data: 地址。 */
export function turnRecordSnapshot(
  snapshot: AssistantOperatorSnapshot,
): AssistantOperatorSnapshot {
  return stripTurnRecordDataUrls(snapshot)
}

/**
 * 开轮那一跳冻进板子的上一轮找到的东西（`#n`）：就是开轮请求的 `priorFinds` 过了 `priorFindsOf`
 * 的那一份（模型读到的也是它），再过一遍同一刀（按号去重、最多 `maxCarried` 条）。
 * ⚠ 从本轮记录的板子取、⛔ 不读请求：接力那几跳的请求不带它，后几跳一更新 `input` 就冲掉了。
 */
function openingFinds(transcript: AssistantV3Transcript): AssistantWebFind[] {
  const opening = transcript[0]
  return opening?.type === ENTRY.board
    ? carriedWebFinds(opening.finds ?? [])
    : []
}

/**
 * 请求里回放要用的那几样。对话只留到创作者最后那一句（v3 发给模型的也只到那一句），
 * 片子只记地址与帧数，上一轮找到的东西取开轮板子上那一份，data: 地址一律摘掉。
 */
export function turnRecordInput(
  request: AssistantOperatorRequest,
  transcript: AssistantV3Transcript,
): AssistantTurnRecordInput {
  const lastUser = request.messages.findLastIndex(
    (message) => message.role === 'user',
  )
  const messages = request.messages
    .slice(0, lastUser >= 0 ? lastUser + 1 : request.messages.length)
    .slice(-LIMITS.maxMessages)
  const priorFinds = openingFinds(transcript)
  const input: AssistantTurnRecordInput = {
    messages,
    ...(request.responseLanguage
      ? { responseLanguage: request.responseLanguage }
      : {}),
    ...(request.mentions?.length ? { mentions: request.mentions } : {}),
    ...(request.mentionedAssets?.length
      ? { mentionedAssets: request.mentionedAssets }
      : {}),
    ...(request.mediaAttachments?.length
      ? { mediaAttachments: request.mediaAttachments }
      : {}),
    ...(request.priorSteps?.length ? { priorSteps: request.priorSteps } : {}),
    ...(request.confirmations?.length
      ? { confirmations: request.confirmations }
      : {}),
    ...(request.planAnswers?.length
      ? { planAnswers: request.planAnswers }
      : {}),
    ...(request.planApproved === undefined
      ? {}
      : { planApproved: request.planApproved }),
    ...(request.authoredByAssistant?.length
      ? { authoredByAssistant: request.authoredByAssistant }
      : {}),
    ...(request.autoGenerate ? { autoGenerate: request.autoGenerate } : {}),
    ...(request.autoReview ? { autoReview: request.autoReview } : {}),
    ...(request.searchWithGrok
      ? { searchWithGrok: request.searchWithGrok }
      : {}),
    ...(request.stepBudget === undefined
      ? {}
      : { stepBudget: request.stepBudget }),
    ...(request.videoClips?.length
      ? {
          videoClips: request.videoClips.map(({ frames, ...clip }) => ({
            ...clip,
            frameCount: frames?.length ?? 0,
          })),
        }
      : {}),
    ...(priorFinds.length ? { priorFinds } : {}),
  }
  return stripTurnRecordDataUrls(input)
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

interface TurnRecordParts {
  input: AssistantTurnRecordInput
  transcript: AssistantV3Transcript
}

type Cut = (parts: TurnRecordParts) => TurnRecordParts

/** 截本轮记录 / 对话的那几样，按截的先后。快照那一刀不在这里（它只是「不留」）。 */
const PART_CUTS: Partial<Record<AssistantTurnRecordGap, Cut>> = {
  [ASSISTANT_TURN_RECORD_CUT_IDS.signatures]: (parts) => ({
    ...parts,
    transcript: parts.transcript.map((entry) =>
      entry.type === ENTRY.assistant
        ? {
            ...entry,
            calls: entry.calls.map((call) => ({
              id: call.id,
              tool: call.tool,
              input: call.input,
            })),
          }
        : entry,
    ),
  }),
  [ASSISTANT_TURN_RECORD_CUT_IDS.boardText]: (parts) => ({
    ...parts,
    transcript: parts.transcript.map((entry) =>
      entry.type === ENTRY.board
        ? { ...entry, text: cut(entry.text, LIMITS.cutBoardChars) }
        : entry,
    ),
  }),
  [ASSISTANT_TURN_RECORD_CUT_IDS.resultOutputs]: (parts) => ({
    ...parts,
    transcript: parts.transcript.map((entry) =>
      entry.type === ENTRY.result
        ? { ...entry, output: cut(entry.output, LIMITS.cutResultChars) }
        : entry,
    ),
  }),
  [ASSISTANT_TURN_RECORD_CUT_IDS.history]: ({ input, transcript }) => {
    const rest = { ...input }
    delete rest.priorSteps
    const latest = input.messages.at(-1)
    return {
      transcript,
      input: {
        ...rest,
        messages: latest
          ? [
              {
                ...latest,
                content: cut(latest.content, LIMITS.cutMessageChars),
              },
            ]
          : input.messages,
      },
    }
  },
  [ASSISTANT_TURN_RECORD_CUT_IDS.assistantText]: (parts) => ({
    ...parts,
    transcript: parts.transcript.map((entry) =>
      entry.type === ENTRY.assistant
        ? { ...entry, text: cut(entry.text, LIMITS.cutAssistantChars) }
        : entry,
    ),
  }),
  [ASSISTANT_TURN_RECORD_CUT_IDS.priorFinds]: ({ input, transcript }) => {
    const rest = { ...input }
    delete rest.priorFinds
    return { input: rest, transcript }
  },
  [ASSISTANT_TURN_RECORD_CUT_IDS.transcript]: (parts) => ({
    ...parts,
    transcript: parts.transcript.filter((entry) => entry.type !== ENTRY.result),
  }),
}

export interface FittedTurnRecord {
  readonly input: AssistantTurnRecordInput
  readonly transcript: AssistantV3Transcript
  /** 快照还留不留（`false` = 截到最后连快照也放不下）。 */
  readonly keepSnapshot: boolean
  /** 三段加起来的字节（快照不留时不算它）。 */
  readonly sizeBytes: number
  /** 截了哪几样，按截的先后。 */
  readonly cuts: readonly AssistantTurnRecordGap[]
}

/**
 * 按上限一样一样截（`ASSISTANT_TURN_RECORD_CUTS`）：先截本轮记录与对话、再截上一轮找到的东西，
 * 还放不下才丢快照，再放不下只留板子开头与模型的回复。
 * `snapshotBytes` = 这一行上的快照有多大（第一跳是手上这份，后几跳是库里那份）。
 * 截到最后还放不下（几乎不会：一轮最多 16 跳，每次回复的调用入参都有上限）→ `null`，这一跳不写。
 */
export function fitAssistantTurnRecord(
  parts: TurnRecordParts & { snapshotBytes: number },
  maxBytes: number = LIMITS.maxRowBytes,
): FittedTurnRecord | null {
  let current: TurnRecordParts = {
    input: parts.input,
    transcript: parts.transcript,
  }
  let keepSnapshot = true
  const cuts: AssistantTurnRecordGap[] = []
  const size = () =>
    turnRecordJsonBytes(current.input) +
    turnRecordJsonBytes(current.transcript) +
    (keepSnapshot ? parts.snapshotBytes : 0)

  let bytes = size()
  for (const step of ASSISTANT_TURN_RECORD_CUTS) {
    if (bytes <= maxBytes) break
    if (step === ASSISTANT_TURN_RECORD_CUT_IDS.snapshot) {
      if (parts.snapshotBytes === 0) continue
      keepSnapshot = false
    } else {
      // 这一轮没带上一轮找到的东西：没有可截的，⛔ 不记这一刀（回放那边看到它就会说「截掉了」）。
      const nothingToCut =
        step === ASSISTANT_TURN_RECORD_CUT_IDS.priorFinds &&
        !current.input.priorFinds?.length
      if (nothingToCut) continue
      current = PART_CUTS[step]!(current)
    }
    cuts.push(step)
    bytes = size()
  }
  if (bytes > maxBytes) return null
  return { ...current, keepSnapshot, sizeBytes: bytes, cuts }
}
