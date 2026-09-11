import 'server-only'

import { db } from '@/lib/db'
import {
  ASSISTANT_PROJECT_RULE_LIMITS,
  PROJECT_RULE_KIND_IDS,
  PROJECT_RULE_SOURCE_IDS,
  PROJECT_RULE_SOURCE_KINDS,
  type ProjectRuleKindId,
  type ProjectRuleSourceId,
} from '@/constants/assistant-operator'
import { ensureUser } from '@/services/user.service'
import type {
  ProjectRuleKind as DbProjectRuleKind,
  ProjectRuleSource,
} from '@/lib/generated/prisma/client'
import {
  ProjectRuleSchema,
  type CreateProjectRuleInput,
  type ProjectRule,
} from '@/types/assistant-persona'

/**
 * 项目规则（`docs/references/pages/assistant-shell.md` §10，拍板 23）。
 *
 * owner 的真实工作流把价值沉淀在版本状态与复盘文档里，助手一条都读不到、写不回
 * —— 缺的是一张表。这个文件就是那张表的全部读写。
 *
 * ⚠ **每一条查询都按 `userId` 收敛**，没有例外：规则是用户自己写下的约束，
 * 翻别人的规则表和翻别人的素材库是同一件事。
 *
 * ── 它在工具环的 import 白名单里 ────────────────────────────────
 * 判据逐条对着 `assistant-operator.money-gate.test.ts` 那份名单的问题：它不创建
 * generation、不扣 credit、不调任何 provider、不碰 R2。它做的全部事情是读写一张
 * 只有文本列的表。
 */

/** 协议侧的小写 id ↔ 库里的 SCREAMING_SNAKE 枚举。⛔ 两处都不许写字面量。 */
const DB_SOURCE_BY_ID: Record<ProjectRuleSourceId, ProjectRuleSource> = {
  [PROJECT_RULE_SOURCE_IDS.assistant]: 'ASSISTANT',
  [PROJECT_RULE_SOURCE_IDS.creator]: 'CREATOR',
}

const ID_BY_DB_SOURCE: Record<ProjectRuleSource, ProjectRuleSourceId> = {
  ASSISTANT: PROJECT_RULE_SOURCE_IDS.assistant,
  CREATOR: PROJECT_RULE_SOURCE_IDS.creator,
}

/** 同上，规则**是哪一种**那一列（§9.3）。⛔ 两处都不许写字面量。 */
const DB_KIND_BY_ID: Record<ProjectRuleKindId, DbProjectRuleKind> = {
  [PROJECT_RULE_KIND_IDS.note]: 'NOTE',
  [PROJECT_RULE_KIND_IDS.sourceAllow]: 'SOURCE_ALLOW',
  [PROJECT_RULE_KIND_IDS.sourceDeny]: 'SOURCE_DENY',
}

const ID_BY_DB_KIND: Record<DbProjectRuleKind, ProjectRuleKindId> = {
  NOTE: PROJECT_RULE_KIND_IDS.note,
  SOURCE_ALLOW: PROJECT_RULE_KIND_IDS.sourceAllow,
  SOURCE_DENY: PROJECT_RULE_KIND_IDS.sourceDeny,
}

function toRule(row: {
  id: string
  scope: string | null
  text: string
  kind: DbProjectRuleKind
  source: ProjectRuleSource
  createdAt: Date
}): ProjectRule | null {
  /**
   * ⚠ 过 schema 而不是 `as`：`scope` 在库里是 `String?`（域词表住 constants，
   * ⛔ 不做成第二份 Prisma 枚举），所以「这个域还在词表里吗」只能在这里问。
   * 词表改过而存量行没跟上时这一行读不出来 —— 交给调用方过滤掉，
   * ⛔ 不把一个词表外的域塞进系统提示。
   */
  const parsed = ProjectRuleSchema.safeParse({
    id: row.id,
    scope: row.scope,
    text: row.text,
    kind: ID_BY_DB_KIND[row.kind],
    source: ID_BY_DB_SOURCE[row.source],
    createdAt: row.createdAt.toISOString(),
  })
  return parsed.success ? parsed.data : null
}

const RULE_SELECT = {
  id: true,
  scope: true,
  text: true,
  kind: true,
  source: true,
  createdAt: true,
} as const

/**
 * 列出用户的规则，最新的在前。
 *
 * ⚠ `scope` 给了就返回**该域的 + 全域的**（`scope: null`），⛔ 不是只返回该域的：
 * 一条「不许在画面里加字」的全域规则在图片工作台上照样成立，滤掉它等于让用户
 * 每个工作台再写一遍。
 */
export async function listProjectRules(
  userId: string,
  options: {
    scope?: string | null
    limit?: number
    /** 只要这几种（§9.3）。缺省 = 全都要。 */
    kinds?: readonly ProjectRuleKindId[]
  } = {},
): Promise<ProjectRule[]> {
  const rows = await db.projectRule.findMany({
    where: {
      userId,
      ...(options.scope
        ? { OR: [{ scope: options.scope }, { scope: null }] }
        : {}),
      ...(options.kinds?.length
        ? { kind: { in: options.kinds.map((kind) => DB_KIND_BY_ID[kind]) } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(
      options.limit ?? ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser,
      ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser,
    ),
    select: RULE_SELECT,
  })

  return rows.map(toRule).filter((rule): rule is ProjectRule => rule !== null)
}

/** 同上，但从 clerkId 起跳（API 路由那一侧用）。 */
export async function listProjectRulesForClerkId(
  clerkId: string,
  options: { scope?: string | null } = {},
): Promise<ProjectRule[]> {
  const user = await ensureUser(clerkId)
  return listProjectRules(user.id, options)
}

/** 规则表满了 —— 调用方据此拒，⛔ 不静默丢弃、也不挤掉最老的一条。 */
export class ProjectRuleLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Project rule limit reached (${limit})`)
    this.name = 'ProjectRuleLimitError'
  }
}

/**
 * 记一条规则。
 *
 * ⚠ 上限是一条**真的会拒**的闸：规则会拼进系统提示的一部分，没有上限的规则表
 * 等于一条会无限长的系统提示。撞上限时抛 `ProjectRuleLimitError`，由调用方
 * 翻译成用户读得懂的一句话（工具环那侧是 `ruleLimitReached`）。
 */
export async function addProjectRule(
  userId: string,
  input: CreateProjectRuleInput,
): Promise<ProjectRule> {
  const count = await db.projectRule.count({ where: { userId } })
  if (count >= ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser) {
    throw new ProjectRuleLimitError(ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser)
  }

  const row = await db.projectRule.create({
    data: {
      userId,
      scope: input.scope ?? null,
      text: input.text,
      kind: DB_KIND_BY_ID[input.kind ?? PROJECT_RULE_KIND_IDS.note],
      source: DB_SOURCE_BY_ID[input.source ?? PROJECT_RULE_SOURCE_IDS.creator],
    },
    select: RULE_SELECT,
  })

  const rule = toRule(row)
  /**
   * 刚写进去的一行读不出来 = 词表与库的形状对不上，⛔ 不静默返回一份半成品。
   * 失败大声暴露：这一条只会在有人改了词表却没管存量时出现。
   */
  if (!rule) throw new Error('PROJECT_RULE_UNREADABLE_AFTER_WRITE')
  return rule
}

/** 同上，但从 clerkId 起跳。 */
export async function addProjectRuleForClerkId(
  clerkId: string,
  input: CreateProjectRuleInput,
): Promise<ProjectRule> {
  const user = await ensureUser(clerkId)
  return addProjectRule(user.id, input)
}

/**
 * 删一条。返回 false = 这条规则不属于这个用户（或已经没了）——
 * 路由据此出 404，⛔ 不把「删了别人的」和「什么都没删」混成同一个成功。
 */
export async function deleteProjectRule(
  clerkId: string,
  ruleId: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const { count } = await db.projectRule.deleteMany({
    where: { id: ruleId, userId: user.id },
  })
  return count > 0
}

/**
 * **来源白 / 黑名单**那两种规则（§9.3）。
 *
 * ⚠ 与系统提示那次读**分开一条查询**：那一次按 `maxInPrompt` 截最近 12 条，而
 * 名单一条都不能少 —— 被截掉的那一条在用户眼里仍然是「我设过的闸」，静默失效
 * 的表现是助手照常去打那个站，而用户永远不会知道。
 * ⚠ `scope` 的语义与上面那条逐字同源：该域的 + 全域的。
 */
export async function listProjectSourceRules(
  userId: string,
  options: { scope?: string | null } = {},
): Promise<ProjectRule[]> {
  return listProjectRules(userId, {
    ...options,
    kinds: PROJECT_RULE_SOURCE_KINDS,
    limit: ASSISTANT_PROJECT_RULE_LIMITS.maxPerUser,
  })
}
