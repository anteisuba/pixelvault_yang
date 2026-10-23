import 'server-only'

import {
  ASSISTANT_LIBRARY_WRITE_KIND_IDS as KIND,
  ASSISTANT_LIBRARY_WRITE_LIMITS as LIMITS,
} from '@/constants/assistant-operator'
import { ASSISTANT_V3_CARDS_PROFILE_PARTS } from '@/constants/assistant-v3'
import { resolveAdapterType } from '@/constants/models'
import { db } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'
import { appendSlotSources } from '@/hooks/cards/use-character-card-editor'
import {
  createCharacterCard,
  updateCharacterCard,
} from '@/services/cards/character-card.service'
import {
  createCharacterLook,
  updateCharacterLook,
} from '@/services/cards/character-look.service'
import { createRecipe, updateRecipe } from '@/services/prompts/recipe.service'
import { isOwnedStorageUrl } from '@/services/storage/r2'
import {
  CharacterPersonaSchema,
  CharacterReferenceSlotsSchema,
  type CharacterPersona,
  type CharacterReferenceSlot,
} from '@/types'
import type {
  AssistantAssetWriteRevertResult,
  AssistantLibraryWriteInverse,
  AssistantLibraryWritePayload,
} from '@/types/assistant-operator'

/**
 * **新内核改库**（第 4b 步，owner 10-23「库改动直接写，过程行带撤销；删和公开才问」）。
 *
 * ⭐ 每一种写之前先读原值，写完回 `{ payload, inverse }`：过程行显示 `payload.summary`，
 *   撤销把 `inverse` 原样交回 `revertLibraryWrite`。与素材库四条（`asset-library-write`）同一档。
 * ⭐ 准入一律按 userId 查库：别人的角色、LoRA、提示词一个字都改不了（查不到 = 回一句错）。
 * ⛔ 这里没有删除、没有公开：撤销「新建」只删刚建、之后没人往里放过东西的那一个。
 * ⛔ 不花钱：不出图、不扣 credit、不碰 R2。
 */

export type LibraryWriteOutcome =
  | {
      ok: true
      payload: AssistantLibraryWritePayload
      inverse: AssistantLibraryWriteInverse
      observation: string
    }
  | { ok: false; error: string }

export type ProfilePart = (typeof ASSISTANT_V3_CARDS_PROFILE_PARTS)[number]

export interface LibraryWriteOwner {
  readonly userId: string
  readonly clerkId: string
}

const fail = (error: string): LibraryWriteOutcome => ({ ok: false, error })

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function done(
  kind: AssistantLibraryWritePayload['kind'],
  summary: string,
  inverse: AssistantLibraryWriteInverse,
  observation: string,
): LibraryWriteOutcome {
  return {
    ok: true,
    payload: { kind, summary: clip(summary, LIMITS.maxSummaryChars) },
    inverse,
    observation,
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
}

// ---------------------------------------------------------------- 认东西

const lower = (text: string) => text.trim().toLowerCase().replace(/^@/, '')

/** 角色按名字或 `@handle`（同 `workspace.service` 的读法：先全等、再包含）。 */
export async function findOwnCharacter(userId: string, name: string) {
  const cards = await db.characterCard.findMany({
    where: { userId, isDeleted: false },
    orderBy: { updatedAt: 'desc' },
    include: {
      looks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  })
  const wanted = lower(name)
  return (
    cards.find((card) => card.name.toLowerCase() === wanted) ??
    cards.find((card) => card.handle?.toLowerCase() === wanted) ??
    cards.find((card) => card.name.toLowerCase().includes(wanted)) ??
    null
  )
}

type OwnCharacter = NonNullable<Awaited<ReturnType<typeof findOwnCharacter>>>
type OwnLook = OwnCharacter['looks'][number]

function lookName(look: OwnLook, index: number): string {
  return (
    look.label?.trim() || (look.isDefault ? 'default' : `look ${index + 1}`)
  )
}

function findLook(card: OwnCharacter, name: string | null): OwnLook | null {
  if (!name) return card.looks.find((look) => look.isDefault) ?? null
  const wanted = lower(name)
  const named = card.looks.map((look, index) => ({
    look,
    name: lookName(look, index).toLowerCase(),
  }))
  return (
    named.find((entry) => entry.name === wanted)?.look ??
    named.find((entry) => entry.name.includes(wanted))?.look ??
    null
  )
}

function looksOf(card: OwnCharacter): string {
  return card.looks.map((look, index) => lookName(look, index)).join(', ')
}

/** 她名下的 LoRA（收藏的、自己训的、只被角色收着的）按名字认。 */
async function findOwnLora(userId: string, name: string) {
  const rows = await db.loraAsset.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      styleCode: true,
      inLibrary: true,
      coverImageUrl: true,
    },
  })
  const wanted = lower(name)
  return (
    rows.find((row) => row.name.toLowerCase() === wanted) ??
    rows.find((row) => row.styleCode?.toLowerCase() === wanted) ??
    rows.find((row) => row.name.toLowerCase().includes(wanted)) ??
    null
  )
}

async function findOwnPrompt(userId: string, name: string) {
  const rows = await db.recipe.findMany({
    where: { userId, isDeleted: false },
    orderBy: { updatedAt: 'desc' },
  })
  const wanted = lower(name)
  return (
    rows.find((row) => row.name.toLowerCase() === wanted) ??
    rows.find((row) => row.name.toLowerCase().includes(wanted)) ??
    null
  )
}

// ---------------------------------------------------------------- 角色

export interface ProfileFieldInput {
  readonly field: ProfilePart
  readonly text: string
}

function personaOf(raw: unknown): CharacterPersona {
  const parsed = CharacterPersonaSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : CharacterPersonaSchema.parse({})
}

/**
 * 改设定（owner 10-23「角色设定直接改」）：身份 / 行为 / 说话 / 经历住在设定里，「一句外观」
 * 住在默认造型上（与角色页 `applyProfile` 同一套落法）。名字、标签也能改。
 */
export async function writeCharacterProfile(
  owner: LibraryWriteOwner,
  input: {
    character: string
    name?: string | null
    tags?: readonly string[] | null
    fields?: readonly ProfileFieldInput[] | null
  },
): Promise<LibraryWriteOutcome> {
  const card = await findOwnCharacter(owner.userId, input.character)
  if (!card) return fail(`${input.character}: no such character of theirs.`)
  const fields = input.fields ?? []
  if (!input.name && !input.tags && fields.length === 0)
    return fail('character needs fields, name or tags.')

  const before = personaOf(card.persona)
  const persona = { ...before }
  let description: string | undefined
  for (const { field, text } of fields) {
    if (field === 'look') description = text
    else persona[field] = text
  }
  const personaChanged = fields.some(({ field }) => field !== 'look')
  const checked = personaChanged
    ? CharacterPersonaSchema.safeParse(persona)
    : null
  if (checked && !checked.success)
    return fail(`Settings too long: ${checked.error.issues[0]?.message ?? ''}`)

  const look = description !== undefined ? findLook(card, null) : null
  if (description !== undefined && !look)
    return fail(`${card.name} has no default look to hold the appearance.`)

  const updated = await updateCharacterCard(owner.clerkId, card.id, {
    ...(input.name ? { name: input.name.trim() } : {}),
    ...(input.tags ? { tags: [...input.tags] } : {}),
    ...(checked?.success ? { persona: checked.data } : {}),
  })
  if (!updated) return fail(`${card.name} could not be changed.`)
  if (look && description !== undefined)
    await updateCharacterLook(owner.clerkId, look.id, { description })

  const changed = [
    ...(input.name ? ['name'] : []),
    ...(input.tags ? ['tags'] : []),
    ...fields.map(({ field }) => field),
  ]
  return done(
    KIND.character,
    `角色·${card.name}: ${changed.join(', ')}`,
    {
      kind: KIND.character,
      characterId: card.id,
      name: card.name,
      tags: card.tags,
      persona: card.persona ?? null,
      look: look ? { lookId: look.id, description: look.description } : null,
    },
    `Changed ${changed.join(', ')} of 角色·${input.name?.trim() || card.name}. It is saved in their library.`,
  )
}

export async function createCharacter(
  owner: LibraryWriteOwner,
  input: {
    name: string
    tags?: readonly string[] | null
    fields?: readonly ProfileFieldInput[] | null
  },
): Promise<LibraryWriteOutcome> {
  const name = input.name.trim()
  if (!name) return fail('new_character needs name.')
  if (
    await findOwnCharacter(owner.userId, name).then(
      (card) => card?.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return fail(`角色·${name} already exists; change it with character.`)
  const persona: Partial<CharacterPersona> = {}
  let description: string | undefined
  for (const { field, text } of input.fields ?? []) {
    if (field === 'look') description = text
    else persona[field] = text
  }
  const checked = CharacterPersonaSchema.safeParse(persona)
  if (!checked.success)
    return fail(`Settings too long: ${checked.error.issues[0]?.message ?? ''}`)
  const created = await createCharacterCard(owner.clerkId, {
    name,
    ...(description ? { description } : {}),
    ...(input.tags ? { tags: [...input.tags] } : {}),
    ...(Object.keys(persona).length ? { persona: checked.data } : {}),
  })
  return done(
    KIND.newCharacter,
    `角色·${created.name}`,
    { kind: KIND.newCharacter, characterId: created.id },
    `Created 角色·${created.name} with a default look.`,
  )
}

// ---------------------------------------------------------------- 造型

export interface LookInput {
  readonly character: string
  readonly look?: string | null
  readonly label?: string | null
  readonly text?: string | null
  readonly tags?: readonly string[] | null
  /** 追加到这套造型的图（地址 + generationId，已按 userId 认过）。 */
  readonly pictures?: readonly { url: string; generationId: string }[] | null
}

function withPictures(
  current: unknown,
  pictures: LookInput['pictures'],
): CharacterReferenceSlot[] | undefined {
  if (!pictures?.length) return undefined
  const parsed = CharacterReferenceSlotsSchema.safeParse(current)
  const slots = parsed.success ? parsed.data : []
  return appendSlotSources(
    slots,
    pictures.map((picture) => ({
      url: picture.url,
      generationId: picture.generationId,
      origin: 'generation' as const,
    })),
  )
}

export async function writeLook(
  owner: LibraryWriteOwner,
  input: LookInput,
): Promise<LibraryWriteOutcome> {
  const card = await findOwnCharacter(owner.userId, input.character)
  if (!card) return fail(`${input.character}: no such character of theirs.`)
  const look = findLook(card, input.look ?? null)
  if (!look)
    return fail(
      `${card.name} has no look called "${input.look}". Looks: ${looksOf(card)}.`,
    )
  const slots = withPictures(look.referenceSlots, input.pictures)
  if (
    input.label === undefined &&
    input.text === undefined &&
    !input.tags &&
    !slots
  )
    return fail('look needs label, text, tags or pictures.')
  await updateCharacterLook(owner.clerkId, look.id, {
    ...(input.label !== undefined && input.label !== null
      ? { label: input.label }
      : {}),
    ...(input.text !== undefined && input.text !== null
      ? { description: input.text }
      : {}),
    ...(input.tags ? { tags: [...input.tags] } : {}),
    ...(slots ? { referenceSlots: slots } : {}),
  })
  const index = card.looks.indexOf(look)
  const added = slots
    ? slots.length -
      (CharacterReferenceSlotsSchema.safeParse(look.referenceSlots).data
        ?.length ?? 0)
    : 0
  return done(
    KIND.look,
    `角色·${card.name}/${lookName(look, index)}${added ? ` +${added}` : ''}`,
    {
      kind: KIND.look,
      lookId: look.id,
      label: look.label,
      description: look.description,
      tags: look.tags,
      referenceSlots: look.referenceSlots ?? [],
    },
    `Changed the look 角色·${card.name}/${lookName(look, index)}${slots ? ` (${added} picture(s) added; ones already on it were skipped)` : ''}.`,
  )
}

export async function createLook(
  owner: LibraryWriteOwner,
  input: LookInput,
): Promise<LibraryWriteOutcome> {
  const label = input.label?.trim()
  if (!label) return fail('new_look needs label.')
  const card = await findOwnCharacter(owner.userId, input.character)
  if (!card) return fail(`${input.character}: no such character of theirs.`)
  if (
    findLook(card, label)?.label?.trim().toLowerCase() === label.toLowerCase()
  )
    return fail(
      `${card.name} already has the look "${label}"; change it with look.`,
    )
  const updated = await createCharacterLook(owner.clerkId, card.id, { label })
  const created = updated.looks.find(
    (look) => !card.looks.some((old) => old.id === look.id),
  )
  if (!created?.id) return fail(`The look could not be added to ${card.name}.`)
  const slots = withPictures([], input.pictures)
  if (input.text || input.tags || slots)
    await updateCharacterLook(owner.clerkId, created.id, {
      ...(input.text ? { description: input.text } : {}),
      ...(input.tags ? { tags: [...input.tags] } : {}),
      ...(slots ? { referenceSlots: slots } : {}),
    })
  return done(
    KIND.newLook,
    `角色·${card.name}/${label}`,
    { kind: KIND.newLook, lookId: created.id },
    `Added the look 角色·${card.name}/${label}.`,
  )
}

// ---------------------------------------------------------------- LoRA

export async function linkLoraToCharacter(
  owner: LibraryWriteOwner,
  input: { lora: string; character: string; look?: string | null },
): Promise<LibraryWriteOutcome> {
  const lora = await findOwnLora(owner.userId, input.lora)
  if (!lora)
    return fail(
      `${input.lora}: not in their LoRA library. Favourite it first (find kinds ["loras"] shows the library).`,
    )
  const card = await findOwnCharacter(owner.userId, input.character)
  if (!card) return fail(`${input.character}: no such character of theirs.`)
  const look = input.look ? findLook(card, input.look) : null
  if (input.look && !look)
    return fail(
      `${card.name} has no look called "${input.look}". Looks: ${looksOf(card)}.`,
    )
  const existing = await db.characterCardLora.findUnique({
    where: {
      characterCardId_loraAssetId: {
        characterCardId: card.id,
        loraAssetId: lora.id,
      },
    },
  })
  const lookId = look?.id ?? null
  if (existing && existing.lookId === lookId)
    return fail(`角色·${card.name} already has LoRA·${lora.name}.`)
  await db.characterCardLora.upsert({
    where: {
      characterCardId_loraAssetId: {
        characterCardId: card.id,
        loraAssetId: lora.id,
      },
    },
    create: { characterCardId: card.id, loraAssetId: lora.id, lookId },
    update: { lookId },
  })
  const where = look
    ? `角色·${card.name}/${lookName(look, card.looks.indexOf(look))}`
    : `角色·${card.name}`
  return done(
    KIND.loraToCharacter,
    `LoRA·${lora.name} → ${where}`,
    {
      kind: KIND.loraToCharacter,
      characterId: card.id,
      loraAssetId: lora.id,
      existed: Boolean(existing),
      lookId: existing?.lookId ?? null,
    },
    `Added LoRA·${lora.name} to ${where}.`,
  )
}

export async function favoriteLora(
  owner: LibraryWriteOwner,
  input: { lora: string; value: boolean },
): Promise<LibraryWriteOutcome> {
  const lora = await findOwnLora(owner.userId, input.lora)
  if (!lora)
    return fail(
      `${input.lora}: not one of their LoRAs. A LoRA from Civitai is favourited from the LoRA library page.`,
    )
  if (lora.inLibrary === input.value)
    return fail(
      `LoRA·${lora.name} is already ${input.value ? 'in' : 'out of'} their favourites.`,
    )
  await db.loraAsset.update({
    where: { id: lora.id },
    data: { inLibrary: input.value },
  })
  return done(
    KIND.favoriteLora,
    `LoRA·${lora.name} ${input.value ? '★' : '☆'}`,
    {
      kind: KIND.favoriteLora,
      loraAssetId: lora.id,
      inLibrary: lora.inLibrary,
    },
    `${input.value ? 'Favourited' : 'Took out of favourites'} LoRA·${lora.name}.`,
  )
}

export async function setLoraCover(
  owner: LibraryWriteOwner,
  input: { lora: string; url: string },
): Promise<LibraryWriteOutcome> {
  const lora = await findOwnLora(owner.userId, input.lora)
  if (!lora) return fail(`${input.lora}: not one of their LoRAs.`)
  if (!isOwnedStorageUrl(input.url))
    return fail('The cover must be one of their own pictures (图_N).')
  await db.loraAsset.update({
    where: { id: lora.id },
    data: { coverImageUrl: input.url },
  })
  return done(
    KIND.loraCover,
    `LoRA·${lora.name}`,
    {
      kind: KIND.loraCover,
      loraAssetId: lora.id,
      coverImageUrl: lora.coverImageUrl,
    },
    `Changed the cover of LoRA·${lora.name}.`,
  )
}

// ---------------------------------------------------------------- 提示词库

export async function savePrompt(
  owner: LibraryWriteOwner,
  input: {
    name: string
    prompt: string
    negative: string | null
    modelId: string | null
    params?: Record<string, unknown>
  },
): Promise<LibraryWriteOutcome> {
  const name = input.name.trim()
  if (!name) return fail('save_prompt needs name.')
  if (!input.prompt.trim()) return fail('There is no prompt to save.')
  const provider = input.modelId ? resolveAdapterType(input.modelId) : null
  if (!input.modelId || !provider)
    return fail(
      'Pick a model on the bench first: a saved prompt keeps its model.',
    )
  if (
    await findOwnPrompt(owner.userId, name).then(
      (row) => row?.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return fail(`提示词·${name} already exists; change it with update_prompt.`)
  const recipe = await createRecipe(owner.clerkId, {
    name,
    outputType: 'IMAGE',
    compiledPrompt: input.prompt,
    ...(input.negative ? { negativePrompt: input.negative } : {}),
    modelId: input.modelId,
    provider,
    ...(input.params ? { params: input.params } : {}),
  })
  return done(
    KIND.savePrompt,
    `提示词·${recipe.name}`,
    { kind: KIND.savePrompt, recipeId: recipe.id },
    `Saved 提示词·${recipe.name} to their prompt library.`,
  )
}

export async function updatePrompt(
  owner: LibraryWriteOwner,
  input: {
    prompt: string
    name?: string | null
    text?: string | null
    negative?: string | null
  },
): Promise<LibraryWriteOutcome> {
  const row = await findOwnPrompt(owner.userId, input.prompt)
  if (!row) return fail(`${input.prompt}: no such saved prompt of theirs.`)
  if (!input.name && input.text == null && input.negative == null)
    return fail('update_prompt needs name, text or negative.')
  const updated = await updateRecipe(owner.clerkId, row.id, {
    name: input.name?.trim() || row.name,
    outputType: row.outputType,
    compiledPrompt: input.text ?? row.compiledPrompt,
    ...((input.negative ?? row.negativePrompt)
      ? { negativePrompt: input.negative ?? row.negativePrompt ?? undefined }
      : {}),
    modelId: row.modelId,
    provider: row.provider,
    ...(row.params && typeof row.params === 'object'
      ? { params: row.params as Record<string, unknown> }
      : {}),
    ...(row.parentGenerationId
      ? { parentGenerationId: row.parentGenerationId }
      : {}),
  })
  if (!updated) return fail(`提示词·${row.name} could not be changed.`)
  return done(
    KIND.updatePrompt,
    `提示词·${updated.name}`,
    {
      kind: KIND.updatePrompt,
      recipeId: row.id,
      name: row.name,
      compiledPrompt: row.compiledPrompt,
      negativePrompt: row.negativePrompt,
    },
    `Changed 提示词·${updated.name}.`,
  )
}

// ---------------------------------------------------------------- 撤销

const reverted = (ok: boolean): AssistantAssetWriteRevertResult => ({
  revertedCount: ok ? 1 : 0,
  skipped: ok ? 0 : 1,
})

/**
 * 撤销一条改库：把 `inverse` 里的原值写回去。⛔ 不重算原值（撤销与应用是同一份判据的两侧）。
 * 新建的那几种只删「之后没人往里放过东西」的那一个，否则跳过（`skipped: 1`）。
 */
export async function revertLibraryWrite(
  userId: string,
  inverse: AssistantLibraryWriteInverse,
): Promise<AssistantAssetWriteRevertResult> {
  switch (inverse.kind) {
    case KIND.character: {
      const card = await db.characterCard.findFirst({
        where: { id: inverse.characterId, userId, isDeleted: false },
        select: { id: true },
      })
      if (!card) return reverted(false)
      await db.characterCard.update({
        where: { id: card.id },
        data: {
          name: inverse.name,
          tags: inverse.tags,
          persona:
            inverse.persona === null ? Prisma.DbNull : toJson(inverse.persona),
          version: { increment: 1 },
        },
      })
      if (inverse.look)
        await db.characterLook.updateMany({
          where: { id: inverse.look.lookId, characterCardId: card.id },
          data: { description: inverse.look.description },
        })
      return reverted(true)
    }
    case KIND.newCharacter: {
      const card = await db.characterCard.findFirst({
        where: { id: inverse.characterId, userId, isDeleted: false },
        include: {
          _count: { select: { generationLinks: true, loraLinks: true } },
        },
      })
      if (!card || card._count.generationLinks + card._count.loraLinks > 0)
        return reverted(false)
      await db.characterCard.update({
        where: { id: card.id },
        data: { isDeleted: true },
      })
      return reverted(true)
    }
    case KIND.look: {
      const look = await db.characterLook.findFirst({
        where: { id: inverse.lookId, characterCard: { userId } },
        select: { id: true, characterCardId: true },
      })
      if (!look) return reverted(false)
      await db.characterLook.update({
        where: { id: look.id },
        data: {
          label: inverse.label,
          description: inverse.description,
          tags: inverse.tags,
          referenceSlots: toJson(inverse.referenceSlots),
        },
      })
      await db.characterCard.update({
        where: { id: look.characterCardId },
        data: { version: { increment: 1 } },
      })
      return reverted(true)
    }
    case KIND.newLook: {
      const look = await db.characterLook.findFirst({
        where: { id: inverse.lookId, characterCard: { userId } },
        include: {
          _count: { select: { generationLinks: true, loraLinks: true } },
        },
      })
      if (
        !look ||
        look.isDefault ||
        look._count.generationLinks + look._count.loraLinks > 0
      )
        return reverted(false)
      await db.characterLook.delete({ where: { id: look.id } })
      return reverted(true)
    }
    case KIND.loraToCharacter: {
      const card = await db.characterCard.findFirst({
        where: { id: inverse.characterId, userId },
        select: { id: true },
      })
      if (!card) return reverted(false)
      const key = {
        characterCardId_loraAssetId: {
          characterCardId: card.id,
          loraAssetId: inverse.loraAssetId,
        },
      }
      if (inverse.existed)
        await db.characterCardLora.update({
          where: key,
          data: { lookId: inverse.lookId },
        })
      else await db.characterCardLora.delete({ where: key })
      return reverted(true)
    }
    case KIND.favoriteLora: {
      const result = await db.loraAsset.updateMany({
        where: { id: inverse.loraAssetId, userId },
        data: { inLibrary: inverse.inLibrary },
      })
      return reverted(result.count > 0)
    }
    case KIND.loraCover: {
      const result = await db.loraAsset.updateMany({
        where: { id: inverse.loraAssetId, userId },
        data: { coverImageUrl: inverse.coverImageUrl },
      })
      return reverted(result.count > 0)
    }
    case KIND.savePrompt: {
      const result = await db.recipe.updateMany({
        where: { id: inverse.recipeId, userId, isDeleted: false },
        data: { isDeleted: true },
      })
      return reverted(result.count > 0)
    }
    case KIND.updatePrompt: {
      const result = await db.recipe.updateMany({
        where: { id: inverse.recipeId, userId, isDeleted: false },
        data: {
          name: inverse.name,
          compiledPrompt: inverse.compiledPrompt,
          negativePrompt: inverse.negativePrompt,
        },
      })
      return reverted(result.count > 0)
    }
  }
}

// ---------------------------------------------------------------- 素材文件夹（认名字）

/** 素材文件夹按名字认（`put_in_folder` / `new_folder` 的上级）。重名回一句让模型说清是哪一个。 */
export async function findOwnFolder(
  userId: string,
  name: string,
): Promise<
  { ok: true; id: string; name: string } | { ok: false; error: string }
> {
  const rows = await db.project.findMany({
    where: { userId, isDeleted: false },
    select: { id: true, name: true },
  })
  const wanted = lower(name)
  const exact = rows.filter((row) => row.name.trim().toLowerCase() === wanted)
  const hits = exact.length
    ? exact
    : rows.filter((row) => row.name.toLowerCase().includes(wanted))
  if (hits.length === 1) return { ok: true, ...hits[0]! }
  if (hits.length === 0)
    return {
      ok: false,
      error: `No folder called "${name}". Make it with new_folder first, or use one of: ${rows
        .slice(0, 20)
        .map((row) => row.name)
        .join(', ')}.`,
    }
  return {
    ok: false,
    error: `Several folders match "${name}": ${hits.map((row) => row.name).join(', ')}. Use the exact name.`,
  }
}
