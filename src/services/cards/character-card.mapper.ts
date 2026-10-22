import 'server-only'

import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import type { Prisma } from '@/lib/generated/prisma/client'
import {
  CharacterLookTagsSchema,
  CharacterPersonaSchema,
  CharacterReferenceSlotsSchema,
  type CharacterReferenceSlot,
  type CharacterCardRecord,
  type CharacterLookRecord,
  type CharacterPersona,
  type CharacterVoiceProfile,
} from '@/types'
import { TavernCardKeptSchema, type TavernCardKept } from '@/types/tavern-card'
import { z } from 'zod'

type JsonPrimitive = string | number | boolean | null
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue | undefined }

export interface DbCharacterLookRow {
  id: string
  label: string | null
  isDefault: boolean
  description: string | null
  tags: string[]
  referenceSlots: unknown
}

export interface DbCharacterCardRow {
  id: string
  name: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
  looks: DbCharacterLookRow[]
  _count?: { generationLinks: number }
  handle?: string | null
  persona?: unknown
  extensions?: unknown
  summary?: string | null
}

/** 读卡时一起读造型：默认在前，其余按顺序。所有返回 `CharacterCardRecord` 的查询都用它。 */
export const CHARACTER_LOOKS_INCLUDE = {
  looks: {
    orderBy: [
      { isDefault: 'desc' as const },
      { sortOrder: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  },
}

function parseWithFallback<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallback: T,
): T {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : fallback
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function toPrismaJson<T extends JsonValue>(value: T): Prisma.InputJsonValue {
  return cloneJsonValue(value) as Prisma.InputJsonValue
}

export function serializeReferenceSlots(
  slots: CharacterReferenceSlot[],
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(slots)) as Prisma.InputJsonValue
}

/** 参考槽坏了给空数组，⛔ 不让列表失败。 */
export function readReferenceSlots(value: unknown): CharacterReferenceSlot[] {
  const stored = CharacterReferenceSlotsSchema.safeParse(value)
  return stored.success ? stored.data : []
}

export function mapCharacterLookRow(
  row: DbCharacterLookRow,
): CharacterLookRecord {
  const tags = CharacterLookTagsSchema.safeParse(row.tags)
  return {
    id: row.id,
    label: row.label,
    isDefault: row.isDefault,
    description: row.description,
    tags: tags.success ? tags.data : [],
    referenceSlots: readReferenceSlots(row.referenceSlots),
  }
}

function readTavernKept(extensions: unknown): TavernCardKept | null {
  const value =
    extensions && typeof extensions === 'object'
      ? (extensions as Record<string, unknown>)[TAVERN_CARD.EXTENSION_KEY]
      : undefined
  if (value === undefined) return null
  const parsed = TavernCardKeptSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** 和这个角色聊天时你在故事里是谁；没写 / 不是字符串 = 空串。 */
export function readChatUserRole(extensions: unknown): string {
  const value =
    extensions && typeof extensions === 'object'
      ? (extensions as Record<string, unknown>)[
          CARD_EXTENSIONS.KEYS.chatUserRole
        ]
      : undefined
  return typeof value === 'string' ? value.trim() : ''
}

function readWorkOverride(extensions: unknown): string | null {
  const value =
    extensions && typeof extensions === 'object'
      ? (extensions as Record<string, unknown>)[CARD_EXTENSIONS.KEYS.work]
      : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function mapCharacterCardRow(
  row: DbCharacterCardRow,
): CharacterCardRecord {
  return {
    id: row.id,
    name: row.name,
    tags: row.tags,
    handle: row.handle ?? null,
    looks: row.looks.map(mapCharacterLookRow),
    persona: parseWithFallback(
      CharacterPersonaSchema.nullable(),
      row.persona ?? null,
      null,
    ),
    workOverride: readWorkOverride(row.extensions),
    summary: row.summary ?? null,
    tavern: readTavernKept(row.extensions),
    chatUserRole: readChatUserRole(row.extensions),
    generationCount: row._count?.generationLinks ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * 扩展键袋按键合并：本次给了哪几个键就改哪几个，值为 `null` 的键删掉，
 * ⛔ 其余键（包括认不出的）原样保留 —— 任何服务端路径都不得丢掉它们。
 */
export function mergeCardExtensions(
  existing: unknown,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const merged: Record<string, unknown> =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else merged[key] = value
  }
  return JSON.parse(JSON.stringify(merged)) as Prisma.InputJsonValue
}

/**
 * 角色卡字段 v2 的**透传**序列化（2026-09-17，cards.md「角色卡字段 v2」）。
 *
 * 只做两件事：`undefined` 的键根本不出现在返回值里（Prisma 的「这次不改这一格」），
 * `null` 原样传下去（「清空这一格」）。⛔ 不合并、不补默认、不校验引用存在性——
 * 那些是编译期那一片的事，这里多做一步就成了藏在 service 里的业务规则。
 */
export function serializeCharacterCardV2Fields(input: {
  voiceCardId?: string | null
  voiceProfile?: CharacterVoiceProfile | null
  persona?: CharacterPersona | null
}): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (input.voiceCardId !== undefined) data.voiceCardId = input.voiceCardId
  if (input.voiceProfile !== undefined)
    data.voiceProfile = input.voiceProfile
      ? toPrismaJson(input.voiceProfile)
      : null
  if (input.persona !== undefined)
    data.persona = input.persona ? toPrismaJson(input.persona) : null
  return data
}
