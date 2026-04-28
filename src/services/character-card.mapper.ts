import 'server-only'

import type { Prisma } from '@/lib/generated/prisma/client'
import {
  CharacterAttributesSchema,
  CharacterCardStatusSchema,
  LoraSchema,
  SourceImageEntrySchema,
  type CharacterAttributes,
  type CharacterCardRecord,
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
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined }

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

export function mapCharacterCardRow(row: DbCharacterCardRow): CharacterCardRecord {
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
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

export function serializeCharacterLoras(
  loras: NonNullable<CharacterCardRecord['loras']>,
): Prisma.InputJsonValue {
  return toPrismaJson(loras)
}
