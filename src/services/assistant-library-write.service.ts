import 'server-only'

import {
  ASSISTANT_LIBRARY_WRITE_KIND_IDS as KIND,
  ASSISTANT_LIBRARY_WRITE_LIMITS as LIMITS,
  ASSISTANT_SETTINGS_WRITE_KEY_IDS,
  PROJECT_RULE_KIND_IDS,
  PROJECT_RULE_SOURCE_IDS,
  type AssistantSettingsWriteKey,
  type PROJECT_RULE_SOURCE_KINDS,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_AVATAR_CHOICE_IDS,
  ASSISTANT_AVATAR_CHOICES,
  ASSISTANT_PERSONA_ARCHETYPE_PRESETS,
  ASSISTANT_PERSONA_ARCHETYPES,
  ASSISTANT_PERSONA_LANGUAGES,
  ASSISTANT_PERSONA_LIMITS as PERSONA_LIMITS,
  ASSISTANT_PERSONA_PLAN_MODES,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_TONES,
  ASSISTANT_PERSONA_VERBOSITIES,
  ASSISTANT_REASONING_EFFORTS,
  ASSISTANT_ROUTE_MODEL_AUTO,
} from '@/constants/assistant-persona'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { ASSISTANT_V3_CHARACTER_WRITE_PARTS } from '@/constants/assistant-v3'
import { CHARACTER_PERSONA_LIMITS } from '@/constants/cards/character-card'
import { CHARACTER_REVISION_SOURCE_IDS } from '@/constants/cards/character-revision'
import {
  ASSISTANT_MEMORY_KIND_IDS as MEMORY_KIND,
  ASSISTANT_MEMORY_LIMITS as MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS as MEMORY_SCOPE,
  ASSISTANT_MEMORY_SOURCE_IDS as MEMORY_SOURCE,
} from '@/constants/assistant-memory'
import { resolveAdapterType } from '@/constants/models'
import { db } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'
import { appendSlotSources } from '@/hooks/cards/use-character-card-editor'
import { parseTavernExamples } from '@/lib/tavern-card'
import {
  markCharacterRevisionReverted,
  recordCharacterRevision,
  type CharacterRevisionSide,
} from '@/services/cards/character-revision.service'
import {
  createCharacterCard,
  updateCharacterCard,
} from '@/services/cards/character-card.service'
import { readPinnedFields } from '@/services/cards/character-card.mapper'
import {
  createCharacterLook,
  updateCharacterLook,
} from '@/services/cards/character-look.service'
import {
  addAssistantRuleMemory,
  deleteAssistantMemory,
  findAssistantMemoryByRef,
  isSensitiveMemoryText,
  restoreAssistantMemory,
  updateAssistantMemory,
} from '@/services/assistant-memory.service'
import {
  getAssistantPersona,
  upsertAssistantPersona,
} from '@/services/assistant-persona.service'
import {
  addProjectRule,
  listProjectSourceRules,
  ProjectRuleLimitError,
} from '@/services/project-rule.service'
import { createRecipe, updateRecipe } from '@/services/prompts/recipe.service'
import { isOwnedStorageUrl } from '@/services/storage/r2'
import {
  CharacterPersonaSchema,
  CharacterReferenceSlotsSchema,
  type CharacterPersona,
  type CharacterReferenceSlot,
} from '@/types'
import {
  ProjectRuleSourceTokenSchema,
  toAssistantPersonaUpdate,
  UpdateAssistantPersonaSchema,
  withAssistantCharacter,
  type AssistantPersona,
  type ProjectRule,
  type UpdateAssistantPersonaRequest,
} from '@/types/assistant-persona'
import type { AssistantMemory } from '@/types/assistant-memory'
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

export type ProfilePart = (typeof ASSISTANT_V3_CHARACTER_WRITE_PARTS)[number]

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

/**
 * 一格文字落进设定：口头禅一行一句（也认「、」「/」分隔），对话示例按酒馆写法切块（整组替换），
 * 其余原样。「look」不在设定里，调用方另落到默认造型。
 */
function applyPersonaField(
  persona: Partial<CharacterPersona>,
  field: Exclude<ProfilePart, 'look'>,
  text: string,
  name: string,
): void {
  if (field === 'catchphrases') {
    persona.catchphrases = text
      .split(/\n|、|\s\/\s/)
      .map((phrase) => phrase.trim().replace(/^[「『"]|[」』"]$/g, ''))
      .filter(Boolean)
    return
  }
  if (field === 'moods') {
    persona.moods = text
      .split('\n')
      .map((mood) => mood.trim().slice(0, CHARACTER_PERSONA_LIMITS.moodChars))
      .filter(Boolean)
      .slice(0, CHARACTER_PERSONA_LIMITS.moods)
    return
  }
  if (field === 'examples') {
    persona.examples = parseTavernExamples(text, name)
    return
  }
  persona[field] = text
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
  // 钉住的格（第 ② 步，owner 10-30）：你叫助手改也拦下，要改先在角色页取消钉住。
  const pinned = readPinnedFields(card.extensions)
  const blocked = fields
    .map(({ field }) => field)
    .filter((field) => (pinned as readonly string[]).includes(field))
  if (blocked.length)
    return fail(
      `${blocked.join(', ')} of 角色·${card.name} is pinned by the creator, so it cannot be changed. Tell them to unpin it on the character page first.`,
    )

  const before = personaOf(card.persona)
  const persona = { ...before }
  let description: string | undefined
  for (const { field, text } of fields) {
    if (field === 'look') description = text
    else applyPersonaField(persona, field, text, card.name)
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

  // 她改了什么（C）：设置里能看、能撤回。
  const side: CharacterRevisionSide = {
    name: card.name,
    tags: card.tags,
    persona: before,
    look: look ? { lookId: look.id, description: look.description } : null,
  }
  const revisionId = await recordCharacterRevision({
    userId: owner.userId,
    cardId: card.id,
    source: CHARACTER_REVISION_SOURCE_IDS.chat,
    before: side,
    after: {
      name: input.name?.trim() || card.name,
      tags: input.tags ? [...input.tags] : card.tags,
      persona: checked?.success ? checked.data : before,
      look:
        look && description !== undefined
          ? { lookId: look.id, description }
          : side.look,
    },
  })

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
      ...(revisionId ? { revisionId } : {}),
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
    else applyPersonaField(persona, field, text, name)
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

// ---------------------------------------------------------------- 设置（第 4c 步）

/**
 * 渠道按名字或厂商认（`设置` 里列出来的那几条）。⛔ select 里永远不带密文和掩码。
 */
async function findOwnChannel(userId: string, name: string) {
  const rows = await db.userApiKey.findMany({
    where: { userId },
    select: { id: true, label: true, adapterType: true, isActive: true },
    orderBy: { createdAt: 'desc' },
  })
  const wanted = lower(name)
  const exact = rows.filter(
    (row) =>
      row.label.trim().toLowerCase() === wanted ||
      row.adapterType.toLowerCase() === wanted,
  )
  const hits = exact.length
    ? exact
    : rows.filter(
        (row) =>
          row.label.toLowerCase().includes(wanted) ||
          row.adapterType.toLowerCase().includes(wanted),
      )
  if (hits.length === 1) return { ok: true as const, row: hits[0]! }
  const names = (hits.length ? hits : rows).map(
    (row) => `${row.label || row.adapterType} (${row.adapterType})`,
  )
  return {
    ok: false as const,
    error: hits.length
      ? `Several channels match "${name}": ${names.join(', ')}. Use the exact name.`
      : rows.length
        ? `No channel called "${name}". Their channels: ${names.join(', ')}.`
        : 'They have not set up any model channel yet. Adding one (with its key) is done in Settings → API keys.',
  }
}

/** 渠道开 / 关、改名。⛔ key 本身不读不写；⛔ 不删渠道。 */
export async function setChannel(
  owner: LibraryWriteOwner,
  input: { channel: string; on: boolean | null; name: string | null },
): Promise<LibraryWriteOutcome> {
  const name = input.name?.trim().slice(0, LIMITS.maxNameChars) || null
  if (input.on === null && !name)
    return fail(
      'Say whether to switch the channel on or off, or give it a new name.',
    )
  const found = await findOwnChannel(owner.userId, input.channel)
  if (!found.ok) return fail(found.error)
  const { row } = found
  const title = row.label || row.adapterType
  await db.userApiKey.update({
    where: { id: row.id },
    data: {
      ...(input.on === null ? {} : { isActive: input.on }),
      ...(name ? { label: name } : {}),
    },
    select: { id: true },
  })
  const changes = [
    input.on === null ? null : input.on ? 'on' : 'off',
    name ? `→「${name}」` : null,
  ].filter(Boolean)
  return done(
    KIND.channel,
    `渠道·${title} ${changes.join(' ')}`,
    {
      kind: KIND.channel,
      keyId: row.id,
      label: row.label,
      isActive: row.isActive,
    },
    `Channel ${title}: ${changes.join(', ')}. Models on this channel follow it from the next run.`,
  )
}

const SETTING = ASSISTANT_SETTINGS_WRITE_KEY_IDS

function asBoolean(value: string | number | boolean | null): boolean | null {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  if (['true', 'on', 'yes', '1', '开', '打开', 'オン'].includes(text))
    return true
  if (['false', 'off', 'no', '0', '关', '关掉', 'オフ'].includes(text))
    return false
  return null
}

function pickWord<T extends string>(
  words: readonly T[],
  value: string | number | boolean | null,
): T | null {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return (
    words.find((word) => word.toLowerCase() === text) ??
    words.find(
      (word) => word.replace(/([A-Z])/g, '_$1').toLowerCase() === text,
    ) ??
    null
  )
}

const choices = (words: readonly string[]) => words.join(', ')

/** 一格设置 → 改完的整份（翻不出来回一句为什么）。 */
async function applySetting(
  owner: LibraryWriteOwner,
  persona: AssistantPersona,
  key: AssistantSettingsWriteKey,
  value: string | number | boolean | null,
): Promise<
  | { ok: true; next: UpdateAssistantPersonaRequest; shown: string }
  | { ok: false; error: string }
> {
  const base = toAssistantPersonaUpdate(persona)
  const text = typeof value === 'string' ? value.trim() : ''
  const word = <T extends string>(words: readonly T[]) => pickWord(words, value)
  const bad = (expected: string) =>
    ({ ok: false, error: `${key} takes ${expected}.` }) as const
  switch (key) {
    case SETTING.name:
      return {
        ok: true,
        next: {
          ...base,
          name: text.slice(0, PERSONA_LIMITS.maxNameChars) || null,
          nameFromCharacter: false,
        },
        shown: text || '(default)',
      }
    case SETTING.callMe:
      return {
        ok: true,
        next: {
          ...base,
          addressUserAs:
            text.slice(0, PERSONA_LIMITS.maxAddressUserAsChars) || null,
        },
        shown: text || '(account name)',
      }
    case SETTING.tone: {
      if (!text)
        return bad(
          `one of ${choices(ASSISTANT_PERSONA_TONES)} or one short sentence`,
        )
      const preset = word(ASSISTANT_PERSONA_TONES)
      const custom =
        preset === null || preset === ASSISTANT_PERSONA_TONE_IDS.custom
      return {
        ok: true,
        next: {
          ...base,
          tone: custom ? ASSISTANT_PERSONA_TONE_IDS.custom : preset,
          toneCustom: custom
            ? (preset === null ? text : (base.toneCustom ?? '')).slice(
                0,
                PERSONA_LIMITS.maxToneCustomChars,
              ) || null
            : null,
          toneFromCharacter: false,
        },
        shown: text,
      }
    }
    case SETTING.verbosity: {
      const picked = word(ASSISTANT_PERSONA_VERBOSITIES)
      if (!picked)
        return bad(`one of ${choices(ASSISTANT_PERSONA_VERBOSITIES)}`)
      return { ok: true, next: { ...base, verbosity: picked }, shown: picked }
    }
    case SETTING.planMode: {
      const picked = word(ASSISTANT_PERSONA_PLAN_MODES)
      if (!picked) return bad(`one of ${choices(ASSISTANT_PERSONA_PLAN_MODES)}`)
      return { ok: true, next: { ...base, planMode: picked }, shown: picked }
    }
    case SETTING.language: {
      const picked = word(ASSISTANT_PERSONA_LANGUAGES)
      if (!picked) return bad(`one of ${choices(ASSISTANT_PERSONA_LANGUAGES)}`)
      return { ok: true, next: { ...base, language: picked }, shown: picked }
    }
    case SETTING.thinking: {
      const picked = word(ASSISTANT_REASONING_EFFORTS)
      if (!picked) return bad(`one of ${choices(ASSISTANT_REASONING_EFFORTS)}`)
      return {
        ok: true,
        next: { ...base, reasoningEffort: picked },
        shown: picked,
      }
    }
    case SETTING.model: {
      const wanted = text.toLowerCase()
      if (wanted === ASSISTANT_ROUTE_MODEL_AUTO)
        return {
          ok: true,
          next: { ...base, routeModel: ASSISTANT_ROUTE_MODEL_AUTO },
          shown: ASSISTANT_ROUTE_MODEL_AUTO,
        }
      const entry =
        NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
          (model) =>
            model.modelId.toLowerCase() === wanted ||
            model.label.toLowerCase() === wanted,
        ) ??
        NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
          (model) => wanted && model.label.toLowerCase().includes(wanted),
        )
      if (!entry)
        return bad(
          `"auto" or one of ${NODE_STUDIO_ASSISTANT_ROUTE_MODELS.map((model) => model.label).join(', ')}`,
        )
      return {
        ok: true,
        next: { ...base, routeModel: entry.modelId },
        shown: entry.label,
      }
    }
    case SETTING.nextStepHint:
    case SETTING.useMyWords:
    case SETTING.remember:
    case SETTING.nameFromCharacter:
    case SETTING.toneFromCharacter: {
      const on = asBoolean(value)
      if (on === null) return bad('true or false')
      if (
        on &&
        (key === SETTING.nameFromCharacter ||
          key === SETTING.toneFromCharacter) &&
        !base.characterCardId
      )
        return {
          ok: false,
          error: `${key} needs a character first (set "character").`,
        }
      const field = {
        [SETTING.nextStepHint]: 'nextStepHint',
        [SETTING.useMyWords]: 'useMyWords',
        [SETTING.remember]: 'memoryCapture',
        [SETTING.nameFromCharacter]: 'nameFromCharacter',
        [SETTING.toneFromCharacter]: 'toneFromCharacter',
      }[key]
      return {
        ok: true,
        next: { ...base, [field]: on },
        shown: on ? 'on' : 'off',
      }
    }
    case SETTING.character: {
      if (
        !text ||
        ['none', 'null', 'off', '不用', '无'].includes(text.toLowerCase())
      )
        return {
          ok: true,
          next: withAssistantCharacter(persona, null),
          shown: '(none)',
        }
      const card = await findOwnCharacter(
        owner.userId,
        text.replace(/^角色·/, ''),
      )
      if (!card)
        return { ok: false, error: `${text}: not one of their characters.` }
      return {
        ok: true,
        next: withAssistantCharacter(persona, card.id),
        shown: `角色·${card.name}`,
      }
    }
    case SETTING.avatar: {
      const picked = word(ASSISTANT_AVATAR_CHOICES)
      if (!picked) return bad(`one of ${choices(ASSISTANT_AVATAR_CHOICES)}`)
      if (
        picked === ASSISTANT_AVATAR_CHOICE_IDS.character &&
        !base.characterCardId
      )
        return {
          ok: false,
          error:
            'The avatar can follow a character only once one is set ("character").',
        }
      if (
        picked === ASSISTANT_AVATAR_CHOICE_IDS.upload &&
        !persona.uploadedAvatarUrl
      )
        return {
          ok: false,
          error:
            'They have not uploaded an avatar; uploading one is done in Settings → Assistant.',
        }
      return {
        ok: true,
        next: { ...base, avatarChoice: picked },
        shown: picked,
      }
    }
    case SETTING.archetype: {
      const picked = word(ASSISTANT_PERSONA_ARCHETYPES)
      if (!picked) return bad(`one of ${choices(ASSISTANT_PERSONA_ARCHETYPES)}`)
      return {
        ok: true,
        next: {
          ...base,
          ...ASSISTANT_PERSONA_ARCHETYPE_PRESETS[picked],
          archetype: picked,
        },
        shown: picked,
      }
    }
  }
}

/** 助手设置改一格。写走 `upsertAssistantPersona`（三档、语气、角色那几条不变量都在那里）。 */
export async function writeAssistantSetting(
  owner: LibraryWriteOwner,
  input: {
    key: AssistantSettingsWriteKey
    value: string | number | boolean | null
  },
): Promise<LibraryWriteOutcome> {
  const persona = await getAssistantPersona(owner.clerkId)
  const applied = await applySetting(owner, persona, input.key, input.value)
  if (!applied.ok) return fail(applied.error)
  const parsed = UpdateAssistantPersonaSchema.safeParse(applied.next)
  if (!parsed.success)
    return fail(
      `${input.key}: ${parsed.error.issues[0]?.message ?? 'not a valid value'}.`,
    )
  await upsertAssistantPersona(owner.clerkId, parsed.data)
  return done(
    KIND.assistant,
    `设置·助手 ${input.key}：${applied.shown}`,
    { kind: KIND.assistant, before: toAssistantPersonaUpdate(persona) },
    `Assistant setting ${input.key} is now ${applied.shown}. It applies from the creator's next message, not to this turn.`,
  )
}

const LIST_NAMES: Record<(typeof PROJECT_RULE_SOURCE_KINDS)[number], string> = {
  [PROJECT_RULE_KIND_IDS.sourceAllow]: 'allow list',
  [PROJECT_RULE_KIND_IDS.sourceDeny]: 'block list',
}

/** 搜图来源名单加一项（全部台都管）。 */
export async function addSearchSource(
  owner: LibraryWriteOwner,
  input: { site: string; list: (typeof PROJECT_RULE_SOURCE_KINDS)[number] },
): Promise<LibraryWriteOutcome> {
  const token = ProjectRuleSourceTokenSchema.safeParse(input.site)
  if (!token.success)
    return fail(
      `${input.site}: a source list takes one site (a domain like pinterest.com), not a sentence.`,
    )
  const existing = await listProjectSourceRules(owner.userId)
  const same = existing.find((rule) => rule.text === token.data)
  if (same)
    return fail(
      same.kind === input.list
        ? `${token.data} is already on the ${LIST_NAMES[input.list]}.`
        : `${token.data} is on the ${LIST_NAMES[same.kind as typeof input.list]}; take it off that list first.`,
    )
  let rule: ProjectRule
  try {
    rule = await addProjectRule(owner.userId, {
      text: token.data,
      kind: input.list,
      scope: null,
      source: PROJECT_RULE_SOURCE_IDS.assistant,
    })
  } catch (error) {
    if (error instanceof ProjectRuleLimitError)
      return fail(
        `The source lists are full (${error.limit}). One has to come off before a new one fits; do not pick which.`,
      )
    throw error
  }
  return done(
    KIND.sourceAdd,
    `设置·搜图来源 +${rule.text}（${input.list === PROJECT_RULE_KIND_IDS.sourceDeny ? '屏蔽' : '只信'}）`,
    { kind: KIND.sourceAdd, ruleId: rule.id },
    `${rule.text} is on the ${LIST_NAMES[input.list]} for every bench, from the next search on.`,
  )
}

/** 从搜图来源名单拿掉一项（owner 10-23：算普通修改，带撤销）。 */
export async function removeSearchSource(
  owner: LibraryWriteOwner,
  input: { site: string },
): Promise<LibraryWriteOutcome> {
  const token = ProjectRuleSourceTokenSchema.safeParse(input.site)
  const wanted = token.success ? token.data : lower(input.site)
  const rules = await listProjectSourceRules(owner.userId)
  const rule = rules.find((item) => item.text === wanted)
  if (!rule)
    return fail(
      rules.length
        ? `${input.site} is not on their source lists. Listed: ${rules.map((item) => item.text).join(', ')}.`
        : 'Their source lists are empty.',
    )
  const list = rule.kind as (typeof PROJECT_RULE_SOURCE_KINDS)[number]
  await db.projectRule.deleteMany({
    where: { id: rule.id, userId: owner.userId },
  })
  return done(
    KIND.sourceRemove,
    `设置·搜图来源 −${rule.text}`,
    {
      kind: KIND.sourceRemove,
      text: rule.text,
      scope: rule.scope,
      list,
      source: rule.source,
    },
    `${rule.text} is off the ${LIST_NAMES[list]} from the next search on.`,
  )
}

// ---------------------------------------------------------------- 记忆（第 6 步）

/**
 * 记忆写在哪一份（owner 10-23「一个历史记录一份、互不干扰」+「要『关于你』这一层」）：
 * 「关于你」= global，各处都用；角色 = 那个角色自己那份（范围 cards、挂角色）。工作台对话里的事不往外记。
 */
export interface MemoryTarget {
  /** 给了 = 记进这个角色自己那份；null = 「关于你」。 */
  readonly characterCardId: string | null
  /** 画布上记的（没给角色）：记进这个项目自己那份（第 9a 步）。 */
  readonly projectId?: string | null
  /** 过程行与回给模型的话里用的名字（「关于你」/ 角色名）。 */
  readonly label: string
}

const memoryText = (text: string) => text.replace(/\s+/g, ' ').trim()

function memoryRefused(text: string): string | null {
  if (!text) return 'remember needs text: the one line to keep.'
  if (text.length > MEMORY_LIMITS.maxTextChars)
    return `A memory is one line, at most ${MEMORY_LIMITS.maxTextChars} characters. Say it shorter.`
  // 敏感类目（与旧助手同一道闸）：⛔ 不写，也 ⛔ 不在话里复述那一句。
  if (isSensitiveMemoryText(text))
    return 'Not kept: that line looks like private or sensitive information, which you never store. Tell the creator you will not keep it.'
  return null
}

/** 记下一条新的（同一句已经在了就不记第二行，回一句「已经记着」）。 */
export async function rememberMemory(
  owner: LibraryWriteOwner,
  input: {
    text: string
    target: MemoryTarget
    handle: (id: string) => string
    /** 带日子的事到哪天为止（`YYYY-MM-DD`，第 ⑦ 步）；缺席 = 一直成立。 */
    until?: string | null
  },
): Promise<LibraryWriteOutcome> {
  const text = memoryText(input.text)
  const refusedWhy = memoryRefused(text)
  if (refusedWhy) return fail(refusedWhy)
  const { memory, created } = await addAssistantRuleMemory(owner.userId, {
    text,
    scope: input.target.characterCardId
      ? MEMORY_SCOPE.cards
      : input.target.projectId
        ? MEMORY_SCOPE.canvas
        : MEMORY_SCOPE.global,
    characterCardId: input.target.characterCardId,
    projectId: input.target.projectId ?? null,
    kind: MEMORY_KIND.preference,
    until: input.until ?? null,
  })
  if (!created)
    return fail(
      `Already remembered (${input.handle(memory.id)}): "${memory.text}". Nothing to add.`,
    )
  return done(
    KIND.newMemory,
    `记下了（${input.target.label}）：${text}`,
    { kind: KIND.newMemory, memoryId: memory.id },
    `Remembered for ${input.target.label} (${input.handle(memory.id)}). It is in front of you from the next message on.`,
  )
}

type MemoryRef = { idPrefix: string | null; text: string }

async function ownMemory(
  owner: LibraryWriteOwner,
  ref: MemoryRef,
): Promise<
  { ok: true; memory: AssistantMemory } | { ok: false; error: string }
> {
  const found = await findAssistantMemoryByRef(owner.userId, ref)
  if (found.ok) {
    if (found.memory.source === MEMORY_SOURCE.creator)
      return {
        ok: false,
        error: found.memory.characterCardId
          ? "The creator wrote that one themselves. Do not change it; tell them to edit it on the character's page, under Memory."
          : 'The creator wrote that one themselves. Do not change it; tell them to edit it in Settings → Assistant → Memory.',
      }
    return found
  }
  return {
    ok: false,
    error:
      found.reason === 'ambiguous'
        ? 'More than one memory matches. Use its number (记忆·xxxxxxxx); find with kinds ["memories"] lists them.'
        : 'No memory of theirs matches. find with kinds ["memories"] lists what you remember.',
  }
}

/** 按编号改一条（换成新的一句）。 */
export async function editMemory(
  owner: LibraryWriteOwner,
  input: {
    ref: MemoryRef
    text: string
    handle: (id: string) => string
    /** 换一个「到哪天为止」；`null` = 去掉日子；缺席 = 不动。 */
    until?: string | null
  },
): Promise<LibraryWriteOutcome> {
  const text = memoryText(input.text)
  const refusedWhy = memoryRefused(text)
  if (refusedWhy) return fail(refusedWhy)
  const found = await ownMemory(owner, input.ref)
  if (!found.ok) return fail(found.error)
  const before = { id: found.memory.id, text: found.memory.text }
  if (before.text === text && input.until === undefined)
    return fail('That memory already says exactly this.')
  const updated = await updateAssistantMemory(owner.userId, before.id, {
    text,
    ...(input.until !== undefined ? { until: input.until } : {}),
  })
  if (!updated) return fail('That memory is gone.')
  return done(
    KIND.memory,
    `改了记忆：${text}`,
    { kind: KIND.memory, memoryId: before.id, text: before.text },
    `Memory ${input.handle(before.id)} now reads: "${text}".`,
  )
}

/** 忘掉一条（撤销按原样再记回去）。 */
export async function forgetMemory(
  owner: LibraryWriteOwner,
  input: { ref: MemoryRef; handle: (id: string) => string },
): Promise<LibraryWriteOutcome> {
  const found = await ownMemory(owner, input.ref)
  if (!found.ok) return fail(found.error)
  const memory = found.memory
  const deleted = await deleteAssistantMemory(owner.userId, memory.id)
  if (!deleted) return fail('That memory is already gone.')
  return done(
    KIND.forgetMemory,
    `忘掉了：${memory.text}`,
    {
      kind: KIND.forgetMemory,
      text: memory.text,
      scope: memory.scope,
      memoryKind: memory.kind,
      source: memory.source,
      projectId: memory.projectId ?? null,
      characterCardId: memory.characterCardId ?? null,
    },
    `Forgot ${input.handle(memory.id)}: "${memory.text}".`,
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
      if (inverse.revisionId)
        await markCharacterRevisionReverted(userId, inverse.revisionId)
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
    case KIND.channel: {
      const result = await db.userApiKey.updateMany({
        where: { id: inverse.keyId, userId },
        data: { label: inverse.label, isActive: inverse.isActive },
      })
      return reverted(result.count > 0)
    }
    case KIND.assistant: {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { clerkId: true },
      })
      if (!user) return reverted(false)
      // 原来用的角色后来删了：写回会被拒，这一步算撤不回（⛔ 不半写）。
      const ok = await upsertAssistantPersona(
        user.clerkId,
        inverse.before,
      ).then(
        () => true,
        () => false,
      )
      return reverted(ok)
    }
    case KIND.sourceAdd: {
      const result = await db.projectRule.deleteMany({
        where: { id: inverse.ruleId, userId },
      })
      return reverted(result.count > 0)
    }
    case KIND.newMemory:
      return reverted(await deleteAssistantMemory(userId, inverse.memoryId))
    case KIND.memory: {
      const memory = await updateAssistantMemory(userId, inverse.memoryId, {
        text: inverse.text,
      })
      return reverted(memory !== null)
    }
    case KIND.forgetMemory:
      return reverted(
        await restoreAssistantMemory(userId, {
          text: inverse.text,
          scope: inverse.scope,
          kind: inverse.memoryKind,
          source: inverse.source,
          projectId: inverse.projectId,
          characterCardId: inverse.characterCardId,
        }),
      )
    case KIND.sourceRemove: {
      const rules = await listProjectSourceRules(userId)
      if (rules.some((rule) => rule.text === inverse.text))
        return reverted(false)
      const ok = await addProjectRule(userId, {
        text: inverse.text,
        scope: inverse.scope,
        kind: inverse.list,
        source: inverse.source,
      }).then(
        () => true,
        () => false,
      )
      return reverted(ok)
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
