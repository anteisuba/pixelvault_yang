import 'server-only'

import {
  ASSISTANT_MEMORY_KIND_IDS,
  ASSISTANT_MEMORY_LIFECYCLE,
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
import { expiresAtFromUntil } from '@/lib/memory-until'
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
  [ASSISTANT_MEMORY_SCOPE_IDS.video]: 'VIDEO',
  [ASSISTANT_MEMORY_SCOPE_IDS.canvas]: 'CANVAS',
  [ASSISTANT_MEMORY_SCOPE_IDS.lora]: 'LORA',
  [ASSISTANT_MEMORY_SCOPE_IDS.cards]: 'CARDS',
  [ASSISTANT_MEMORY_SCOPE_IDS.global]: 'GLOBAL',
}

const ID_BY_DB_SCOPE: Record<AssistantMemoryScope, AssistantMemoryScopeId> = {
  IMAGE: ASSISTANT_MEMORY_SCOPE_IDS.image,
  VIDEO: ASSISTANT_MEMORY_SCOPE_IDS.video,
  CANVAS: ASSISTANT_MEMORY_SCOPE_IDS.canvas,
  LORA: ASSISTANT_MEMORY_SCOPE_IDS.lora,
  CARDS: ASSISTANT_MEMORY_SCOPE_IDS.cards,
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
  kind: true,
  source: true,
  text: true,
  projectId: true,
  project: { select: { name: true } },
  characterCardId: true,
  characterCard: { select: { name: true } },
  pinned: true,
  expiresAt: true,
  dormantAt: true,
  createdAt: true,
  updatedAt: true,
} as const

interface MemoryRow {
  id: string
  scope: AssistantMemoryScope
  kind: AssistantMemoryKind
  source: AssistantMemorySource
  text: string
  projectId: string | null
  project: { name: string } | null
  characterCardId: string | null
  characterCard: { name: string } | null
  pinned: boolean
  expiresAt: Date | null
  dormantAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** 过期了吗（钉住的永不过期）：读的时候现算（第 ⑦ 步）。 */
function isExpired(
  row: { pinned: boolean; expiresAt: Date | null },
  now = new Date(),
): boolean {
  return !row.pinned && Boolean(row.expiresAt) && row.expiresAt! <= now
}

/**
 * **还活着的那几条**（第 ⑦ 步）：没沉睡、没过期（钉住的不算过期）。注入、翻记忆、给模型看的已有记忆都只读它们 ——
 * 沉睡和过期的她不会再提起（owner 10-30「不可以提及」），只在她页上「沉睡」一栏里。
 */
function liveWhere(now = new Date()) {
  return {
    dormantAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }, { pinned: true }],
  }
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
    source: ID_BY_DB_SOURCE[row.source],
    text: row.text,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    characterCardId: row.characterCardId,
    characterName: row.characterCard?.name ?? null,
    pinned: row.pinned,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    dormant: Boolean(row.dormantAt) || isExpired(row),
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
    // 角色的记忆在她页上「记忆」栏（第 ⑦ 步），设置页只管工作台的。
    characterCardId: null,
    ...(options.scope ? { scope: DB_SCOPE_BY_ID[options.scope] } : {}),
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

/** 当前域 + `global`（`global` 本身就只是它自己）。 */
function promptScopes(scope: AssistantMemoryScopeId): AssistantMemoryScope[] {
  return scope === ASSISTANT_MEMORY_SCOPE_IDS.global
    ? [DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global]]
    : [DB_SCOPE_BY_ID[scope], DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global]]
}

/**
 * 注入时哪几条算数：当前域 + `global`，⭐ 画布再按项目收（owner 2026-10-09：一个
 * 项目一份记忆，换了项目之前的记忆不能影响新项目）—— 别的项目的那几条一条都不带；
 * 不归项目的画布记忆（「所有画布」，你自己定的范围）照旧带。
 */
function promptWhere(
  scope: AssistantMemoryScopeId,
  projectId: string | null | undefined,
  characterCardId?: string | null,
) {
  /**
   * ⭐ 和角色聊天（附录L 第二片，owner 2026-10-16「现在上」）：只要**这个角色**的记忆 + 你自己写的
   * 全局规矩 —— 工作里学到的 ⛔ 一条都不带进故事，别的角色的也不带。
   */
  if (characterCardId)
    return {
      OR: [
        { characterCardId },
        {
          scope: DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global],
          source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator],
          characterCardId: null,
        },
      ],
    }
  // 工作里 ⛔ 不读任何角色的记忆：故事里的事不串进工作台。
  if (scope !== ASSISTANT_MEMORY_SCOPE_IDS.canvas)
    return { scope: { in: promptScopes(scope) }, characterCardId: null }
  return {
    characterCardId: null,
    OR: [
      { scope: DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global] },
      { scope: DB_SCOPE_BY_ID[scope], projectId: null },
      ...(projectId ? [{ scope: DB_SCOPE_BY_ID[scope], projectId }] : []),
    ],
  }
}

/**
 * 写进项目的那个 id 真是这个用户的项目才收（工作台键是客户端递来的）；不是就
 * `null` —— 调用方据此**不写**这一条，⛔ 不退成「所有画布」。
 */
async function ownedProjectId(
  userId: string,
  projectId: string | null | undefined,
): Promise<string | null> {
  if (!projectId) return null
  const project = await db.nodeWorkflowProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  })
  return project?.id ?? null
}

/** 同 `ownedProjectId`：角色卡真是这个用户的（且没删）才收，不是就 `null` —— 调用方据此不写。 */
async function ownedCharacterCardId(
  userId: string,
  characterCardId: string | null | undefined,
): Promise<string | null> {
  if (!characterCardId) return null
  const card = await db.characterCard.findFirst({
    where: { id: characterCardId, userId, isDeleted: false },
    select: { id: true },
  })
  return card?.id ?? null
}

/**
 * **注入那一跳要的那几条助手记的**（切片 2）：当前域 + `global`，按 `lastUsedAt`
 * 倒序。⚠ 只要助手记的 —— 你写的有自己那一段（`listCreatorMemoriesForPrompt`）。
 *
 * ⚠ 预算由调用方给（卡优先，见 `ASSISTANT_CONTEXT_BUDGET`）—— ⛔ 这里不自己
 * 读卡表：一个函数同时决定两种东西各占多少，是把预算判据藏进了服务层。
 * ⚠ `limit <= 0` 时**一条都不查**：预算被卡吃光了，⛔ 别照样打一次库。
 */
export async function listAssistantMemoriesForPrompt(
  userId: string,
  scope: AssistantMemoryScopeId,
  limit: number,
  projectId?: string | null,
  characterCardId?: string | null,
): Promise<AssistantMemory[]> {
  if (limit <= 0) return []
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
      AND: [promptWhere(scope, projectId, characterCardId), liveWhere()],
    },
    /**
     * ⭐ 固定的一组（P3）：最近记下 / 改过的那几条，⛔ 不按 `lastUsedAt` —— 原来注入一次就刷一次，
     *   进过提示的永远排最前，别的再也上不来（自我强化）；也让前缀每轮都变、缓存吃不住。
     *   没进提示的靠 `searchAssistantMemories` 翻。第二键让并列时选哪几条确定。
     */
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: Math.min(limit, ASSISTANT_MEMORY_LIMITS.maxInPrompt),
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

/**
 * **你写的**那一段（助手设置 B：你写的优先）—— 当前域 + `global`，最近改过的在前。
 *
 * ⭐ 它们进「你写下的规矩」那一段，带 id，能被引用成规则薄卡；⛔ 不占记忆预算、
 * ⛔ 不参与淘汰。旧「项目规则」里用户自己写的普通规则就在这里。
 */
export async function listCreatorMemoriesForPrompt(
  userId: string,
  scope: AssistantMemoryScopeId,
  limit: number,
  projectId?: string | null,
  characterCardId?: string | null,
): Promise<AssistantMemory[]> {
  if (limit <= 0) return []
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator],
      AND: [
        /**
         * 和角色聊天：只要你写的全局规矩。你在她页上「记一条」写给她的那几行是她记得的事（第 ⑦ 步），
         * 跟她自己记的一起进「记得的事」那一段，⛔ 不当规矩重复印一遍。
         */
        characterCardId
          ? {
              scope: DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global],
              characterCardId: null,
            }
          : promptWhere(scope, projectId),
        liveWhere(),
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: Math.min(limit, ASSISTANT_MEMORY_LIMITS.maxCreatorEntries),
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

/**
 * 助手翻「规矩」的那一次（`read_project_rules`）：你写的 + 助手在对话里记下的规矩，
 * 给了域就只要该域 + `global`。最近改过的在前。
 */
export async function listStandingRuleMemories(
  userId: string,
  options: {
    scope?: AssistantMemoryScopeId | null
    projectId?: string | null
    characterCardId?: string | null
    limit: number
  },
): Promise<AssistantMemory[]> {
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      AND: [
        {
          OR: [
            { source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator] },
            { kind: DB_KIND_BY_ID[ASSISTANT_MEMORY_KIND_IDS.rule] },
          ],
        },
        liveWhere(),
        options.scope || options.characterCardId
          ? promptWhere(
              options.scope ?? ASSISTANT_MEMORY_SCOPE_IDS.global,
              options.projectId,
              options.characterCardId,
            )
          : // 不分范围读也只读不归项目的 + 当前项目的，⛔ 别的项目一条都不带、⛔ 角色的也不带。
            {
              characterCardId: null,
              OR: [
                { projectId: null },
                ...(options.projectId
                  ? [{ projectId: options.projectId }]
                  : []),
              ],
            },
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
 * **真被用到就更新 `lastUsedAt`**（被助手翻到、同一句又记了一次）—— 淘汰顺序读它。
 * ⚠ P3 起注入不再算「用到」：注入的那组按 `updatedAt` 定，见 `listAssistantMemoriesForPrompt`。
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
    data: { lastUsedAt: new Date(), mentions: { increment: 1 } },
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
  scope: AssistantMemoryScopeId,
  text: string,
  projectId: string | null = null,
  characterCardId: string | null = null,
): Promise<MemoryRow | null> {
  const normalized = normalizeAssistantMemoryText(text)
  const siblings = await db.assistantMemory.findMany({
    where: { userId, scope: DB_SCOPE_BY_ID[scope], projectId, characterCardId },
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
  input: { text: string; scope: AssistantMemoryScopeId },
): Promise<AssistantMemory> {
  const text = input.text.trim()
  const same = await findSameText(userId, input.scope, text)
  if (same) {
    const row = await db.assistantMemory.update({
      where: { id: same.id },
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
      scope: DB_SCOPE_BY_ID[input.scope],
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
  input: { text: string; scope: AssistantMemoryScopeId },
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
  input: {
    text: string
    scope: AssistantMemoryScopeId
    /** 画布上记的归这个项目（只认这个用户自己的项目）。 */
    projectId?: string | null
    /** 和角色聊天时记的归这个角色（范围一律 `cards`，只认这个用户自己的卡）。 */
    characterCardId?: string | null
    /** 新内核记的偏好 / 事实（第 6 步）；缺席 = 规矩。 */
    kind?: AssistantMemoryKindId
    /** 带日子的事到哪天为止（`YYYY-MM-DD`，第 ⑦ 步）。 */
    until?: string | null
  },
): Promise<{ memory: AssistantMemory; created: boolean }> {
  const text = input.text.trim()
  const characterCardId = await ownedCharacterCardId(
    userId,
    input.characterCardId,
  )
  if (input.characterCardId && !characterCardId)
    throw new Error('ASSISTANT_MEMORY_CHARACTER_NOT_FOUND')
  const scope = characterCardId ? ASSISTANT_MEMORY_SCOPE_IDS.cards : input.scope
  const projectId =
    scope === ASSISTANT_MEMORY_SCOPE_IDS.canvas
      ? await ownedProjectId(userId, input.projectId)
      : null
  const same = await findSameText(
    userId,
    scope,
    text,
    projectId,
    characterCardId,
  )
  const expiresAt = input.until ? expiresAtFromUntil(input.until) : null
  if (same) {
    // 又提到一次（第 ⑦ 步）：+1；沉睡 / 过期了的醒过来（这回没给日子 = 一直成立）。
    const row = await db.assistantMemory.update({
      where: { id: same.id },
      data: {
        lastUsedAt: new Date(),
        mentions: { increment: 1 },
        ...(same.dormantAt || isExpired(same) || expiresAt
          ? { dormantAt: null, expiresAt }
          : {}),
      },
      select: MEMORY_SELECT,
    })
    const memory = toMemory(row)
    if (!memory) throw new Error('ASSISTANT_MEMORY_UNREADABLE_AFTER_WRITE')
    return { memory, created: false }
  }
  const row = await db.assistantMemory.create({
    data: {
      userId,
      scope: DB_SCOPE_BY_ID[scope],
      kind: DB_KIND_BY_ID[input.kind ?? ASSISTANT_MEMORY_KIND_IDS.rule],
      source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
      text,
      expiresAt,
      projectId,
      characterCardId,
    },
    select: MEMORY_SELECT,
  })
  await evictOldestAssistantMemories(userId, scope, characterCardId)
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
  input: UpdateAssistantMemoryRequest & { until?: string | null },
): Promise<AssistantMemory | null> {
  const existing = await db.assistantMemory.findFirst({
    where: { id: memoryId, userId },
    select: { id: true, characterCardId: true },
  })
  if (!existing) return null

  const row = await db.assistantMemory.update({
    where: { id: existing.id },
    data: {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.until !== undefined
        ? {
            expiresAt: input.until ? expiresAtFromUntil(input.until) : null,
          }
        : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      // 唤醒（第 ⑦ 步）：回到记得的里，过期的日子去掉，算刚用过（不会马上又被挤走）。
      ...(input.wake
        ? { dormantAt: null, expiresAt: null, lastUsedAt: new Date() }
        : {}),
      // 在设置里换了范围（含「画布」= 所有画布）就不再只属于那个项目 / 那个角色。
      ...(input.scope !== undefined
        ? {
            scope: DB_SCOPE_BY_ID[input.scope],
            projectId: null,
            characterCardId: null,
          }
        : {}),
    },
    select: MEMORY_SELECT,
  })
  // 唤醒的那条回来占了一个位子：满了就让最该睡的那条去睡。
  if (input.wake && existing.characterCardId && !input.scope)
    await evictOldestAssistantMemories(
      userId,
      ASSISTANT_MEMORY_SCOPE_IDS.cards,
      existing.characterCardId,
    )
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
    where: {
      userId,
      // 设置页只管工作台的记忆，⛔ 一键清掉角色们记得的事（第 ⑦ 步起它们在她页上）。
      characterCardId: null,
      ...(source ? { source: DB_SOURCE_BY_ID[source] } : {}),
    },
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
  /** 这一轮在哪台：所有候选都挂这个域（⛔ 不由模型定，P3 作用域修正）。 */
  scope: AssistantMemoryScopeId
  /** 在画布项目里结的账：画布范围的那几条归这个项目（只认这个用户自己的项目）。 */
  projectId?: string | null
  /** 和角色聊天时结的账：全部归这个角色（范围一律 `cards`，只认这个用户自己的卡）。 */
  characterCardId?: string | null
  candidates: readonly AssistantMemoryCandidate[]
  /**
   * 改掉已有的哪几条（P3 写入时消解冲突）：模型说「新的这条替掉第 N 条」，调用方已把号映射成 id。
   * ⚠ 只认**助手记的**、这个用户的行；你写的那几条模型碰不到。
   */
  replacements?: readonly { id: string; candidate: AssistantMemoryCandidate }[]
  /** 不再成立、要忘掉的那几条的 id（同样只认助手记的）。 */
  forget?: readonly string[]
  conversationId?: string | undefined
  messageId?: string | undefined
}

/**
 * **后台抽记忆时给模型看的那几条已有记忆**（P3 写入时消解冲突）：与注入同一个范围（当前域 +
 * global，画布按项目收），只要助手记的，最近改过的在前。
 * ⚠ 你写的 ⛔ 不给：那几条只有你能改，给模型看了它也只能干看着，还会诱导它「改掉」。
 */
export async function listAssistantMemoriesForReview(
  userId: string,
  scope: AssistantMemoryScopeId,
  projectId?: string | null,
  characterCardId?: string | null,
): Promise<AssistantMemory[]> {
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
      AND: [promptWhere(scope, projectId, characterCardId), liveWhere()],
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: ASSISTANT_MEMORY_LIMITS.maxShownForReview,
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

/**
 * 助手**翻记忆**（P3 读取：`search_library kind "memories"`）—— 每轮只注入最近改过的那几条，
 * 剩下的靠它翻。当前域 + global（画布只本项目），你写的与助手记的都翻。
 *
 * ⚠ 匹配只做「含其中任一个词」（大小写不敏感），⛔ 不做向量 / 相似度：一行最多 200 字，
 *   措辞对不上就让模型换个词再翻，或者空着查询看最近的那批。
 * ⭐ 翻到的**助手记的**刷新 `lastUsedAt`：真被用到才算用过（淘汰读它），⛔ 注入不再算。
 */
export async function searchAssistantMemories(
  userId: string,
  options: {
    scope: AssistantMemoryScopeId
    projectId?: string | null
    characterCardId?: string | null
    query: string
  },
): Promise<AssistantMemory[]> {
  const words = options.query
    .split(/[\s,，、;；]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, ASSISTANT_MEMORY_LIMITS.maxSearchWords)
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      AND: [
        promptWhere(options.scope, options.projectId, options.characterCardId),
        liveWhere(),
        ...(words.length
          ? [
              {
                OR: words.map((word) => ({
                  text: { contains: word, mode: 'insensitive' as const },
                })),
              },
            ]
          : []),
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: ASSISTANT_MEMORY_LIMITS.maxSearchResults,
    select: MEMORY_SELECT,
  })
  const memories = rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
  const used = memories
    .filter((memory) => memory.source === ASSISTANT_MEMORY_SOURCE_IDS.assistant)
    .map((memory) => memory.id)
  if (used.length > 0) await touchAssistantMemories(userId, used)
  return memories
}

/** 一条候选 → 能落库的那一份：去空、过敏感闸（命中回 `null`，⛔ 不记明文）。 */
interface AcceptedCandidate {
  kind: AssistantMemoryKindId
  text: string
  normalized: string
  /** 带日子的事到这一刻为止（第 ⑦ 步）；空 = 一直成立。 */
  expiresAt: Date | null
}

function acceptableCandidate(
  candidate: AssistantMemoryCandidate,
): AcceptedCandidate | null {
  const text = candidate.text.trim()
  if (text.length === 0 || isSensitiveMemoryText(text)) return null
  const normalized = normalizeAssistantMemoryText(text)
  if (normalized.length === 0) return null
  return {
    kind: candidate.kind,
    text,
    normalized,
    expiresAt: candidate.until ? expiresAtFromUntil(candidate.until) : null,
  }
}

/**
 * **每轮结账时一次性写**（切片 1；P3 加了改与忘）—— 这条路是助手记忆唯一的写入口。
 *
 * 顺序，逐条有理由：
 *  ① **忘掉**模型说不再成立的那几条（只删助手记的、这个用户的）。
 *  ② **改掉**模型说被新的一条替掉的那几条：原地换字、刷新时间。
 *     ⚠ 同一行既要忘又要改 → 改赢（模型给了新说法）。
 *  ③ **敏感闸** —— 一票否决，排在去重前面才不会让一条敏感文本先去库里比对一次。
 *  ④ **本轮内部去重**，再**与库里字面去重**（同 userId + scope + kind，归一化后相等）——
 *     命中就**只刷新 `lastUsedAt`**，⛔ 不新增、⛔ 不改原文：用户可能已经在设置里把那行字改顺眼了。
 *  ⑤ **每域上限 200** —— 超了按 `lastUsedAt` 最旧的静默删。
 *
 * 返回**真正记下的条数**（新增 + 改掉 + 命中刷新），它就是回执上那个 N；忘掉的不算。
 * ⚠ 敏感命中与本轮重复都不进这个数 —— 回执里不许出现「有 N 条被跳过」。
 */
export async function recordAssistantMemories(
  args: RecordAssistantMemoriesArgs,
): Promise<number> {
  const assistantOwned = {
    userId: args.userId,
    source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
  }
  const replacements = new Map<string, AcceptedCandidate>()
  for (const replacement of args.replacements ?? []) {
    if (replacements.has(replacement.id)) continue
    const accepted = acceptableCandidate(replacement.candidate)
    if (accepted) replacements.set(replacement.id, accepted)
  }
  const forget = (args.forget ?? []).filter((id) => !replacements.has(id))

  // ① 忘掉。
  if (forget.length > 0)
    await db.assistantMemory.deleteMany({
      where: { ...assistantOwned, id: { in: [...new Set(forget)] } },
    })

  // ② 改掉：`updateMany` 带上归属条件，号映射错了也改不到别人的、改不到你写的。
  let written = 0
  const now = new Date()
  for (const [id, entry] of replacements) {
    const result = await db.assistantMemory.updateMany({
      where: { ...assistantOwned, id },
      data: {
        text: entry.text,
        kind: DB_KIND_BY_ID[entry.kind],
        lastUsedAt: now,
        // 新说法自己带不带日子由它定（计划改成了长期的事 → 去掉日子）。
        expiresAt: entry.expiresAt,
      },
    })
    written += result.count
  }

  const seen = new Set<string>()
  const accepted: AcceptedCandidate[] = []
  for (const candidate of args.candidates) {
    if (
      accepted.length + replacements.size >=
      ASSISTANT_MEMORY_LIMITS.maxPerRound
    )
      break
    // ③ 敏感类目：不写、不计数、⛔ 不记任何日志明文。
    const entry = acceptableCandidate(candidate)
    if (!entry) continue
    // ④ 本轮内部去重（同类同字面）。
    const key = `${entry.kind} ${entry.normalized}`
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push(entry)
  }

  if (accepted.length === 0) return written

  /**
   * 画布范围的候选归当前项目（owner 2026-10-09：一个项目一份记忆）。项目对不上
   * 这个用户（或请求里没有项目）时**画布那几条不写**，⛔ 不退成「所有画布」——
   * 那会让这个项目的事漏进别的项目。
   */
  const characterCardId = await ownedCharacterCardId(
    args.userId,
    args.characterCardId,
  )
  // 角色对不上（删了 / 不是你的）就一条都不写，⛔ 不退成角色页的记忆。
  if (args.characterCardId && !characterCardId) return written
  const scope = characterCardId ? ASSISTANT_MEMORY_SCOPE_IDS.cards : args.scope
  const isCanvas = scope === ASSISTANT_MEMORY_SCOPE_IDS.canvas
  const projectId = isCanvas
    ? await ownedProjectId(args.userId, args.projectId)
    : null
  if (isCanvas && !projectId) return written
  let added = false

  for (const entry of accepted) {
    /**
     * ④ 与库里字面去重。⚠ 归一化**在内存里比**而不是写成一列：加一列
     * `normalizedText` 就要为存量行回填，而回填一张可能有几万行的表换来的只是
     * 每轮省一次最多 200 行的扫描。
     */
    const siblings = await db.assistantMemory.findMany({
      where: {
        userId: args.userId,
        scope: DB_SCOPE_BY_ID[scope],
        kind: DB_KIND_BY_ID[entry.kind],
        projectId,
        characterCardId,
      },
      select: { id: true, text: true },
      take: ASSISTANT_MEMORY_LIMITS.maxPerScope,
    })
    const hit = siblings.find(
      (row) => normalizeAssistantMemoryText(row.text) === entry.normalized,
    )
    if (hit) {
      // 又提到一次（第 ⑦ 步）：+1、醒过来；这回带了日子就换成新的日子。
      await db.assistantMemory.update({
        where: { id: hit.id },
        data: {
          lastUsedAt: new Date(),
          mentions: { increment: 1 },
          dormantAt: null,
          ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
        },
      })
      written += 1
      continue
    }

    await db.assistantMemory.create({
      data: {
        userId: args.userId,
        scope: DB_SCOPE_BY_ID[scope],
        kind: DB_KIND_BY_ID[entry.kind],
        text: entry.text,
        expiresAt: entry.expiresAt,
        projectId,
        characterCardId,
        conversationId: args.conversationId ?? null,
        messageId: args.messageId ?? null,
      },
      select: { id: true },
    })
    written += 1
    added = true
  }

  // ⑤ 这一轮新增过才收一次上限：没新增的域条数没变。
  if (added)
    await evictOldestAssistantMemories(args.userId, scope, characterCardId)

  return written
}

/**
 * 每域上限 200（**只数助手记的**）—— 超了按 `lastUsedAt` 最旧的**静默**删。
 *
 * ⛔ 你写的不淘汰（助手设置 B：你写的优先）。
 * ⛔ 不通知、不画容量表、不变灰（owner 2026-09-20 撤）。
 * ⚠ 按 `lastUsedAt` 而不是 `createdAt`：一条两年前记下、每一轮都在用的偏好，
 * 比昨天记下、再没被注入过的那条值钱。
 * ⚠ 每个角色单独一份上限（`characterCardId`）：和她聊得多，⛔ 不该挤掉角色页 / 别的角色记的。
 */
async function evictOldestAssistantMemories(
  userId: string,
  scope: AssistantMemoryScopeId,
  characterCardId: string | null = null,
): Promise<void> {
  const where = {
    userId,
    scope: DB_SCOPE_BY_ID[scope],
    characterCardId,
    source: DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant],
  }
  if (characterCardId)
    return putCharacterMemoriesToSleep({ ...where, characterCardId })
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
    where: { userId, id: { in: doomed.map((row) => row.id) } },
  })
}

/**
 * **角色那份满了就去睡**（角色大项目第 ⑦ 步，owner 10-30）：⛔ 删，挤出去的进「沉睡」，她页上能唤醒、⛔ 自动删。
 *
 * - 只数还活着的（沉睡 / 过期的不占位子）；钉住的占位子但永远不挤。
 * - 挤谁：最近用过的时间 + 每被提到一次让 `mentionBonusDays` 天，最小的先睡 —— 常被提到的更难挤掉，
 *   但很久以前提得多、后来再没用过的照样会睡（⛔ 提一次就永远不睡）。
 */
async function putCharacterMemoriesToSleep(where: {
  userId: string
  scope: AssistantMemoryScope
  characterCardId: string
  source: AssistantMemorySource
}): Promise<void> {
  const now = new Date()
  const live = await db.assistantMemory.findMany({
    where: { ...where, ...liveWhere(now) },
    select: { id: true, pinned: true, lastUsedAt: true, mentions: true },
  })
  const excess = live.length - ASSISTANT_MEMORY_LIMITS.maxPerScope
  if (excess <= 0) return
  const bonus =
    ASSISTANT_MEMORY_LIFECYCLE.mentionBonusDays * 24 * 60 * 60 * 1000
  const keepScore = (row: (typeof live)[number]) =>
    row.lastUsedAt.getTime() +
    Math.min(row.mentions, ASSISTANT_MEMORY_LIFECYCLE.maxMentionsCounted) *
      bonus
  const sleepy = live
    .filter((row) => !row.pinned)
    .sort((a, b) => keepScore(a) - keepScore(b) || a.id.localeCompare(b.id))
    .slice(0, excess)
  if (sleepy.length === 0) return
  await db.assistantMemory.updateMany({
    where: { userId: where.userId, id: { in: sleepy.map((row) => row.id) } },
    data: { dormantAt: now },
  })
}

// ---------------------------------------------------------------- 她页「记忆」栏（第 ⑦ 步）

/**
 * 她那份记忆，分成「记得的」和「沉睡的」（挤出去的 + 过期的）。记得的：钉住的在前、再按最近改过；
 * 沉睡的按什么时候睡的（过期的按过期那一刻）倒序。卡不是你的不在这里查 —— 调用方先查卡。
 */
export async function listCharacterMemories(
  userId: string,
  characterCardId: string,
): Promise<{ remembered: AssistantMemory[]; dormant: AssistantMemory[] }> {
  const now = new Date()
  const [live, sleeping] = await Promise.all([
    db.assistantMemory.findMany({
      where: { userId, characterCardId, ...liveWhere(now) },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      take:
        ASSISTANT_MEMORY_LIMITS.maxPerScope +
        ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
      select: MEMORY_SELECT,
    }),
    db.assistantMemory.findMany({
      where: {
        userId,
        characterCardId,
        OR: [
          { dormantAt: { not: null } },
          { pinned: false, expiresAt: { lte: now } },
        ],
      },
      take: ASSISTANT_MEMORY_LIFECYCLE.maxDormantListed,
      orderBy: [{ dormantAt: 'desc' }, { expiresAt: 'desc' }, { id: 'asc' }],
      select: MEMORY_SELECT,
    }),
  ])
  const read = (rows: MemoryRow[]) =>
    rows
      .map(toMemory)
      .filter((memory): memory is AssistantMemory => memory !== null)
  return { remembered: read(live), dormant: read(sleeping) }
}

/**
 * 她页上「记一条」（第 ⑦ 步）：你写的、只归她、跟她自己记的一起进「记得的事」。同一句已经在了就把那条叫醒、
 * 算成你写的，⛔ 不存第二行。你写给她的最多 `maxCreatorEntries` 条（满了拒）。
 */
export async function createCharacterMemory(
  userId: string,
  characterCardId: string,
  text: string,
): Promise<AssistantMemory> {
  const line = text.trim()
  const scope = ASSISTANT_MEMORY_SCOPE_IDS.cards
  const creator = DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.creator]
  const same = await findSameText(userId, scope, line, null, characterCardId)
  if (same) {
    const row = await db.assistantMemory.update({
      where: { id: same.id },
      data: {
        source: creator,
        dormantAt: null,
        expiresAt: null,
        lastUsedAt: new Date(),
      },
      select: MEMORY_SELECT,
    })
    const memory = toMemory(row)
    if (!memory) throw new Error('ASSISTANT_MEMORY_UNREADABLE_AFTER_WRITE')
    return memory
  }
  const count = await db.assistantMemory.count({
    where: { userId, characterCardId, source: creator },
  })
  if (count >= ASSISTANT_MEMORY_LIMITS.maxCreatorEntries)
    throw new AssistantMemoryLimitError(
      ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
    )
  const row = await db.assistantMemory.create({
    data: {
      userId,
      scope: DB_SCOPE_BY_ID[scope],
      kind: DB_KIND_BY_ID[ASSISTANT_MEMORY_KIND_IDS.fact],
      source: creator,
      text: line,
      characterCardId,
    },
    select: MEMORY_SELECT,
  })
  const memory = toMemory(row)
  if (!memory) throw new Error('ASSISTANT_MEMORY_UNREADABLE_AFTER_WRITE')
  return memory
}

// ---------------------------------------------------------------- 新内核（第 6 步）

/**
 * **新内核注入的那一组**（第 6 步，owner 10-23「一个历史记录一份、互不干扰」+「要『关于你』这一层」）：
 * 「关于你」（global、不归项目也不归角色）+ 开着的那个角色自己那份。⛔ 各台的旧记忆不带（工作台对话里的事
 * 只留在那段对话里），要用时 `find` 翻。只要助手记的 —— 你写的走规矩那一段。最近记下 / 改过的在前（固定一组）。
 */
export async function listNextAssistantMemoriesForPrompt(
  userId: string,
  options: {
    characterCardId: string | null
    /** 画布：这个项目自己那份（第 9a 步）。 */
    projectId?: string | null
    limit: number
  },
): Promise<AssistantMemory[]> {
  if (options.limit <= 0) return []
  const assistant = DB_SOURCE_BY_ID[ASSISTANT_MEMORY_SOURCE_IDS.assistant]
  const rows = await db.assistantMemory.findMany({
    where: {
      userId,
      AND: [
        {
          OR: [
            {
              source: assistant,
              scope: DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.global],
              projectId: null,
              characterCardId: null,
            },
            // 她那份：她记的 + 你在她页上「记一条」写给她的（第 ⑦ 步）。
            ...(options.characterCardId
              ? [{ characterCardId: options.characterCardId }]
              : []),
            ...(options.projectId
              ? [
                  {
                    source: assistant,
                    scope: DB_SCOPE_BY_ID[ASSISTANT_MEMORY_SCOPE_IDS.canvas],
                    projectId: options.projectId,
                    characterCardId: null,
                  },
                ]
              : []),
          ],
        },
        liveWhere(),
      ],
    },
    // 钉住的先进（第 ⑦ 步），其余最近记下 / 改过的在前。
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    take: options.limit,
    select: MEMORY_SELECT,
  })
  return rows
    .map(toMemory)
    .filter((memory): memory is AssistantMemory => memory !== null)
}

/**
 * 按编号（`记忆·3f9a1c2b` 的那一截 id 开头）或原话认一条（新内核改 / 忘的那一步）。
 * 原话认：先全等、再包含，包含的不止一条就回 `ambiguous`，让模型拿编号来。
 */
export async function findAssistantMemoryByRef(
  userId: string,
  ref: { idPrefix: string | null; text: string },
): Promise<
  | { ok: true; memory: AssistantMemory }
  | { ok: false; reason: 'missing' | 'ambiguous' }
> {
  if (ref.idPrefix) {
    const rows = await db.assistantMemory.findMany({
      where: { userId, id: { startsWith: ref.idPrefix } },
      take: 2,
      select: MEMORY_SELECT,
    })
    const memory = rows.length === 1 ? toMemory(rows[0]!) : null
    if (memory) return { ok: true, memory }
    return { ok: false, reason: rows.length > 1 ? 'ambiguous' : 'missing' }
  }
  const words = ref.text.trim()
  if (!words) return { ok: false, reason: 'missing' }
  const rows = await db.assistantMemory.findMany({
    where: { userId, text: { contains: words, mode: 'insensitive' } },
    orderBy: { updatedAt: 'desc' },
    take: ASSISTANT_MEMORY_LIMITS.maxSearchResults,
    select: MEMORY_SELECT,
  })
  const normalized = normalizeAssistantMemoryText(words)
  const exact = rows.filter(
    (row) => normalizeAssistantMemoryText(row.text) === normalized,
  )
  const picked = exact.length ? exact : rows
  if (picked.length !== 1)
    return { ok: false, reason: picked.length ? 'ambiguous' : 'missing' }
  const memory = toMemory(picked[0]!)
  return memory ? { ok: true, memory } : { ok: false, reason: 'missing' }
}

/**
 * 撤销「忘掉」：按原样再记回去（新的 id）。归的项目 / 角色已经没了就不记（回 false）；同一句已经在了也不记第二行。
 */
export async function restoreAssistantMemory(
  userId: string,
  snapshot: {
    text: string
    scope: AssistantMemoryScopeId
    kind: AssistantMemoryKindId
    source: AssistantMemorySourceId
    projectId: string | null
    characterCardId: string | null
  },
): Promise<boolean> {
  const [projectId, characterCardId] = await Promise.all([
    ownedProjectId(userId, snapshot.projectId),
    ownedCharacterCardId(userId, snapshot.characterCardId),
  ])
  if (snapshot.projectId && !projectId) return false
  if (snapshot.characterCardId && !characterCardId) return false
  const same = await findSameText(
    userId,
    snapshot.scope,
    snapshot.text,
    projectId,
    characterCardId,
  )
  if (same) return false
  await db.assistantMemory.create({
    data: {
      userId,
      scope: DB_SCOPE_BY_ID[snapshot.scope],
      kind: DB_KIND_BY_ID[snapshot.kind],
      source: DB_SOURCE_BY_ID[snapshot.source],
      text: snapshot.text,
      projectId,
      characterCardId,
    },
  })
  return true
}
