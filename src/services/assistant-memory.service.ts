import 'server-only'

import {
  ASSISTANT_MEMORY_KIND_IDS,
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
  ASSISTANT_MEMORY_SENSITIVE_PATTERNS,
  normalizeAssistantMemoryText,
  type AssistantMemoryKindId,
  type AssistantMemoryScopeId,
} from '@/constants/assistant-memory'
import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import type {
  AssistantMemoryKind,
  AssistantMemoryScope,
} from '@/lib/generated/prisma/client'
import {
  AssistantMemorySchema,
  type AssistantMemory,
  type AssistantMemoryCandidate,
} from '@/types/assistant-memory'

/**
 * **助手记忆**的全部读写（进度表 56a · 最简版）。
 *
 * 一条 = 一行字。写入只发生在**每轮结账**那一刻（`assistant-operator.service`
 * 的 `closeRound`），读出发生在两处：下一轮的系统提示注入、`/settings/assistant`
 * 的总览列表。
 *
 * ⚠ **每一条查询都按 `userId` 收敛**，没有例外 —— 与 `context-cards.service.ts`
 * 逐字同一条判据。
 *
 * ── 它在工具环的 import 白名单里 ────────────────────────────────
 * 判据逐条对着 `assistant-operator.money-gate.test.ts` 那份名单的问题：它不创建
 * generation、不扣 credit、不调任何 provider、**不碰 R2**。它读写的是一张只有
 * 文本列的表，而写进去的是助手对用户说过的话的归纳。
 */

/** 协议侧的小写 id ↔ 库里的 SCREAMING_SNAKE 枚举。⛔ 两处都不许写字面量。 */
const DB_SCOPE_BY_ID: Record<AssistantMemoryScopeId, AssistantMemoryScope> = {
  [ASSISTANT_MEMORY_SCOPE_IDS.image]: 'IMAGE',
  [ASSISTANT_MEMORY_SCOPE_IDS.video]: 'VIDEO',
  [ASSISTANT_MEMORY_SCOPE_IDS.canvas]: 'CANVAS',
  [ASSISTANT_MEMORY_SCOPE_IDS.lora]: 'LORA',
  [ASSISTANT_MEMORY_SCOPE_IDS.global]: 'GLOBAL',
}

const ID_BY_DB_SCOPE: Record<AssistantMemoryScope, AssistantMemoryScopeId> = {
  IMAGE: ASSISTANT_MEMORY_SCOPE_IDS.image,
  VIDEO: ASSISTANT_MEMORY_SCOPE_IDS.video,
  CANVAS: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
  LORA: ASSISTANT_MEMORY_SCOPE_IDS.lora,
  GLOBAL: ASSISTANT_MEMORY_SCOPE_IDS.global,
}

const DB_KIND_BY_ID: Record<AssistantMemoryKindId, AssistantMemoryKind> = {
  [ASSISTANT_MEMORY_KIND_IDS.preference]: 'PREFERENCE',
  [ASSISTANT_MEMORY_KIND_IDS.fact]: 'FACT',
  [ASSISTANT_MEMORY_KIND_IDS.rule]: 'RULE',
}

const ID_BY_DB_KIND: Record<AssistantMemoryKind, AssistantMemoryKindId> = {
  PREFERENCE: ASSISTANT_MEMORY_KIND_IDS.preference,
  FACT: ASSISTANT_MEMORY_KIND_IDS.fact,
  RULE: ASSISTANT_MEMORY_KIND_IDS.rule,
}

const MEMORY_SELECT = {
  id: true,
  scope: true,
  kind: true,
  text: true,
  createdAt: true,
  updatedAt: true,
} as const

interface MemoryRow {
  id: string
  scope: AssistantMemoryScope
  kind: AssistantMemoryKind
  text: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 一行 → 一条记忆。
 *
 * ⚠ 读不出来的那一条回 `null`、由调用方丢掉，⛔ 不抛：词表改过而存量没跟上时，
 * 用户该看到另外那 37 条，而不是「记忆打不开」（判据与上下文卡那条同源）。
 */
function toMemory(row: MemoryRow): AssistantMemory | null {
  const parsed = AssistantMemorySchema.safeParse({
    id: row.id,
    scope: ID_BY_DB_SCOPE[row.scope],
    kind: ID_BY_DB_KIND[row.kind],
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
  return parsed.success ? parsed.data : null
}

export interface ListAssistantMemoriesOptions {
  /** 给了就只要这个域的。缺席 = 全部（总览列表默认那一档）。 */
  scope?: AssistantMemoryScopeId | null
  limit?: number
}

/**
 * 总览列表那一次查询 —— **按 `updatedAt` 倒序**（画板：最近改过的排最前）。
 *
 * ⚠ 与注入那一条的排序**有意不同**：这里按「最近改过」，注入按「最近被用过」
 * （`lastUsedAt`）。两者混用的表现是用户刚在设置里改过一条，它却排在注入队尾。
 */
export async function listAssistantMemories(
  userId: string,
  options: ListAssistantMemoriesOptions = {},
): Promise<AssistantMemory[]> {
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      ...(options.scope ? { scope: DB_SCOPE_BY_ID[options.scope] } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(
      options.limit ?? ASSISTANT_MEMORY_LIMITS.maxPerScope,
      ASSISTANT_MEMORY_LIMITS.maxPerScope,
    ),
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

export async function listAssistantMemoriesForClerkId(
  clerkId: string,
  options: ListAssistantMemoriesOptions = {},
): Promise<AssistantMemory[]> {
  const user = await ensureUser(clerkId)
  return listAssistantMemories(user.id, options)
}

/**
 * **注入那一跳要的那几条**（切片 2）：当前域 + `global`，按 `lastUsedAt` 倒序。
 *
 * ⚠ 预算由调用方给（卡优先，见 `ASSISTANT_CONTEXT_BUDGET`）—— ⛔ 这里不自己
 * 读卡表：一个函数同时决定两种东西各占多少，是把预算判据藏进了服务层。
 * ⚠ `limit <= 0` 时**一条都不查**：预算被卡吃光了，⛔ 别照样打一次库。
 */
export async function listAssistantMemoriesForPrompt(
  userId: string,
  scope: AssistantMemoryScopeId,
  limit: number,
): Promise<AssistantMemory[]> {
  if (limit <= 0) return []
  const scopes =
    scope === ASSISTANT_MEMORY_SCOPE_IDS.global
      ? [DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global]]
      : [
          DB_SCOPE_BY_ID[scope],
          DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global],
        ]
  const rows = await db.assistantMemory.findMany({
    where: { userId, scope: { in: scopes } },
    orderBy: { lastUsedAt: 'desc' },
    take: Math.min(limit, ASSISTANT_MEMORY_LIMITS.maxInPrompt),
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

/**
 * **被注入过就更新 `lastUsedAt`** —— 注入优先级与淘汰顺序都读它。
 *
 * ⚠ 一次 `updateMany`，⛔ 不逐条 update：一轮最多 8 条，逐条等于 8 次往返。
 * ⚠ 仍然带 `userId`：id 是从这个用户自己的查询里来的，但 ownership 校验不靠
 *   「上一跳应该没错」。
 */
export async function touchAssistantMemories(
  userId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return
  await db.assistantMemory.updateMany({
    where: { userId, id: { in: [...ids] } },
    data: { lastUsedAt: new Date() },
  })
}

/**
 * 就地改一条。返回 `null` = 不属于这个用户（或已经没了）—— 路由据此 404。
 *
 * ⚠ 改完 `updatedAt` 自动前移（`@updatedAt`），于是它跳到列表最前 —— 这是
 * 有意的：用户刚动过的那条该在眼前。
 */
export async function updateAssistantMemory(
  userId: string,
  memoryId: string,
  text: string,
): Promise<AssistantMemory | null> {
  const existing = await db.assistantMemory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true },
  })
  if (!existing) return null

  const row = await db.assistantMemory.update({
    where: { id: existing.id },
    data: { text },
    select: MEMORY_SELECT,
  })
  return toMemory(row)
}

export async function updateAssistantMemoryForClerkId(
  clerkId: string,
  memoryId: string,
  text: string,
): Promise<AssistantMemory | null> {
  const user = await ensureUser(clerkId)
  return updateAssistantMemory(user.id, memoryId, text)
}

/**
 * 删一条 —— **真删**，⛔ 不做软删、⛔ 不进回收站（画板：「hover 行尾唯一动作
 * 『删』，真删」）。返回 false = 不属于这个用户（或已经没了）。
 */
export async function deleteAssistantMemory(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const { count } = await db.assistantMemory.deleteMany({
    where: { id: memoryId, userId },
  })
  return count > 0
}

export async function deleteAssistantMemoryForClerkId(
  clerkId: string,
  memoryId: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  return deleteAssistantMemory(user.id, memoryId)
}

/** 「全部清空」。返回删掉了几条 —— 二次确认在客户端，这一跳不再问一遍。 */
export async function clearAssistantMemories(userId: string): Promise<number> {
  const { count } = await db.assistantMemory.deleteMany({ where: { userId } })
  return count
}

export async function clearAssistantMemoriesForClerkId(
  clerkId: string,
): Promise<number> {
  const user = await ensureUser(clerkId)
  return clearAssistantMemories(user.id)
}

/**
 * **敏感类目命中**（owner 2026-09-20）—— 命中的候选不写、不计数、不记明文。
 *
 * ⚠ 导出它只为可测：用例要能逐条问「这一句会不会被写进去」。⛔ 别在别处拿它
 * 去做「提示用户」之类的事 —— 那一句本身就在说「我读到了那个东西」。
 */
export function isSensitiveMemoryText(text: string): boolean {
  return Object.values(ASSISTANT_MEMORY_SENSITIVE_PATTERNS).some((patterns) =>
    patterns.some((pattern) => pattern.test(text)),
  )
}

export interface RecordAssistantMemoriesArgs {
  userId: string
  /** 缺席的候选挂这个域（当前工作台）。 */
  scope: AssistantMemoryScopeId
  candidates: readonly AssistantMemoryCandidate[]
  conversationId?: string | undefined
  messageId?: string | undefined
}

/**
 * **每轮结账时一次性写**（切片 1）—— 这条路是记忆唯一的写入口。
 *
 * 顺序，逐条有理由：
 *  ① **敏感闸先过** —— 它一票否决，排在去重前面才不会让一条敏感文本先去库里
 *     比对一次（比对本身不落库，但它会把那句话写进查询日志）。
 *  ② **本轮内部先去重** —— 同一轮里模型把同一件事说两遍是常事。
 *  ③ **与库里字面去重**（同 userId + scope + kind，归一化后相等）——
 *     命中就**只更新 `updatedAt` / `lastUsedAt`**，⛔ 不新增一行、⛔ 不改原文：
 *     用户可能已经在设置里把那行字改顺眼了，用模型这一轮的措辞盖掉是在跟他抢。
 *  ④ **每域上限 200** —— 超了按 `lastUsedAt` 最旧的静默删。
 *
 * 返回**真正记下的条数**（新增 + 命中更新），它就是回执上那个 N。
 * ⚠ 敏感命中与本轮重复都不进这个数 —— 回执里不许出现「有 N 条被跳过」。
 */
export async function recordAssistantMemories(
  args: RecordAssistantMemoriesArgs,
): Promise<number> {
  const seen = new Set<string>()
  const accepted: {
    scope: AssistantMemoryScopeId
    kind: AssistantMemoryKindId
    text: string
    normalized: string
  }[] = []

  for (const candidate of args.candidates) {
    if (accepted.length >= ASSISTANT_MEMORY_LIMITS.maxPerRound) break
    const text = candidate.text.trim()
    if (text.length === 0) continue
    // ① 敏感类目：不写、不计数、⛔ 不记任何日志明文。
    if (isSensitiveMemoryText(text)) continue
    const scope = candidate.scope ?? args.scope
    const normalized = normalizeAssistantMemoryText(text)
    if (normalized.length === 0) continue
    // ② 本轮内部去重（同域同类同字面）。
    const key = `${scope} ${candidate.kind} ${normalized}`
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push({ scope, kind: candidate.kind, text, normalized })
  }

  if (accepted.length === 0) return 0

  let written = 0
  const touchedScopes = new Set<AssistantMemoryScopeId>()

  for (const entry of accepted) {
    /**
     * ③ 与库里字面去重。⚠ 归一化**在内存里比**而不是写成一列：加一列
     * `normalizedText` 就要为存量行回填，而回填一张可能有几万行的表换来的只是
     * 每轮省一次最多 200 行的扫描。
     */
    const siblings = await db.assistantMemory.findMany({
      where: {
        userId: args.userId,
        scope: DB_SCOPE_BY_ID[entry.scope],
        kind: DB_KIND_BY_ID[entry.kind],
      },
      select: { id: true, text: true },
      take: ASSISTANT_MEMORY_LIMITS.maxPerScope,
    })
    const hit = siblings.find(
      (row) => normalizeAssistantMemoryText(row.text) === entry.normalized,
    )
    if (hit) {
      await db.assistantMemory.update({
        where: { id: hit.id },
        data: { lastUsedAt: new Date() },
      })
      written += 1
      continue
    }

    await db.assistantMemory.create({
      data: {
        userId: args.userId,
        scope: DB_SCOPE_BY_ID[entry.scope],
        kind: DB_KIND_BY_ID[entry.kind],
        text: entry.text,
        conversationId: args.conversationId ?? null,
        messageId: args.messageId ?? null,
      },
      select: { id: true },
    })
    written += 1
    touchedScopes.add(entry.scope)
  }

  // ④ 只对**这一轮新增过**的域收一次上限：没新增的域条数没变。
  for (const scope of touchedScopes) {
    await evictOldestAssistantMemories(args.userId, scope)
  }

  return written
}

/**
 * 每域上限 200 —— 超了按 `lastUsedAt` 最旧的**静默**删。
 *
 * ⛔ 不通知、不画容量表、不变灰（owner 2026-09-20 撤）。
 * ⚠ 按 `lastUsedAt` 而不是 `createdAt`：一条两年前记下、每一轮都在用的偏好，
 * 比昨天记下、再没被注入过的那条值钱。
 */
async function evictOldestAssistantMemories(
  userId: string,
  scope: AssistantMemoryScopeId,
): Promise<void> {
  const dbScope = DB_SCOPE_BY_ID[scope]
  const count = await db.assistantMemory.count({
    where: { userId, scope: dbScope },
  })
  const excess = count - ASSISTANT_MEMORY_LIMITS.maxPerScope
  if (excess <= 0) return

  const doomed = await db.assistantMemory.findMany({
    where: { userId, scope: dbScope },
    orderBy: { lastUsedAt: 'asc' },
    take: excess,
    select: { id: true },
  })
  if (doomed.length === 0) return
  await db.assistantMemory.deleteMany({
    where: { userId, id: { in: doomed.map((row) => row.id) } },
  })
}
