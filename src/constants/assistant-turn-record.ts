/**
 * 助手每一轮的过程记录（`AssistantTurnRecord`，owner 2026-10-15「建表」）：上限、保留与词表。
 *
 * owner 的原话就是这张表的规格：「每轮存画布、过程和模型，每行不超过 256KB，留 30 天或每人
 * 最近 200 条，不进分享和导出」。这里的数一个都不是调出来的，改之前先问 owner。
 *
 * ── 一行装什么 ───────────────────────────────────────────────
 * 开轮时的快照（画布 / 工作台）、v3 本轮记录（transcript）、请求里回放要用的那几样（对话、`@`、
 * 片子的地址与帧数、上一轮找到的东西 `#n`），以及那一轮的厂商 / 型号 / key 的 id / 系统提示的
 * sha256。写在服务端每一跳的末尾（`services/assistant-turn-record.service.ts`），失败只记一行警告。
 *
 * ── 超限怎么截 ───────────────────────────────────────────────
 * 按 `ASSISTANT_TURN_RECORD_CUTS` 的顺序一样一样截，截到放得下为止：先截本轮记录（回放用不上的
 * 签名 → 回放会重画的板子正文 → 回放会现跑的工具结果 → 对话历史 → 模型正文），再截请求里上一轮
 * 找到的东西，还放不下才丢快照，再放不下只留板子开头与模型的那几次回复。截了哪几样记在行上，
 * ⛔ 不悄悄截。
 */

import { ASSISTANT_V3_HISTORY } from '@/constants/assistant-v3'

export const ASSISTANT_TURN_RECORD_LIMITS = {
  /** 每行上限：`input` + `snapshot` + `transcript` 三段 JSON 的 UTF-8 字节（owner：每行不超过 256KB）。 */
  maxRowBytes: 256 * 1024,
  /** 留多久（owner：留 30 天）。写时顺手删这个人的，每日 sweep 删全表的。 */
  retentionDays: 30,
  /** 每人最多留几轮（owner：每人最近 200 条）。写时顺手删这个人超出的。 */
  maxRowsPerUser: 200,
  /**
   * 存几条对话：只存模型这一轮看见的那几条（开轮板子上的 `history.turns`）再加这一句；v3 发给模型的
   * 对白最多 `ASSISTANT_V3_HISTORY.maxMessages` 条，这里跟着那边走（⛔ 不是 owner 定的数）。
   */
  maxMessages: ASSISTANT_V3_HISTORY.maxMessages + 1,
  /** 一轮最多几跳（画布接力 + 时间预算接力）。前端的步数上限是 16，这里只防伪造的号。 */
  maxHops: 64,
  /** 截的时候留多少字：板子正文、工具结果、对话里的一句、模型正文。 */
  cutBoardChars: 4_000,
  cutResultChars: 2_000,
  cutMessageChars: 4_000,
  cutAssistantChars: 4_000,
} as const

/** 这一轮怎么收的。 */
export const ASSISTANT_TURN_RECORD_OUTCOME_IDS = {
  /** 模型回了一段话，没再调工具。 */
  done: 'done',
  /** 已经有改动落下、模型收尾一个字没说：服务端补了那句固定的话。回放要在末尾补一次空回复。 */
  quiet: 'quiet',
  /** 模型连着两次一个字都没回。回放要在末尾补两次空回复。 */
  empty: 'empty',
  /** 厂商的内容审核拦下（空回复 + content-filter）。 */
  contentFilter: 'content_filter',
  /** 同一件事因同一个原因连着失败，停下来说清楚。 */
  sameFailure: 'same_failure',
  /** 停在卡上等创作者（问题卡 / 确认卡）。 */
  awaitingConfirm: 'awaiting_confirm',
  /** 步数用完。 */
  maxSteps: 'max_steps',
  /** 创作者按了停 / 连接断了。 */
  aborted: 'aborted',
  /** 抛错收场（`errorCode`）。 */
  error: 'error',
  /** 这一跳停在接力上（画布落改动 / 时间预算），还没收尾：没等到下一跳就断了的停在这。 */
  relay: 'relay',
} as const

export const ASSISTANT_TURN_RECORD_OUTCOMES = [
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.done,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.quiet,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.empty,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.contentFilter,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.sameFailure,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.awaitingConfirm,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.maxSteps,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.aborted,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.error,
  ASSISTANT_TURN_RECORD_OUTCOME_IDS.relay,
] as const

/** 一行上少了什么（`AssistantTurnRecord.truncated`）。 */
export const ASSISTANT_TURN_RECORD_CUT_IDS = {
  /** Gemini 的思考签名、建卡时记的已有卡 id：只有接力用得上，回放用不上。 */
  signatures: 'signatures',
  /** 板子正文截到开头（回放从快照重画板子）。 */
  boardText: 'board_text',
  /** 工具结果截到开头（回放时工具现跑）。 */
  resultOutputs: 'result_outputs',
  /** 对话只留这一轮这一句（截到开头），本轮的步不存。 */
  history: 'history',
  /** 模型正文截到开头。 */
  assistantText: 'assistant_text',
  /**
   * 请求里上一轮找到的东西（`input.priorFinds`）不存（开轮的板子上冻着的那一份照留）。
   * ⚠ 回放题因此带不进它们：模型眼前少了那几行，`#2` 认不出是哪一张。这一轮没带就不记这一刀。
   */
  priorFinds: 'prior_finds',
  /** 快照丢掉。 */
  snapshot: 'snapshot',
  /** 本轮记录只留板子开头与模型的回复（工具结果全丢）。 */
  transcript: 'transcript',
  /** 第一跳没写成、这一行是后面某一跳建的：手上的快照已经落了改动，⛔ 不当开轮的存。 */
  noOpeningSnapshot: 'no_opening_snapshot',
} as const

/** 截的先后（超限时按这个顺序一样一样截）。`noOpeningSnapshot` 不是截出来的，不在这里。 */
export const ASSISTANT_TURN_RECORD_CUTS = [
  ASSISTANT_TURN_RECORD_CUT_IDS.signatures,
  ASSISTANT_TURN_RECORD_CUT_IDS.boardText,
  ASSISTANT_TURN_RECORD_CUT_IDS.resultOutputs,
  ASSISTANT_TURN_RECORD_CUT_IDS.history,
  ASSISTANT_TURN_RECORD_CUT_IDS.assistantText,
  ASSISTANT_TURN_RECORD_CUT_IDS.priorFinds,
  ASSISTANT_TURN_RECORD_CUT_IDS.snapshot,
  ASSISTANT_TURN_RECORD_CUT_IDS.transcript,
] as const

export const ASSISTANT_TURN_RECORD_GAPS = [
  ...ASSISTANT_TURN_RECORD_CUTS,
  ASSISTANT_TURN_RECORD_CUT_IDS.noOpeningSnapshot,
] as const
