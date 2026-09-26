import 'server-only'

import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import { legacyImagesToReferenceSlots } from '@/lib/card-bus'
import type { Prisma } from '@/lib/generated/prisma/client'
import {
  CardTagsSchema,
  CharacterAttributesSchema,
  CharacterPersonaSchema,
  CharacterReferenceSlotsSchema,
  type CardTags,
  type CharacterReferenceSlot,
  CharacterReferenceRolesSchema,
  CharacterCardStatusSchema,
  LoraSchema,
  SourceImageEntrySchema,
  type CharacterAllowedStyleRange,
  type CharacterAttributes,
  type CharacterCardRecord,
  type CharacterPersona,
  type CharacterProvenance,
  type CharacterReferenceRoles,
  type CharacterVoiceProfile,
  type SourceImageEntry,
} from '@/types'
import { z } from 'zod'

const StringArraySchema = z.array(z.string())
const NullableStringArraySchema = StringArraySchema.nullable()
const ModelPromptsSchema = z.record(z.string(), z.string()).nullable()
const NullableAttributesSchema = CharacterAttributesSchema.nullable()
const SourceImageEntriesSchema = z.array(SourceImageEntrySchema)
const NullableLorasSchema = z.array(LoraSchema).max(5).nullable()

type JsonPrimitive = string | number | boolean | null
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue | undefined }

export interface DbCharacterCardRow {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string
  sourceImages: unknown
  sourceImageEntries: unknown
  characterPrompt: string
  modelPrompts: unknown
  referenceImages: unknown
  attributes: unknown
  loras: unknown
  tags: string[]
  status: unknown
  stabilityScore: number | null
  parentId: string | null
  variantLabel: string | null
  createdAt: Date
  updatedAt: Date
  variants?: DbCharacterCardRow[]
  _count?: { generationLinks: number }
  /** 卡片总线 v3 的新列；老的测试夹具与窄 select 里可能没有。 */
  handle?: string | null
  referenceSlots?: unknown
  persona?: unknown
  extensions?: unknown
  referenceRoles?: unknown
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

/**
 * 参考槽 → 旧四列（写方反向双写，卡片页直接改槽时用）。⚠ 读旧列的地方（工作台
 * 卡片区、旧编译器）还在，槽一改旧列必须跟着改，否则两边各说各话。
 * 主图 = `isPrimary` 那一槽；上传来路（或来路未知）进上传列表，精修来路进精修列表；
 * 非身份用途写进用途表。
 */
export function legacyColumnsFromReferenceSlots(
  slots: CharacterReferenceSlot[],
): {
  sourceImageUrl: string
  sourceImages: Prisma.InputJsonValue
  sourceImageEntries: Prisma.InputJsonValue
  referenceImages: Prisma.InputJsonValue
  referenceRoles: Prisma.InputJsonValue
} {
  const primary = slots.find((slot) => slot.isPrimary) ?? slots[0]
  const uploads = slots.filter((slot) => slot.origin !== 'refine')
  const refined = slots.filter((slot) => slot.origin === 'refine')
  const roles = Object.fromEntries(
    slots
      .filter((slot) => slot.role !== 'identity')
      .map((slot) => [slot.url, slot.role]),
  )
  return {
    sourceImageUrl: primary?.url ?? '',
    sourceImages: toPrismaJson(uploads.map((slot) => slot.url)),
    sourceImageEntries: toPrismaJson(
      uploads.map((slot) => ({
        url: slot.url,
        viewType: slot.viewType ?? 'other',
        ...(slot.customLabel ? { label: slot.customLabel } : {}),
      })),
    ),
    referenceImages: toPrismaJson(refined.map((slot) => slot.url)),
    referenceRoles: toPrismaJson(roles),
  }
}

/**
 * 读方切换（卡片总线第 ⑧ 片）：以 `referenceSlots` 为准；空着或坏了就从旧四列现算
 * （与双写、回填同一个函数），两份都不成立时给空数组，⛔ 不让列表失败。
 */
function readReferenceSlots(row: DbCharacterCardRow): CharacterReferenceSlot[] {
  const stored = CharacterReferenceSlotsSchema.safeParse(row.referenceSlots)
  if (stored.success) return stored.data
  const derived = CharacterReferenceSlotsSchema.safeParse(
    referenceSlotsFromCardRow({
      ...row,
      referenceRoles: row.referenceRoles ?? null,
    }),
  )
  return derived.success ? derived.data : []
}

function readCardTags(extensions: unknown): CardTags {
  const value =
    extensions && typeof extensions === 'object'
      ? (extensions as Record<string, unknown>)[CARD_EXTENSIONS.KEYS.tags]
      : undefined
  const parsed = CardTagsSchema.safeParse(value)
  return parsed.success
    ? parsed.data
    : { character: [], appearance: [], loraTrigger: '' }
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
    description: row.description,
    sourceImageUrl: row.sourceImageUrl,
    sourceImages: parseWithFallback(StringArraySchema, row.sourceImages, [
      row.sourceImageUrl,
    ]),
    sourceImageEntries: parseWithFallback(
      SourceImageEntriesSchema,
      row.sourceImageEntries,
      [],
    ),
    characterPrompt: row.characterPrompt,
    modelPrompts: parseWithFallback(ModelPromptsSchema, row.modelPrompts, null),
    referenceImages: parseWithFallback(
      NullableStringArraySchema,
      row.referenceImages,
      null,
    ),
    attributes: parseWithFallback(
      NullableAttributesSchema,
      row.attributes,
      null,
    ),
    loras: parseWithFallback(NullableLorasSchema, row.loras, null),
    tags: row.tags,
    status: parseWithFallback(CharacterCardStatusSchema, row.status, 'DRAFT'),
    stabilityScore: row.stabilityScore,
    parentId: row.parentId,
    variantLabel: row.variantLabel,
    variants: (row.variants ?? []).map(mapCharacterCardRow),
    handle: row.handle ?? null,
    referenceSlots: readReferenceSlots(row),
    persona: parseWithFallback(
      CharacterPersonaSchema.nullable(),
      row.persona ?? null,
      null,
    ),
    cardTags: readCardTags(row.extensions),
    workOverride: readWorkOverride(row.extensions),
    generationCount: row._count?.generationLinks ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * 卡片总线 v3 双写（expand 期）：由一行卡的**旧图列表**算出参考槽，写进
 * `referenceSlots`。本次请求改了哪份旧列表，就用 `overrides` 里的新值替它。
 * ⚠ 读方还没切（第 ⑧ 片），这一格现在只写不读 —— 写它是为了切读那天不需要
 * 再回填一次。
 */
export function referenceSlotsFromCardRow(
  row: {
    sourceImageUrl: string
    sourceImages: unknown
    sourceImageEntries: unknown
    referenceImages: unknown
    referenceRoles: unknown
  },
  overrides: {
    sourceImageEntries?: SourceImageEntry[]
    referenceImages?: string[] | null
    referenceRoles?: CharacterReferenceRoles | null
  } = {},
): Prisma.InputJsonValue {
  return toPrismaJson(
    legacyImagesToReferenceSlots({
      sourceImageUrl: row.sourceImageUrl,
      sourceImages: parseWithFallback(
        NullableStringArraySchema,
        row.sourceImages,
        null,
      ),
      sourceImageEntries:
        overrides.sourceImageEntries ??
        parseWithFallback(SourceImageEntriesSchema, row.sourceImageEntries, []),
      referenceImages:
        overrides.referenceImages !== undefined
          ? overrides.referenceImages
          : parseWithFallback(
              NullableStringArraySchema,
              row.referenceImages,
              null,
            ),
      referenceRoles:
        overrides.referenceRoles !== undefined
          ? overrides.referenceRoles
          : parseWithFallback(
              CharacterReferenceRolesSchema.nullable(),
              row.referenceRoles,
              null,
            ),
    }),
  )
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

export function serializeCharacterAttributes(
  attributes: CharacterAttributes,
): Prisma.InputJsonValue {
  return toPrismaJson(attributes)
}

export function serializeSourceImageEntries(
  entries: SourceImageEntry[],
): Prisma.InputJsonValue {
  return toPrismaJson(entries)
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
  referenceRoles?: CharacterReferenceRoles | null
  allowedStyleRange?: CharacterAllowedStyleRange | null
  provenance?: CharacterProvenance | null
}): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  if (input.voiceCardId !== undefined) data.voiceCardId = input.voiceCardId
  if (input.voiceProfile !== undefined)
    data.voiceProfile = input.voiceProfile
      ? toPrismaJson(input.voiceProfile)
      : null
  if (input.persona !== undefined)
    data.persona = input.persona ? toPrismaJson(input.persona) : null
  if (input.referenceRoles !== undefined)
    data.referenceRoles = input.referenceRoles
      ? toPrismaJson(input.referenceRoles)
      : null
  if (input.allowedStyleRange !== undefined)
    data.allowedStyleRange = input.allowedStyleRange
      ? toPrismaJson(input.allowedStyleRange)
      : null
  if (input.provenance !== undefined)
    data.provenance = input.provenance ? toPrismaJson(input.provenance) : null
  return data
}

export function serializeCharacterLoras(
  loras: NonNullable<CharacterCardRecord['loras']>,
): Prisma.InputJsonValue {
  return toPrismaJson(loras)
}
