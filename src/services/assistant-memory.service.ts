import 'server-only'

import {
  ASSISTANT_MEMORY_KIND_IDS,
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
  ASSISTANT_MEMORY_SENSITIVE_PATTERNS,
  ASSISTANT_MEMORY_SOURCE_IDS,
  normalizeAssistantMemoryText,
  type AssistantMemoryKindId,
  type AssistantMemoryScopeId,
  type AssistantMemorySourceId,
} from '@/constants/assistant-memory'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { assistantWorkspaceFromKey } from '@/lib/assistant-workspace'
import { assertAssistantWorkspaceAccess } from '@/services/assistant-conversation.service'
import { ensureUser } from '@/services/user.service'
import type {
  AssistantMemoryKind,
  AssistantMemoryScope,
  AssistantMemorySource,
} from '@/lib/generated/prisma/client'
import {
  AssistantMemorySchema,
  type AssistantMemory,
  type AssistantMemoryCandidate,
  type CreateAssistantMemoryRequest,
  type UpdateAssistantMemoryRequest,
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
  [ASSISTANT_MEMORY_SCOPE_IDS.tags]: 'TAGS',
  [ASSISTANT_MEMORY_SCOPE_IDS.cards]: 'CARDS',
  [ASSISTANT_MEMORY_SCOPE_IDS.video]: 'VIDEO',
  [ASSISTANT_MEMORY_SCOPE_IDS.canvas]: 'CANVAS',
  [ASSISTANT_MEMORY_SCOPE_IDS.lora]: 'LORA',
  [ASSISTANT_MEMORY_SCOPE_IDS.global]: 'GLOBAL',
}

const ID_BY_DB_SCOPE: Record<AssistantMemoryScope, AssistantMemoryScopeId> = {
  IMAGE: ASSISTANT_MEMORY_SCOPE_IDS.image,
  TAGS: ASSISTANT_MEMORY_SCOPE_IDS.tags,
  CARDS: ASSISTANT_MEMORY_SCOPE_IDS.cards,
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

const DB_SOURCE_BY_ID: Record<AssistantMemorySourceId, AssistantMemorySource> =
  {
    [ASSISTANT_MEMORY_SOURCE_IDS.assistant]: 'ASSISTANT',
    [ASSISTANT_MEMORY_SOURCE_IDS.creator]: 'CREATOR',
  }

const ID_BY_DB_SOURCE: Record<AssistantMemorySource, AssistantMemorySourceId> =
  {
    ASSISTANT: ASSISTANT_MEMORY_SOURCE_IDS.assistant,
    CREATOR: ASSISTANT_MEMORY_SOURCE_IDS.creator,
  }

const MEMORY_SELECT = {
  id: true,
  scope: true,
  workspaceKey: true,
  kind: true,
  source: true,
  text: true,
  createdAt: true,
  updatedAt: true,
} as const

interface MemoryRow {
  id: string
  scope: AssistantMemoryScope
  workspaceKey: string | null
  kind: AssistantMemoryKind
  source: AssistantMemorySource
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
    workspaceKey: row.workspaceKey,
    kind: ID_BY_DB_KIND[row.kind],
    source: ID_BY_DB_SOURCE[row.source],
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
  return parsed.success ? parsed.data : null
}

export interface ListAssistantMemoriesOptions {
  /** 给了就只要这个域的。缺席 = 全部（总览列表默认那一档）。 */
  scope?: AssistantMemoryScopeId | null
  workspaceKey?: string
  limit?: number
}

/**
 * 总览列表那一次查询 —— **按 `updatedAt` 倒序**（画板：最近改过的排最前）。
 *
 * ⚠ 与注入那一条的排序**有意不同**：这里按「最近改过」，注入按「最近被用过」
 * （`lastUsedAt`）。两者混用的表现是用户刚在设置里改过一条，它却排在注入队尾。
 * ⚠ **你写的单独取满**（≤ `maxCreatorEntries`）再与助手记的合并：只取一份
 * 「最近 200 条」时，一个话多的月份就能把你三个月前写的规矩挤出列表 ——
 * 「你写的」那一档筛出来就不是全部了。
 */
export async function listAssistantMemories(
  userId: string,
  options: ListAssistantMemoriesOptions = {},
): Promise<AssistantMemory[]> {
  const where = {
    userId,
    ...(options.scope ? { scope: DB_SCOPE_BY_ID[options.scope] } : {}),
    ...(options.workspaceKey ? { workspaceKey: options.workspaceKey } : {}),
  }
  const [creatorRows, assistantRows] = await Promise.all([
    db.assistantMemory.findMany({
      where: {
        ...where,
        source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator],
      },
      orderBy: { updatedAt: 'desc' },
      take: ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
      select: MEMORY_SELECT,
    }),
    db.assistantMemory.findMany({
      where: {
        ...where,
        source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(
        options.limit ?? ASSISTANT_MEMORY_LIMITS.maxPerScope,
        ASSISTANT_MEMORY_LIMITS.maxPerScope,
      ),
      select: MEMORY_SELECT,
    }),
  ])
  return [...creatorRows, ...assistantRows]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
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

async function resolveMemoryDestination(
  userId: string,
  input: { scope?: AssistantMemoryScopeId; workspaceKey?: string | null },
): Promise<{ scope: AssistantMemoryScope; workspaceKey: string | null }> {
  if (input.workspaceKey) {
    await assertAssistantWorkspaceAccess(userId, input.workspaceKey)
    const workspace = assistantWorkspaceFromKey(input.workspaceKey)!.workspace
    const scopeId =
      workspace === 'image-natural'
        ? ASSISTANT_MEMORY_SCOPE_IDS.image
        : workspace === 'image-tags'
          ? ASSISTANT_MEMORY_SCOPE_IDS.tags
          : workspace
    if (input.scope !== undefined && input.scope !== scopeId) {
      throw new ApiRequestError(
        'ASSISTANT_MEMORY_WORKSPACE_MISMATCH',
        400,
        'errors.assistantConversation.notFound',
        'Memory workspace does not match its scope',
      )
    }
    return { scope: DB_SCOPE_BY_ID[scopeId], workspaceKey: input.workspaceKey }
  }
  if (input.scope === ASSISTANT_MEMORY_SCOPE_IDS.global) {
    return { scope: 'GLOBAL', workspaceKey: null }
  }
  throw new ApiRequestError(
    'ASSISTANT_MEMORY_WORKSPACE_REQUIRED',
    400,
    'errors.assistantConversation.notFound',
    'Memory workspace is required',
  )
}

export async function listAssistantMemoriesForPrompt(
  userId: string,
  workspaceKey: string,
  limit: number,
): Promise<AssistantMemory[]> {
  if (limit <= 0) return []
  const destination = await resolveMemoryDestination(userId, { workspaceKey })
  const rows = await db.assistantMemory.findMany({
    where: { userId, ...destination, source: 'ASSISTANT' },
    orderBy: { lastUsedAt: 'desc' },
    take: Math.min(limit, ASSISTANT_MEMORY_LIMITS.maxInPrompt),
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

export async function listCreatorMemoriesForPrompt(
  userId: string,
  workspaceKey: string,
  limit: number,
): Promise<AssistantMemory[]> {
  if (limit <= 0) return []
  const destination = await resolveMemoryDestination(userId, { workspaceKey })
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      source: 'CREATOR',
      OR: [destination, { scope: 'GLOBAL', workspaceKey: null }],
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(limit, ASSISTANT_MEMORY_LIMITS.maxCreatorEntries),
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

export async function listStandingRuleMemories(
  userId: string,
  options: { workspaceKey: string; limit: number },
): Promise<AssistantMemory[]> {
  const destination = await resolveMemoryDestination(userId, {
    workspaceKey: options.workspaceKey,
  })
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      OR: [
        { ...destination, OR: [{ source: 'CREATOR' }, { kind: 'RULE' }] },
        { scope: 'GLOBAL', workspaceKey: null, source: 'CREATOR' },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: options.limit,
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

/** 你写的满了 —— 调用方据此拒，⛔ 不静默丢弃、也不挤掉最老的一条。 */
export class AssistantMemoryLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Creator memory limit reached (${limit})`)
    this.name = 'AssistantMemoryLimitError'
  }
}

/**
 * 同一句话已经在了吗（同域、归一化后相等）—— 你写的与助手记的一起比，⛔ 不存
 * 两行一样的话。命中就把那一行顶到最前（`updatedAt`），⛔ 不改原文。
 */
async function findSameText(
  userId: string,
  destination: { scope: AssistantMemoryScope; workspaceKey: string | null },
  text: string,
): Promise<MemoryRow | null> {
  const normalized = normalizeAssistantMemoryText(text)
  const siblings = await db.assistantMemory.findMany({
    where: { userId, ...destination },
    select: MEMORY_SELECT,
    take:
      ASSISTANT_MEMORY_LIMITS.maxPerScope +
      ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
  })
  return (
    siblings.find(
      (row) => normalizeAssistantMemoryText(row.text) === normalized,
    ) ?? null
  )
}

/**
 * **你写一条**（记忆页那一格，回车存下）—— 来源 `creator`、类别 `rule`。
 *
 * ⚠ 上限是一道真的会拒的闸（`maxCreatorEntries`）：你写的每一轮都整段进提示，
 * ⛔ 不淘汰，所以满了就拒、让用户先删一条。
 */
export async function createCreatorMemory(
  userId: string,
  input: CreateAssistantMemoryRequest,
): Promise<AssistantMemory> {
  const text = input.text.trim()
  const destination = await resolveMemoryDestination(userId, input)
  const same = await findSameText(userId, destination, text)
  if (same) {
    const row = await db.assistantMemory.update({
      where: { id: same.id, userId, ...destination },
      data: {
        source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator],
        lastUsedAt: new Date(),
      },
      select: MEMORY_SELECT,
    })
    const memory = toMemory(row)
    if (!memory) throw new Error('ASSISTANT_MEMORY_UNREADABLE_AFTER_WRITE')
    return memory
  }

  const count = await db.assistantMemory.count({
    where: {
      userId,
      source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator],
    },
  })
  if (count >= ASSISTANT_MEMORY_LIMITS.maxCreatorEntries) {
    throw new AssistantMemoryLimitError(
      ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
    )
  }

  const row = await db.assistantMemory.create({
    data: {
      userId,
      ...destination,
      kind: DB_KIND_BY_ID[ASSISTANT_MEMORY_KIND_IDS.rule],
      source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator],
      text,
    },
    select: MEMORY_SELECT,
  })
  const memory = toMemory(row)
  if (!memory) throw new Error('ASSISTANT_MEMORY_UNREADABLE_AFTER_WRITE')
  return memory
}

export async function createCreatorMemoryForClerkId(
  clerkId: string,
  input: CreateAssistantMemoryRequest,
): Promise<AssistantMemory> {
  const user = await ensureUser(clerkId)
  return createCreatorMemory(user.id, input)
}

/**
 * **助手在对话里记下一条规矩**（`add_project_rule` 的普通规则，旧项目规则并进来后
 * 落在这里）—— 来源 `assistant`、类别 `rule`，与每轮结账那条路同一份淘汰。
 *
 * ⚠ 同一句话已经在了（任何来源）就返回那一行，`created: false` —— 规划器据此
 * 告诉模型「已经记着了」，⛔ 不存第二行。
 */
export async function addAssistantRuleMemory(
  userId: string,
  input: { text: string; workspaceKey: string },
): Promise<{ memory: AssistantMemory; created: boolean }> {
  const text = input.text.trim()
  const destination = await resolveMemoryDestination(userId, {
    workspaceKey: input.workspaceKey,
  })
  const same = await findSameText(userId, destination, text)
  if (same) {
    const memory = toMemory(same)
    if (!memory) throw new Error('ASSISTANT_MEMORY_UNREADABLE_AFTER_WRITE')
    return { memory, created: false }
  }
  const row = await db.assistantMemory.create({
    data: {
      userId,
      ...destination,
      kind: DB_KIND_BY_ID[ASSISTANT_MEMORY_KIND_IDS.rule],
      source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
      text,
    },
    select: MEMORY_SELECT,
  })
  await evictOldestAssistantMemories(userId, input.workspaceKey)
  const memory = toMemory(row)
  if (!memory) throw new Error('ASSISTANT_MEMORY_UNREADABLE_AFTER_WRITE')
  return { memory, created: true }
}

/**
 * 就地改一条：那一行字，和它用在哪。返回 `null` = 不属于这个用户（或已经没了）
 * —— 路由据此 404。
 *
 * ⚠ 改完 `updatedAt` 自动前移（`@updatedAt`），于是它跳到列表最前 —— 这是
 * 有意的：用户刚动过的那条该在眼前。
 */
export async function updateAssistantMemory(
  userId: string,
  memoryId: string,
  input: UpdateAssistantMemoryRequest,
): Promise<AssistantMemory | null> {
  const existing = await db.assistantMemory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true },
  })
  if (!existing) return null

  const destination =
    input.workspaceKey !== undefined || input.scope !== undefined
      ? await resolveMemoryDestination(userId, input)
      : undefined
  const row = await db.assistantMemory.update({
    where: { id: existing.id, userId },
    data: {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...destination,
      ...(destination?.scope === 'GLOBAL' ? { source: 'CREATOR' } : {}),
    },
    select: MEMORY_SELECT,
  })
  return toMemory(row)
}

export async function updateAssistantMemoryForClerkId(
  clerkId: string,
  memoryId: string,
  input: UpdateAssistantMemoryRequest,
): Promise<AssistantMemory | null> {
  const user = await ensureUser(clerkId)
  return updateAssistantMemory(user.id, memoryId, input)
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

/**
 * 清空（跟着筛选走：全部 / 你写的 / 助手记的）。返回删掉了几条 —— 二次确认在
 * 客户端，这一跳不再问一遍。
 */
export async function clearAssistantMemories(
  userId: string,
  source?: AssistantMemorySourceId,
): Promise<number> {
  const { count } = await db.assistantMemory.deleteMany({
    where: { userId, ...(source ? { source: DB_SOURCE_BY_ID[source] } : {}) },
  })
  return count
}

export async function clearAssistantMemoriesForClerkId(
  clerkId: string,
  source?: AssistantMemorySourceId,
): Promise<number> {
  const user = await ensureUser(clerkId)
  return clearAssistantMemories(user.id, source)
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
  workspaceKey: string
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
  const destination = await resolveMemoryDestination(args.userId, {
    workspaceKey: args.workspaceKey,
  })
  const seen = new Set<string>()
  const accepted: {
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
    const normalized = normalizeAssistantMemoryText(text)
    if (normalized.length === 0) continue
    // ② 本轮内部去重（同域同类同字面）。
    const key = `${candidate.kind}\0${normalized}`
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push({ kind: candidate.kind, text, normalized })
  }

  if (accepted.length === 0) return 0

  let written = 0
  let created = false

  for (const entry of accepted) {
    /**
     * ③ 与库里字面去重。⚠ 归一化**在内存里比**而不是写成一列：加一列
     * `normalizedText` 就要为存量行回填，而回填一张可能有几万行的表换来的只是
     * 每轮省一次最多 200 行的扫描。
     */
    const siblings = await db.assistantMemory.findMany({
      where: {
        userId: args.userId,
        ...destination,
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
        where: { id: hit.id, userId: args.userId, ...destination },
        data: { lastUsedAt: new Date() },
      })
      written += 1
      continue
    }

    await db.assistantMemory.create({
      data: {
        userId: args.userId,
        ...destination,
        kind: DB_KIND_BY_ID[entry.kind],
        text: entry.text,
        conversationId: args.conversationId ?? null,
        messageId: args.messageId ?? null,
      },
      select: { id: true },
    })
    written += 1
    created = true
  }

  // ④ 只对**这一轮新增过**的域收一次上限：没新增的域条数没变。
  if (created) {
    await evictOldestAssistantMemories(args.userId, args.workspaceKey)
  }

  return written
}

/**
 * 每域上限 200（**只数助手记的**）—— 超了按 `lastUsedAt` 最旧的**静默**删。
 *
 * ⛔ 你写的不淘汰（助手设置 B：你写的优先）。
 * ⛔ 不通知、不画容量表、不变灰（owner 2026-09-20 撤）。
 * ⚠ 按 `lastUsedAt` 而不是 `createdAt`：一条两年前记下、每一轮都在用的偏好，
 * 比昨天记下、再没被注入过的那条值钱。
 */
async function evictOldestAssistantMemories(
  userId: string,
  workspaceKey: string,
): Promise<void> {
  const where = {
    userId,
    workspaceKey,
    source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
  }
  const count = await db.assistantMemory.count({ where })
  const excess = count - ASSISTANT_MEMORY_LIMITS.maxPerScope
  if (excess <= 0) return

  const doomed = await db.assistantMemory.findMany({
    where,
    orderBy: { lastUsedAt: 'asc' },
    take: excess,
    select: { id: true },
  })
  if (doomed.length === 0) return
  await db.assistantMemory.deleteMany({
    where: { ...where, id: { in: doomed.map((row) => row.id) } },
  })
}
