import 'server-only'

import {
  CHARACTER_REVISION_CARD_FIELDS as CARD_FIELD,
  CHARACTER_REVISION_LIMITS,
  CHARACTER_REVISION_SOURCE_IDS,
} from '@/constants/cards'
import { db } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { CharacterPersonaSchema, type CharacterPersona } from '@/types'

/**
 * **她改了什么**（10-26「更像真人」C）：助手每改一次角色卡记一行，只记改到的那几格的前后值；
 * 撤回 = 把那几格的旧值写回去。
 *
 * ⭐ 一格一格撤：撤一条只动它改过的那几格，⛔ 不把整张卡退回当时的样子（之后别的改动保留）。
 * ⚠ 撤回时那一格要是后来又被改过，照样写回旧值 —— 你点撤回就是要那一格回去。
 * ⚠ 锦上添花：记不下只记日志，⛔ 影响改卡本身。
 */

export type CharacterRevisionSource =
  (typeof CHARACTER_REVISION_SOURCE_IDS)[keyof typeof CHARACTER_REVISION_SOURCE_IDS]

/** 一张卡上会被记的那几样：名字、标签、人设、默认造型的「一句外观」。 */
export interface CharacterRevisionSide {
  name: string
  tags: readonly string[]
  persona: CharacterPersona
  look: { lookId: string; description: string | null } | null
}

type FieldValues = Record<string, unknown>

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

/** 两边比一比：哪几格变了、各自前后的值。 */
export function diffCharacterSides(
  before: CharacterRevisionSide,
  after: CharacterRevisionSide,
): { fields: string[]; before: FieldValues; after: FieldValues } {
  const fields: string[] = []
  const was: FieldValues = {}
  const now: FieldValues = {}
  const note = (field: string, from: unknown, to: unknown) => {
    if (same(from, to)) return
    fields.push(field)
    was[field] = from ?? null
    now[field] = to ?? null
  }
  note(CARD_FIELD.name, before.name, after.name)
  note(CARD_FIELD.tags, before.tags, after.tags)
  const keys = new Set([
    ...Object.keys(before.persona),
    ...Object.keys(after.persona),
  ])
  for (const key of keys)
    note(
      key,
      before.persona[key as keyof CharacterPersona],
      after.persona[key as keyof CharacterPersona],
    )
  if (after.look && !same(before.look?.description, after.look.description))
    note(
      CARD_FIELD.look,
      {
        lookId: after.look.lookId,
        description: before.look?.description ?? null,
      },
      after.look,
    )
  return { fields, before: was, after: now }
}

/** 记一笔。什么都没变 → 不记，回 `null`。 */
export async function recordCharacterRevision(input: {
  userId: string
  cardId: string
  source: CharacterRevisionSource
  before: CharacterRevisionSide
  after: CharacterRevisionSide
  reason?: string | null
}): Promise<string | null> {
  const diff = diffCharacterSides(input.before, input.after)
  if (diff.fields.length === 0) return null
  try {
    const row = await db.characterCardRevision.create({
      data: {
        userId: input.userId,
        characterCardId: input.cardId,
        source: input.source,
        fields: diff.fields,
        before: diff.before as Prisma.InputJsonValue,
        after: diff.after as Prisma.InputJsonValue,
        reason:
          input.reason
            ?.trim()
            .slice(0, CHARACTER_REVISION_LIMITS.reasonChars) || null,
      },
      select: { id: true },
    })
    const stale = await db.characterCardRevision.findMany({
      where: { characterCardId: input.cardId },
      orderBy: { createdAt: 'desc' },
      skip: CHARACTER_REVISION_LIMITS.perCard,
      select: { id: true },
    })
    if (stale.length)
      await db.characterCardRevision.deleteMany({
        where: { id: { in: stale.map(({ id }) => id) } },
      })
    return row.id
  } catch (error) {
    logger.warn('Recording character revision failed', {
      cardId: input.cardId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/** 对话里点了撤销（整张卡已退回去了）：这一行标成撤回过。 */
export async function markCharacterRevisionReverted(
  userId: string,
  revisionId: string,
): Promise<void> {
  await db.characterCardRevision.updateMany({
    where: { id: revisionId, userId, revertedAt: null },
    data: { revertedAt: new Date() },
  })
}

/**
 * 撤回一条：把它改过的那几格写回旧值。撤过的、卡已删的、旧值放不回去的 → `false`。
 */
export async function revertCharacterRevision(
  userId: string,
  revisionId: string,
): Promise<boolean> {
  const revision = await db.characterCardRevision.findFirst({
    where: {
      id: revisionId,
      userId,
      revertedAt: null,
      characterCard: { isDeleted: false },
    },
    include: {
      characterCard: { select: { id: true, persona: true } },
    },
  })
  if (!revision) return false
  const before = (revision.before ?? {}) as FieldValues
  const data: Prisma.CharacterCardUpdateInput = { version: { increment: 1 } }
  const personaKeys = revision.fields.filter(
    (field) => !Object.values(CARD_FIELD).includes(field as never),
  )
  if (
    revision.fields.includes(CARD_FIELD.name) &&
    typeof before.name === 'string'
  )
    data.name = before.name
  if (revision.fields.includes(CARD_FIELD.tags) && Array.isArray(before.tags))
    data.tags = before.tags.filter(
      (tag): tag is string => typeof tag === 'string',
    )
  if (personaKeys.length) {
    const current = CharacterPersonaSchema.safeParse(
      revision.characterCard.persona ?? {},
    )
    const restored = CharacterPersonaSchema.safeParse({
      ...(current.success ? current.data : {}),
      ...Object.fromEntries(personaKeys.map((key) => [key, before[key]])),
    })
    if (!restored.success) return false
    data.persona = restored.data as Prisma.InputJsonValue
  }
  const look = before[CARD_FIELD.look] as
    | { lookId?: unknown; description?: unknown }
    | undefined
  await db.$transaction([
    db.characterCard.update({
      where: { id: revision.characterCard.id },
      data,
    }),
    ...(revision.fields.includes(CARD_FIELD.look) &&
    typeof look?.lookId === 'string'
      ? [
          db.characterLook.updateMany({
            where: {
              id: look.lookId,
              characterCardId: revision.characterCard.id,
            },
            data: {
              description:
                typeof look.description === 'string' ? look.description : null,
            },
          }),
        ]
      : []),
    db.characterCardRevision.update({
      where: { id: revision.id },
      data: { revertedAt: new Date() },
    }),
  ])
  return true
}
