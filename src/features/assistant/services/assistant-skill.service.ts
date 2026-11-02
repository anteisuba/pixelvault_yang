import 'server-only'

import { ASSISTANT_SKILL_LIMITS as LIMITS } from '@/constants/assistant-skills'
import { db } from '@/lib/db'
import type {
  AssistantSkillView,
  CreateAssistantSkillRequest,
  UpdateAssistantSkillRequest,
  UpdateBuiltinSkillRequest,
} from '@/types/assistant-skill'
import { ensureUser } from '@/services/user.service'
import {
  BUILTIN_SKILLS,
  findSkill,
  resolveSkills,
  type AssistantSkill,
  type AssistantSkillRow,
} from '@/features/assistant/skills'

/**
 * 「你的技能」（第 7b 步，owner 10-23）：每人一份，只有本人读得到、只进本人的助手。
 *
 * ⭐ 一律按 `userId` 收敛：别人的那几行查不到、改不了（改 / 删回 null，路由出 404）。
 * ⭐ 内置的不进表；你「改成我的版本」或关掉一份内置的，才在表里多一行（`builtinSlug`）。
 *   删掉那一行 = 回到内置原样。
 */

export type AssistantSkillErrorCode = 'limit' | 'nameTaken' | 'unknownBuiltin'

export class AssistantSkillError extends Error {
  constructor(readonly code: AssistantSkillErrorCode) {
    super(`assistant skill: ${code}`)
  }
}

const SKILL_SELECT = {
  id: true,
  name: true,
  description: true,
  body: true,
  references: true,
  builtinSlug: true,
  enabled: true,
} as const

type SkillRecord = {
  id: string
  name: string
  description: string
  body: string | null
  references: unknown
  builtinSlug: string | null
  enabled: boolean
}

function referencesOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function toRow(record: SkillRecord): AssistantSkillRow {
  return { ...record, references: referencesOf(record.references) }
}

async function rowsOf(userId: string): Promise<AssistantSkillRow[]> {
  const records = await db.assistantSkill.findMany({
    where: { userId },
    select: SKILL_SELECT,
    orderBy: { createdAt: 'asc' },
  })
  return records.map(toRow)
}

/** 这个人眼前的一整套（助手每一轮用它）。读不出来就只有内置的 —— ⛔ 掀翻这一轮。 */
export async function loadAssistantSkills(
  userId: string,
): Promise<AssistantSkill[]> {
  return resolveSkills(await rowsOf(userId))
}

function viewsOf(rows: readonly AssistantSkillRow[]): AssistantSkillView[] {
  const idBySlug = new Map(
    rows.flatMap((row) => (row.builtinSlug ? [[row.builtinSlug, row.id]] : [])),
  )
  const mine = rows.filter((row) => !row.builtinSlug)
  return resolveSkills(rows).map((skill) => ({
    id:
      skill.origin === 'mine'
        ? (mine.find((row) => row.name === skill.name)?.id ?? null)
        : (idBySlug.get(skill.slug) ?? null),
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    body: skill.body,
    references: { ...skill.references },
    origin: skill.origin,
    enabled: skill.enabled,
    autoRead: skill.autoRead,
  }))
}

export async function listAssistantSkillsForClerkId(
  clerkId: string,
): Promise<AssistantSkillView[]> {
  const user = await ensureUser(clerkId)
  return viewsOf(await rowsOf(user.id))
}

/** 名字不能和内置的、也不能和自己已有的撞（`技能·名字` / `/名字` 要认得出是哪一份）。 */
async function assertNameFree(
  userId: string,
  name: string,
  exceptId: string | null,
) {
  if (findSkill(name, BUILTIN_SKILLS))
    throw new AssistantSkillError('nameTaken')
  const same = await db.assistantSkill.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      builtinSlug: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  })
  if (same) throw new AssistantSkillError('nameTaken')
}

async function assertRoom(userId: string) {
  const count = await db.assistantSkill.count({ where: { userId } })
  if (count >= LIMITS.maxSkills) throw new AssistantSkillError('limit')
}

export async function createAssistantSkillForClerkId(
  clerkId: string,
  input: CreateAssistantSkillRequest,
): Promise<AssistantSkillView[]> {
  const user = await ensureUser(clerkId)
  await assertRoom(user.id)
  await assertNameFree(user.id, input.name, null)
  await db.assistantSkill.create({
    data: {
      userId: user.id,
      name: input.name,
      description: input.description,
      body: input.body,
    },
  })
  return viewsOf(await rowsOf(user.id))
}

/** 改你自己写的那份、或你那份内置改版；不是你的回 null。 */
export async function updateAssistantSkillForClerkId(
  clerkId: string,
  id: string,
  input: UpdateAssistantSkillRequest,
): Promise<AssistantSkillView[] | null> {
  const user = await ensureUser(clerkId)
  const row = await db.assistantSkill.findFirst({
    where: { id, userId: user.id },
    select: { id: true, builtinSlug: true },
  })
  if (!row) return null
  // 内置改版的名字跟着内置走，⛔ 改名。
  if (input.name !== undefined && !row.builtinSlug)
    await assertNameFree(user.id, input.name, row.id)
  await db.assistantSkill.update({
    where: { id: row.id },
    data: {
      ...(input.name !== undefined && !row.builtinSlug
        ? { name: input.name }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  })
  return viewsOf(await rowsOf(user.id))
}

/** 删你自己写的那份；删内置改版那一行 = 回到内置原样。不是你的回 false（404）。 */
export async function deleteAssistantSkillForClerkId(
  clerkId: string,
  id: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const deleted = await db.assistantSkill.deleteMany({
    where: { id, userId: user.id },
  })
  return deleted.count > 0
}

/**
 * 内置那一份：开 / 关，或「改成我的版本」（给 body）。表里没有那一行就新建：
 * 只关不改的那一行 `body` 为空（读到的仍是内置原文）。
 */
export async function updateBuiltinSkillForClerkId(
  clerkId: string,
  input: UpdateBuiltinSkillRequest,
): Promise<AssistantSkillView[]> {
  const user = await ensureUser(clerkId)
  const builtin = BUILTIN_SKILLS.find((skill) => skill.slug === input.slug)
  if (!builtin) throw new AssistantSkillError('unknownBuiltin')
  const existing = await db.assistantSkill.findFirst({
    where: { userId: user.id, builtinSlug: builtin.slug },
    select: { id: true },
  })
  const content =
    input.body !== undefined
      ? {
          body: input.body,
          description: input.description ?? builtin.description,
          references: { ...builtin.references },
        }
      : {}
  if (existing) {
    await db.assistantSkill.update({
      where: { id: existing.id },
      data: {
        ...content,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    })
  } else {
    await assertRoom(user.id)
    await db.assistantSkill.create({
      data: {
        userId: user.id,
        name: builtin.name,
        description: builtin.description,
        builtinSlug: builtin.slug,
        ...content,
        enabled: input.enabled ?? true,
      },
    })
  }
  return viewsOf(await rowsOf(user.id))
}
