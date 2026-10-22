import 'server-only'

import { createHash } from 'node:crypto'
import { after } from 'next/server'

import {
  ASSISTANT_TURN_RECORD_CUT_IDS,
  ASSISTANT_TURN_RECORD_LIMITS,
} from '@/constants/assistant-turn-record'
import { ASSISTANT_V3_PROMPT_VERSION } from '@/constants/assistant-v3'
import {
  fitAssistantTurnRecord,
  turnRecordInput,
  turnRecordJsonBytes,
  turnRecordSnapshot,
} from '@/lib/assistant-turn-record'
import { assistantWorkspaceFromKey } from '@/lib/assistant-workspace'
import { db, isUniqueConstraintError } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type {
  AssistantTurnRecordGap,
  AssistantTurnRecordOutcome,
} from '@/types/assistant-turn-record'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

/**
 * 每轮的过程记录（`AssistantTurnRecord`，owner 2026-10-15「建表」）的写与删。
 *
 * ⭐ **一跳写一次，一轮一行**：`runAssistantV3` 每一跳收尾时交一份草稿过来。第一跳建行（连同开轮
 *   时的快照）；画布接力的后几跳按 `(userId, turnId)` 找到同一行，只更新本轮记录、跳数与收尾方式
 *   —— 后几跳手上的快照已经落了改动，⛔ 不拿它覆盖开轮那份。
 * ⛔ **不等、不抛**：写不进去只记一行警告，这一轮照常收尾（`recordAssistantTurn`）。
 * ⛔ 只存 key 的 id；快照与请求里的 data: 地址、视频帧一律摘掉（`lib/assistant-turn-record.ts`）。
 * ⛔ 不进会话分享、不进任何导出：读这张表的只有回放（手动导出一行喂给
 *   `src/test/assistant-replay/from-turn-record.ts`），没有一条读路径。
 *
 * 保留（owner：留 30 天或每人最近 200 条）：建行之后顺手删这个人 30 天前的与超出 200 条的；
 * 不再用助手的人由每日 sweep（`/api/internal/execution/sweep`）按 30 天删。
 */

/** 一跳收尾时交过来的那一份。 */
export interface AssistantTurnDraft {
  readonly userId: string
  readonly turnId: string
  /** 这是这一轮的第几跳（从 1 起）。 */
  readonly hop: number
  readonly outcome: AssistantTurnRecordOutcome
  readonly errorCode?: string
  readonly request: AssistantOperatorRequest
  readonly transcript: AssistantV3Transcript
  readonly adapterType: string
  readonly modelId: string
  /** persona 里选的那一档（`auto` = 自动，与回放题的 `routeModel` 同一个写法）。 */
  readonly routeModel: string
  readonly apiKeyId: string | null
  /** 只取 sha256，⛔ 正文不落库。 */
  readonly systemPrompt: string
  /** 哪一版提示跑的；缺席 = v3 现行那一版。新内核填自己的（`ASSISTANT_NEXT_PROMPT_VERSION`）。 */
  readonly promptVersion?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 快照那两种缺口跟着行走：后几跳重截本轮记录时不能把它们丢了。 */
const SNAPSHOT_GAPS: ReadonlySet<AssistantTurnRecordGap> = new Set([
  ASSISTANT_TURN_RECORD_CUT_IDS.snapshot,
  ASSISTANT_TURN_RECORD_CUT_IDS.noOpeningSnapshot,
])

function retentionCutoff(now: Date): Date {
  return new Date(
    now.getTime() - ASSISTANT_TURN_RECORD_LIMITS.retentionDays * DAY_MS,
  )
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * 记下这一跳 —— ⛔ 不等、不抛。写不进去只记一行警告，这一轮照常收尾。
 * `after` 让函数等它写完再退（不在请求作用域里时 —— 脚本 / 测试 —— 它已经在跑了）。
 */
export function recordAssistantTurn(draft: AssistantTurnDraft): void {
  const pending = writeAssistantTurnRecord(draft).catch((error: unknown) => {
    logger.warn('assistant turn record not written', {
      userId: draft.userId,
      turnId: draft.turnId,
      hop: draft.hop,
      error: error instanceof Error ? error.message : String(error),
    })
  })
  try {
    after(() => pending)
  } catch {
    // 不在请求作用域里：已经在跑了，不必再等。
  }
}

export async function writeAssistantTurnRecord(
  draft: AssistantTurnDraft,
): Promise<void> {
  const { userId, turnId, hop } = draft
  const input = turnRecordInput(draft.request, draft.transcript)
  const ending = {
    hops: hop,
    outcome: draft.outcome,
    errorCode: draft.errorCode ?? null,
  }

  if (hop > 1) {
    const existing = await db.assistantTurnRecord.findUnique({
      where: { userId_turnId: { userId, turnId } },
      select: { id: true, hops: true, snapshotBytes: true, truncated: true },
    })
    if (existing) {
      // 更晚的一跳已经写过（接力比上一跳的写库还快）：⛔ 拿旧的盖新的。
      // ⚠ 同一跳再来一次照写（后到的盖先到的）：时间预算硬停在交本轮记录之前时，前端拿着上一跳
      //   的号再接力，这一跳的号就与被掐的那一跳一样 —— 拦掉它，这一轮的收尾就丢了。
      if (existing.hops > hop) return
      const fitted = fitAssistantTurnRecord({
        input,
        transcript: draft.transcript,
        snapshotBytes: existing.snapshotBytes,
      })
      if (!fitted) {
        logger.warn('assistant turn record over the size cap, hop skipped', {
          userId,
          turnId,
          hop,
        })
        return
      }
      const kept = existing.truncated.filter((gap) =>
        SNAPSHOT_GAPS.has(gap as AssistantTurnRecordGap),
      )
      await db.assistantTurnRecord.updateMany({
        where: { id: existing.id, userId, hops: { lte: hop } },
        data: {
          ...ending,
          input: toJson(fitted.input),
          transcript: toJson(fitted.transcript),
          sizeBytes: fitted.sizeBytes,
          truncated: [...new Set([...kept, ...fitted.cuts])],
          ...(fitted.keepSnapshot
            ? {}
            : { snapshot: Prisma.DbNull, snapshotBytes: 0 }),
        },
      })
      return
    }
  }

  // 第一跳；或第一跳没写成、这一行由后面某一跳来建（那时手上的快照已经落了改动，⛔ 不存）。
  const snapshot = hop === 1 ? turnRecordSnapshot(draft.request.snapshot) : null
  const snapshotBytes = snapshot ? turnRecordJsonBytes(snapshot) : 0
  const fitted = fitAssistantTurnRecord({
    input,
    transcript: draft.transcript,
    snapshotBytes,
  })
  if (!fitted) {
    logger.warn('assistant turn record over the size cap, hop skipped', {
      userId,
      turnId,
      hop,
    })
    return
  }
  const keptSnapshot = snapshot && fitted.keepSnapshot ? snapshot : null
  const gaps: AssistantTurnRecordGap[] = [
    ...(hop > 1 ? [ASSISTANT_TURN_RECORD_CUT_IDS.noOpeningSnapshot] : []),
    ...fitted.cuts,
  ]
  try {
    await db.assistantTurnRecord.create({
      data: {
        userId,
        turnId,
        ...ending,
        workspaceKey: draft.request.workspaceKey,
        domain: draft.request.domain,
        projectId:
          assistantWorkspaceFromKey(draft.request.workspaceKey)?.projectId ??
          null,
        conversationId: draft.request.conversationId ?? null,
        adapterType: draft.adapterType,
        modelId: draft.modelId,
        routeModel: draft.routeModel,
        apiKeyId: draft.apiKeyId,
        systemPromptHash: sha256(draft.systemPrompt),
        promptVersion: draft.promptVersion ?? ASSISTANT_V3_PROMPT_VERSION,
        input: toJson(fitted.input),
        snapshot: keptSnapshot ? toJson(keptSnapshot) : Prisma.DbNull,
        transcript: toJson(fitted.transcript),
        snapshotBytes: keptSnapshot ? snapshotBytes : 0,
        sizeBytes: fitted.sizeBytes,
        truncated: gaps,
      },
    })
  } catch (error) {
    // 同一轮的另一跳先建了这一行：它更新，这里不重复建。
    if (isUniqueConstraintError(error)) return
    throw error
  }
  await pruneAssistantTurnRecordsOfUser(userId)
}

/**
 * 建行之后顺手删这个人的：30 天前的、超出最近 200 条的。两步都走 `(userId, createdAt DESC)`。
 */
export async function pruneAssistantTurnRecordsOfUser(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.assistantTurnRecord.deleteMany({
    where: { userId, createdAt: { lt: retentionCutoff(now) } },
  })
  const overflow = await db.assistantTurnRecord.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: ASSISTANT_TURN_RECORD_LIMITS.maxRowsPerUser,
    select: { id: true },
  })
  if (overflow.length === 0) return
  await db.assistantTurnRecord.deleteMany({
    where: { userId, id: { in: overflow.map((row) => row.id) } },
  })
}

/**
 * 每日 sweep：删全表 30 天前的（不再用助手的人，写时那一刀碰不到他们）。回删了几行。
 */
export async function pruneExpiredAssistantTurnRecords(
  now: Date = new Date(),
): Promise<number> {
  const { count } = await db.assistantTurnRecord.deleteMany({
    where: { createdAt: { lt: retentionCutoff(now) } },
  })
  return count
}
