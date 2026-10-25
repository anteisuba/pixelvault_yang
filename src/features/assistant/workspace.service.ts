import 'server-only'

import { Prisma } from '@/lib/generated/prisma/client'

import {
  ASSISTANT_SETTINGS_WRITE_KEY_IDS,
  PROJECT_RULE_KIND_IDS,
} from '@/constants/assistant-operator'
import { GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE } from '@/constants/generation-naming'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { buildAssetRecipeText } from '@/lib/asset-recipe-text'
import { db } from '@/lib/db'
import { buildGenerationTag } from '@/lib/generation-name'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type { AssistantV3PictureRef } from '@/types/assistant-v3'
import { getAssistantPersona } from '@/services/assistant-persona.service'
import { listCharacterCards } from '@/services/cards/character-card.service'
import { listCharacterLoraGroups } from '@/services/cards/character-lora.service'
import {
  findLoraAssetsByUrls,
  listLoraAssetsForUser,
} from '@/services/lora-asset.service'
import { listProjectSourceRules } from '@/services/project-rule.service'
import { listRecipeSummaries } from '@/services/prompts/recipe.service'
import {
  ASSISTANT_NEXT_FIND_KIND_IDS as KIND,
  ASSISTANT_NEXT_FIND_LIMITS as LIMITS,
  ASSISTANT_NEXT_HANDLE_PREFIXES as PREFIX,
  type AssistantNextFindKind,
} from '@/features/assistant/constants'
import { BUILTIN_SKILLS, renderSkill } from '@/features/assistant/skills'
import { loadAssistantSkills } from '@/services/assistant-skill.service'

/**
 * 工作区编号与「查 / 看」（第 3 步，方案 /mnt/project-files/assistant-reliability/step3-plan.md）。
 *
 * ⭐ 编号只给模型用（10-23 用户定）：每样东西一个人能读的编号 —— 图沿用库里每人递增的序号
 *   （`图_1624`，与 @ 选择器同一套），角色 / LoRA / 提示词用名字，对话用 id 的前 8 位。模型拿
 *   编号去 look、去 edit add_reference；界面上把编号换成缩略图是第 9 步的事。
 * ⭐ 只读，全部按 `userId` 收敛：别人的东西查不到也打不开。API key ⛔ 不读（设置只说配了哪些渠道）。
 * ⚠ 列表口没有全文检索的那几类（角色、LoRA、提示词）取最近 `listScan` 条在内存里筛。
 */

export type WorkspaceHandle =
  | { kind: 'picture'; serial: number; prefix: string }
  | { kind: 'character'; name: string; look: string | null }
  | { kind: 'lora'; name: string }
  | { kind: 'prompt'; name: string }
  | { kind: 'conversation'; id: string }
  | { kind: 'skill'; name: string }
  | { kind: 'settings' }

export interface WorkspaceOwner {
  readonly userId: string
  readonly clerkId: string
  /** 隐身：不翻以前的对话与记忆。 */
  readonly incognito: boolean
}

/** 打开 / 查到的一张图：模型眼前那张的称呼就是它的编号。挂参考图要 `generationId`。 */
export interface WorkspacePicture extends AssistantV3PictureRef {
  readonly generationId?: string
}

export interface WorkspaceRead {
  readonly text: string
  readonly pictures: readonly WorkspacePicture[]
}

const PICTURE_PREFIXES = Object.values(GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE)
const OUTPUT_TYPE_BY_PREFIX = Object.fromEntries(
  Object.entries(GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE).map(
    ([type, prefix]) => [prefix, type],
  ),
) as Record<string, keyof typeof GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE>
const PICTURE_HANDLE = new RegExp(
  `^@?(${PICTURE_PREFIXES.join('|')})_(\\d{1,7})(?:\\s*[·・].*)?$`,
)

const SURFACE_LABELS: Record<string, string> = {
  IMAGE_STUDIO: 'image bench',
  VIDEO_STUDIO: 'video bench',
  LORA: 'LoRA bench',
  NODE_CANVAS: 'canvas',
  CARDS: 'character page',
}

/** 认得出的编号 → 是哪一类；认不出（`ref-1`、`result-1`、附图的名字…）回 null，交给台上那一套。 */
export function parseWorkspaceHandle(raw: string): WorkspaceHandle | null {
  const text = raw.trim()
  const picture = PICTURE_HANDLE.exec(text)
  if (picture)
    return {
      kind: 'picture',
      prefix: picture[1]!,
      serial: Number(picture[2]),
    }
  const after = (prefix: string) =>
    text.startsWith(prefix) ? text.slice(prefix.length).trim() : null
  const character = after(PREFIX.character)
  if (character) {
    const [name, ...look] = character.split('/')
    return {
      kind: 'character',
      name: name!.trim(),
      look: look.join('/').trim() || null,
    }
  }
  const lora =
    after(PREFIX.lora) ??
    (/^lora[·:]/i.test(text) ? text.slice(5).trim() : null)
  if (lora) return { kind: 'lora', name: lora }
  const prompt = after(PREFIX.prompt)
  if (prompt) return { kind: 'prompt', name: prompt }
  const conversation = after(PREFIX.conversation)
  if (conversation)
    return {
      kind: 'conversation',
      id: conversation.split(/\s/)[0]!.toLowerCase(),
    }
  const skill = after(PREFIX.skill)
  if (skill) return { kind: 'skill', name: skill }
  if (text === PREFIX.settings || text.toLowerCase() === 'settings')
    return { kind: 'settings' }
  return null
}

/** 一条记忆的编号（第 6 步）：id 的前 8 位，只给模型用来改 / 忘那一条。 */
export function memoryHandle(id: string): string {
  return `${PREFIX.memory}${id.slice(0, 8)}`
}

/** `记忆·3f9a1c2b` → `3f9a1c2b`；不是记忆编号回 null。 */
export function memoryIdPrefixOf(raw: string): string | null {
  const text = raw.trim()
  if (!text.startsWith(PREFIX.memory)) return null
  const id = text.slice(PREFIX.memory.length).trim().toLowerCase()
  return /^[0-9a-f-]{4,36}$/.test(id) ? id : null
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function day(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function matches(query: string, ...fields: (string | null | undefined)[]) {
  if (!query) return true
  const haystack = fields.filter(Boolean).join(' ').toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

// ---------------------------------------------------------------- 图

interface PictureRow {
  id: string
  seq: number | null
  outputType: string
  url: string
  thumbnailUrl: string | null
  prompt: string
  negativePrompt: string | null
  model: string
  width: number
  height: number
  seed: string | null
  createdAt: Date
  advancedParams: Record<string, unknown> | null
  referenceImages: unknown
  aspectRatio: string | null
  freePrompt: string | null
  /** 上传的原图自带配方时读出来的来源与模型名（`embeddedRecipeFields`）。 */
  embeddedRecipe: {
    source?: string
    model?: string | null
    characters?: string[]
  } | null
}

/** ⚠ 整份快照能到 7 MB：只取 `advancedParams` 与参考图那两格（同 `readOwnRecipes`）。 */
const PICTURE_COLUMNS = Prisma.sql`"id", "seq", "outputType"::text AS "outputType", "url", "thumbnailUrl",
  "prompt", "negativePrompt", "model", "width", "height", "seed"::text AS "seed", "createdAt",
  "snapshot"->'advancedParams' AS "advancedParams", "snapshot"->'referenceImages' AS "referenceImages",
  "snapshot"->>'aspectRatio' AS "aspectRatio", "snapshot"->>'freePrompt' AS "freePrompt",
  "snapshot"->'embeddedRecipe' AS "embeddedRecipe"`

function pictureTag(row: Pick<PictureRow, 'seq' | 'outputType'>): string {
  return buildGenerationTag({ seq: row.seq, outputType: row.outputType }) ?? ''
}

function pictureLine(row: PictureRow): string {
  return `${pictureTag(row)} · ${day(row.createdAt)} · ${row.model} · ${row.width}×${row.height} · ${clip(row.prompt, LIMITS.promptPreviewChars)}`
}

function pictureRef(row: PictureRow): WorkspacePicture {
  return {
    url: row.thumbnailUrl ?? row.url,
    label: pictureTag(row),
    generationId: row.id,
  }
}

async function findPictures(
  userId: string,
  query: string,
): Promise<PictureRow[]> {
  const handle = parseWorkspaceHandle(query)
  if (handle?.kind === 'picture') {
    const row = await readPicture(userId, handle)
    return row ? [row] : []
  }
  const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  return db.$queryRaw<PictureRow[]>`
    SELECT ${PICTURE_COLUMNS}
      FROM "Generation"
     WHERE "userId" = ${userId}
       AND "status" = 'COMPLETED'
       AND "seq" IS NOT NULL
       AND (${query} = '' OR "prompt" ILIKE ${like} OR "model" ILIKE ${like})
     ORDER BY "createdAt" DESC
     LIMIT ${LIMITS.perKind}`
}

async function readPicture(
  userId: string,
  handle: Extract<WorkspaceHandle, { kind: 'picture' }>,
): Promise<PictureRow | null> {
  const outputType = OUTPUT_TYPE_BY_PREFIX[handle.prefix] ?? 'IMAGE'
  // ⚠ seq 不唯一（没加唯一约束，见 schema 注）：撞号时取最新那一行。
  const rows = await db.$queryRaw<PictureRow[]>`
    SELECT ${PICTURE_COLUMNS}
      FROM "Generation"
     WHERE "userId" = ${userId}
       AND "seq" = ${handle.serial}
       AND "outputType"::text = ${outputType}
     ORDER BY "createdAt" DESC
     LIMIT 1`
  return rows[0] ?? null
}

/** 一张图的完整配方：A1111 那三行，再加 LoRA（名字 + 权重）与参考图（能认出编号的写编号）。 */
async function pictureRecipe(userId: string, row: PictureRow): Promise<string> {
  // 传上来的 NovelAI / A1111 原图自带配方：上传时读出来了，照常给。
  if (row.model === USER_UPLOAD_PROVIDER && row.embeddedRecipe) {
    const { source, model, characters } = row.embeddedRecipe
    const lines = [
      `Uploaded by the creator; the file carried the recipe it was made with (${source === 'novelai' ? 'NovelAI' : 'A1111 / Forge'}${model ? `, ${model}` : ''}):`,
      buildAssetRecipeText({
        ...row,
        snapshot: { advancedParams: row.advancedParams ?? undefined },
      }),
    ]
    for (const [index, character] of (characters ?? []).entries())
      lines.push(`Character ${index + 1}: ${character}`)
    return lines.join('\n')
  }
  // 她自己传上来的图没有配方（只有尺寸）：明说，⛔ 让模型换着入口再翻一遍。
  if (row.model === USER_UPLOAD_PROVIDER)
    return `Uploaded by the creator, not generated here: no recipe was recorded (no prompt, model or settings)${row.prompt.trim() ? ` — only their note: "${clip(row.prompt, LIMITS.promptPreviewChars)}"` : ''}. Size: ${row.width}x${row.height}. Searching the workspace again will not find more; judge it from the picture itself, and look at it with tagger: true to read its artist / style and character.`
  const base = buildAssetRecipeText({
    ...row,
    snapshot: { advancedParams: row.advancedParams ?? undefined },
  })
  const lines = [base]
  const loras = Array.isArray(row.advancedParams?.loras)
    ? (row.advancedParams.loras as { url?: unknown; scale?: unknown }[])
    : []
  if (loras.length > 0) {
    const urls = loras.flatMap((lora) =>
      typeof lora.url === 'string' ? [lora.url] : [],
    )
    const named = await findLoraAssetsByUrls(urls, userId).catch(() => [])
    const nameOf = (url: string) =>
      named.find((asset) => asset.loraUrl === url)?.name ?? url
    lines.push(
      `LoRAs: ${loras
        .map((lora) =>
          typeof lora.url === 'string'
            ? `${PREFIX.lora}${nameOf(lora.url)} @ ${typeof lora.scale === 'number' ? lora.scale : 1}`
            : null,
        )
        .filter(Boolean)
        .join(', ')}`,
    )
  }
  const references = Array.isArray(row.referenceImages)
    ? row.referenceImages.filter(
        (url): url is string => typeof url === 'string',
      )
    : []
  if (references.length > 0) {
    const known = await picturesByUrl(userId, references)
    lines.push(
      `Reference pictures: ${references
        .map(
          (url, index) =>
            `@Image${index + 1} = ${known.get(url) ?? 'an uploaded picture'}`,
        )
        .join(', ')}`,
    )
  }
  return lines.filter(Boolean).join('\n')
}

/** 改库用（第 4b 步）：`图_N` → 那一张的 generationId 与原图地址；不是她的 / 认不出回 null。 */
export async function resolvePicture(
  owner: WorkspaceOwner,
  raw: string,
): Promise<{ generationId: string; url: string; label: string } | null> {
  const handle = parseWorkspaceHandle(raw)
  if (handle?.kind !== 'picture') return null
  const row = await readPicture(owner.userId, handle)
  return row
    ? { generationId: row.id, url: row.url, label: pictureTag(row) }
    : null
}

/** 一张图的配方，拆成能逐格放回台上的样子（`apply_recipe`）。 */
export interface PictureRecipeParts {
  readonly tag: string
  readonly prompt: string
  readonly negative: string
  readonly model: string
  /** 记下的比例；老图没记就按宽高。 */
  readonly aspectRatio: string | null
  readonly width: number
  readonly height: number
  /** 记下的模型参数（只留简单值；LoRA、负面词、参考图另有各自那一格）。 */
  readonly options: Readonly<Record<string, string | number | boolean>>
  readonly loras: readonly { readonly name: string; readonly weight: number }[]
  /** 参考图：认得出是库里哪一张的给编号，认不出（上传的）是 null。 */
  readonly references: readonly (string | null)[]
}

const RECIPE_OPTION_SKIP = new Set(['loras', 'negativePrompt'])

/** 套用配方用：按编号读那张图，拆成一格一格。不是图的编号 / 查不到回 null。 */
export async function readPictureRecipe(
  owner: WorkspaceOwner,
  raw: string,
): Promise<PictureRecipeParts | null> {
  const handle = parseWorkspaceHandle(raw)
  if (handle?.kind !== 'picture') return null
  const row = await readPicture(owner.userId, handle)
  if (!row) return null
  const params = row.advancedParams ?? {}
  const options: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params))
    if (
      !RECIPE_OPTION_SKIP.has(key) &&
      (typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean')
    )
      options[key] = value
  const loraRefs = Array.isArray(params.loras)
    ? (params.loras as { url?: unknown; scale?: unknown }[]).flatMap((lora) =>
        typeof lora.url === 'string'
          ? [
              {
                url: lora.url,
                weight: typeof lora.scale === 'number' ? lora.scale : 1,
              },
            ]
          : [],
      )
    : []
  const named = loraRefs.length
    ? await findLoraAssetsByUrls(
        loraRefs.map((lora) => lora.url),
        owner.userId,
      ).catch(() => [])
    : []
  const references = Array.isArray(row.referenceImages)
    ? row.referenceImages.filter(
        (url): url is string => typeof url === 'string',
      )
    : []
  const known = await picturesByUrl(owner.userId, references)
  return {
    tag: pictureTag(row),
    prompt: row.freePrompt?.trim() || row.prompt,
    negative:
      row.negativePrompt ??
      (typeof params.negativePrompt === 'string' ? params.negativePrompt : ''),
    model: row.model,
    aspectRatio: row.aspectRatio,
    width: row.width,
    height: row.height,
    options,
    loras: loraRefs.flatMap((lora) => {
      const name = named.find((asset) => asset.loraUrl === lora.url)?.name
      return name ? [{ name, weight: lora.weight }] : []
    }),
    references: references.map((url) => known.get(url) ?? null),
  }
}

/** 这几个地址里哪几张是创作者库里的图 → 地址 → 编号（台上的 ref-N / result-N 也这样认出编号）。 */
export async function picturesByUrl(
  userId: string,
  urls: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const list = [...new Set(urls)].filter(Boolean)
  if (list.length === 0) return out
  const rows = await db.generation.findMany({
    where: {
      userId,
      seq: { not: null },
      OR: [{ url: { in: list } }, { thumbnailUrl: { in: list } }],
    },
    select: { url: true, thumbnailUrl: true, seq: true, outputType: true },
    take: list.length * 2,
  })
  for (const row of rows) {
    const tag = buildGenerationTag(row)
    if (!tag) continue
    for (const url of [row.url, row.thumbnailUrl])
      if (url && list.includes(url) && !out.has(url)) out.set(url, tag)
  }
  return out
}

/** 板子末尾那一行：台上的参考图 / 结果各自是哪一张（编号只给模型，ref-N / result-N 当别名）。 */
export async function benchAliases(
  userId: string,
  snapshot: AssistantOperatorSnapshot,
): Promise<string> {
  const references = snapshot.references?.items ?? []
  const results = snapshot.results ?? []
  const known = await picturesByUrl(userId, [
    ...references.map((item) => item.url),
    ...results.map((item) => item.url),
  ]).catch(() => new Map<string, string>())
  const pairs = [
    ...references.map((item, index) => [
      `ref-${index + 1}`,
      known.get(item.url),
    ]),
    ...results.map((item, index) => [
      `result-${index + 1}`,
      known.get(item.url),
    ]),
  ].filter((pair): pair is [string, string] => Boolean(pair[1]))
  if (pairs.length === 0) return ''
  return `PICTURE NUMBERS ON THE BENCH: ${pairs.map(([alias, tag]) => `${alias} = ${tag}`).join(', ')}`
}

// ---------------------------------------------------------------- 对话

interface ConversationRow {
  id: string
  surface: string
  title: string | null
  updatedAt: Date
  messages: unknown
}

function messageLines(messages: unknown): { role: string; content: string }[] {
  if (!Array.isArray(messages)) return []
  return messages.flatMap((message) => {
    if (typeof message !== 'object' || message === null) return []
    const { role, content } = message as { role?: unknown; content?: unknown }
    return typeof content === 'string' && content.trim()
      ? [{ role: typeof role === 'string' ? role : 'user', content }]
      : []
  })
}

function conversationLine(row: ConversationRow, query: string): string {
  const head = `${PREFIX.conversation}${row.id.slice(0, 8)} · ${SURFACE_LABELS[row.surface] ?? row.surface} · ${day(row.updatedAt)} · ${clip(row.title ?? '', 40)}`
  if (!query) return head
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  for (const line of messageLines(row.messages)) {
    const at = line.content.toLowerCase().indexOf(words[0] ?? '')
    if (at < 0) continue
    const start = Math.max(0, at - LIMITS.snippetChars)
    return `${head}\n    ${line.role}: …${clip(line.content.slice(start, at + LIMITS.snippetChars), LIMITS.snippetChars * 2)}…`
  }
  return head
}

async function findConversations(
  userId: string,
  query: string,
): Promise<ConversationRow[]> {
  // ⭐ 所有台的对话都翻（10-23 用户定），每条标出哪个台、哪天 —— 与历史记录一一对应。
  const like = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  return db.$queryRaw<ConversationRow[]>`
    SELECT "id", "surface"::text AS "surface", "title", "updatedAt", "messages"
      FROM "AssistantConversation"
     WHERE "userId" = ${userId}
       AND (${query} = '' OR "title" ILIKE ${like} OR "messages"::text ILIKE ${like})
     ORDER BY "updatedAt" DESC
     LIMIT ${LIMITS.perKind}`
}

async function readConversation(
  userId: string,
  prefix: string,
): Promise<WorkspaceRead | null> {
  if (!/^[0-9a-f-]{4,36}$/.test(prefix)) return null
  const rows = await db.$queryRaw<ConversationRow[]>`
    SELECT "id", "surface"::text AS "surface", "title", "updatedAt", "messages"
      FROM "AssistantConversation"
     WHERE "userId" = ${userId} AND "id" LIKE ${`${prefix}%`}
     ORDER BY "updatedAt" DESC
     LIMIT 1`
  const row = rows[0]
  if (!row) return null
  // 从最近往前读，放得下为止（最旧的先舍）。
  const kept: string[] = []
  let chars = 0
  for (const line of messageLines(row.messages).reverse()) {
    const text = `${line.role}: ${line.content.trim()}`
    if (chars + text.length > LIMITS.conversationChars) break
    kept.unshift(text)
    chars += text.length
  }
  return {
    text: `${conversationLine(row, '')}\n${kept.join('\n')}`,
    pictures: [],
  }
}

// ---------------------------------------------------------------- 角色 / LoRA / 提示词

async function findCharacters(clerkId: string, query: string) {
  const cards = await listCharacterCards(clerkId)
  return cards
    .filter((card) =>
      matches(
        query,
        card.name,
        card.handle,
        card.tags.join(' '),
        card.looks
          .map((look) => `${look.label ?? ''} ${look.tags.join(' ')}`)
          .join(' '),
      ),
    )
    .slice(0, LIMITS.perKind)
}

function lookName(
  look: { label: string | null; isDefault: boolean },
  index: number,
) {
  return (
    look.label?.trim() || (look.isDefault ? 'default' : `look ${index + 1}`)
  )
}

async function readCharacter(
  owner: WorkspaceOwner,
  handle: Extract<WorkspaceHandle, { kind: 'character' }>,
): Promise<WorkspaceRead | null> {
  const cards = await listCharacterCards(owner.clerkId)
  const wanted = handle.name.toLowerCase().replace(/^@/, '')
  const card =
    cards.find((item) => item.name.toLowerCase() === wanted) ??
    cards.find((item) => item.handle?.toLowerCase() === wanted) ??
    cards.find((item) => item.name.toLowerCase().includes(wanted))
  if (!card) return null
  const looks = handle.look
    ? card.looks.filter((look, index) =>
        lookName(look, index)
          .toLowerCase()
          .includes(handle.look!.toLowerCase()),
      )
    : card.looks
  const groups = await listCharacterLoraGroups(owner.clerkId, card.id).catch(
    () => [],
  )
  const loras = groups.flatMap((group) => group.loras)
  const lines = [
    `${PREFIX.character}${card.name}${card.handle ? ` (@${card.handle})` : ''}`,
    card.persona
      ? `Settings: ${clip(JSON.stringify(card.persona), 1_500)}`
      : '',
    ...looks.map(
      (look, index) =>
        `Look ${PREFIX.character}${card.name}/${lookName(look, index)}${look.isDefault ? ' (default)' : ''}: ${clip(look.description ?? '', 500)}${look.tags.length ? ` · tags: ${look.tags.join(', ')}` : ''}`,
    ),
    loras.length
      ? `Linked LoRAs: ${loras.map((lora) => `${PREFIX.lora}${lora.name}${lora.triggerWord ? ` (trigger ${lora.triggerWord})` : ''}`).join(', ')}`
      : 'Linked LoRAs: none yet.',
  ]
  const pictures = looks
    .flatMap((look) =>
      look.referenceSlots
        .filter((slot) => slot.url)
        .map((slot, index) => ({
          url: slot.url,
          label: `${card.name}/${lookName(look, card.looks.indexOf(look))} ${index + 1}`,
        })),
    )
    .slice(0, LIMITS.pictures)
  return { text: lines.filter(Boolean).join('\n'), pictures }
}

async function findLoras(clerkId: string, query: string) {
  const assets = await listLoraAssetsForUser(clerkId)
  return assets
    .filter((asset) =>
      matches(
        query,
        asset.name,
        asset.styleCode,
        asset.triggerWord,
        asset.baseModelFamily,
        asset.type,
      ),
    )
    .slice(0, LIMITS.perKind)
}

async function readLora(
  clerkId: string,
  name: string,
): Promise<WorkspaceRead | null> {
  const assets = await listLoraAssetsForUser(clerkId)
  const wanted = name.toLowerCase()
  const asset =
    assets.find((item) => item.name.toLowerCase() === wanted) ??
    assets.find((item) => item.styleCode?.toLowerCase() === wanted) ??
    assets.find((item) => item.name.toLowerCase().includes(wanted))
  if (!asset) return null
  const lines = [
    `${PREFIX.lora}${asset.name} · ${asset.type} · base ${asset.baseModelFamily ?? 'unknown'} · ${asset.isOwn ? 'in their library' : 'curated'}`,
    asset.triggerWord ? `Trigger: ${asset.triggerWord}` : 'Trigger: none',
    `Recommended weight: ${asset.defaultScale ?? 1}`,
    asset.recommendedPrompt
      ? `Author's example prompt: ${clip(asset.recommendedPrompt, 1_200)}`
      : '',
  ]
  const pictures = [asset.coverImageUrl, ...(asset.previewImageUrls ?? [])]
    .filter((url): url is string => Boolean(url))
    .slice(0, LIMITS.pictures)
    .map((url, index) => ({ url, label: `${asset.name} sample ${index + 1}` }))
  return { text: lines.filter(Boolean).join('\n'), pictures }
}

async function findPrompts(clerkId: string, query: string) {
  const recipes = await listRecipeSummaries(clerkId, 1, LIMITS.listScan)
  return recipes
    .filter((recipe) =>
      matches(query, recipe.name, recipe.compiledPrompt, recipe.modelId),
    )
    .slice(0, LIMITS.perKind)
}

async function readPrompt(
  clerkId: string,
  name: string,
): Promise<WorkspaceRead | null> {
  const recipes = await listRecipeSummaries(clerkId, 1, LIMITS.listScan)
  const wanted = name.toLowerCase()
  const recipe =
    recipes.find((item) => item.name.toLowerCase() === wanted) ??
    recipes.find((item) => item.name.toLowerCase().includes(wanted))
  if (!recipe) return null
  const loras = recipe.lora?.items ?? []
  return {
    text: [
      `${PREFIX.prompt}${recipe.name} · ${recipe.modelId ?? 'any model'}`,
      recipe.compiledPrompt,
      loras.length
        ? `LoRAs: ${loras.map((lora) => `${PREFIX.lora}${lora.name} @ ${lora.scale}`).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    pictures: recipe.coverThumbnailUrl
      ? [{ url: recipe.coverThumbnailUrl, label: `${recipe.name} cover` }]
      : [],
  }
}

async function readSettings(owner: WorkspaceOwner): Promise<WorkspaceRead> {
  // ⛔ 渠道只取名字与开关：密文、掩码都不取。
  const [keys, persona, sources] = await Promise.all([
    db.userApiKey.findMany({
      where: { userId: owner.userId },
      select: { adapterType: true, modelId: true, label: true, isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
    getAssistantPersona(owner.clerkId),
    listProjectSourceRules(owner.userId),
  ])
  const channels = keys.length
    ? `Model channels (keys themselves are never shown):\n${keys
        .map(
          (key) =>
            `- ${key.label || key.adapterType} · ${key.adapterType}${key.modelId ? ` · ${key.modelId}` : ''}${key.isActive ? '' : ' · switched off'}`,
        )
        .join('\n')}`
    : 'Model channels: none set up yet.'
  const KEY = ASSISTANT_SETTINGS_WRITE_KEY_IDS
  const assistant = [
    `${KEY.name}: ${persona.name ?? '(default)'}`,
    `${KEY.callMe}: ${persona.addressUserAs ?? '(account name)'}`,
    `${KEY.tone}: ${persona.tone === 'custom' ? `"${persona.toneCustom ?? ''}"` : persona.tone}`,
    `${KEY.verbosity}: ${persona.verbosity}`,
    `${KEY.planMode}: ${persona.planMode}`,
    `${KEY.language}: ${persona.language}`,
    `${KEY.model}: ${persona.routeModel}`,
    `${KEY.thinking}: ${persona.reasoningEffort}`,
    `${KEY.nextStepHint}: ${persona.nextStepHint}`,
    `${KEY.useMyWords}: ${persona.useMyWords}`,
    `${KEY.remember}: ${persona.memoryCapture}`,
    `${KEY.character}: ${persona.character ? `${PREFIX.character}${persona.character.name}` : '(none)'}`,
    `${KEY.nameFromCharacter}: ${persona.nameFromCharacter}`,
    `${KEY.toneFromCharacter}: ${persona.toneFromCharacter}`,
    `${KEY.avatar}: ${persona.avatarChoice ?? '(default)'}`,
    `${KEY.archetype}: ${persona.archetype ?? '(custom)'}`,
  ]
  const list = (kind: string) =>
    sources
      .filter((rule) => rule.kind === kind)
      .map((rule) => rule.text)
      .join(', ') || '(empty)'
  return {
    text: [
      channels,
      `Assistant settings:\n${assistant.map((line) => `- ${line}`).join('\n')}`,
      `Search sources — block: ${list(PROJECT_RULE_KIND_IDS.sourceDeny)}; allow only: ${list(PROJECT_RULE_KIND_IDS.sourceAllow)}`,
    ].join('\n\n'),
    pictures: [],
  }
}

// ---------------------------------------------------------------- 入口

/** find：按类查，每类最多 `perKind` 条，一类一段。记忆走 v3 那条（隐身、作用域都在那里），⛔ 不在这里。 */
export async function findInWorkspace(
  owner: WorkspaceOwner,
  query: string,
  kinds: readonly AssistantNextFindKind[],
): Promise<{ text: string; pictures: readonly WorkspacePicture[] }> {
  const q = query.trim().slice(0, LIMITS.maxQueryChars)
  const sections: string[] = []
  const pictures: WorkspacePicture[] = []
  const run = async (kind: AssistantNextFindKind) => {
    switch (kind) {
      case KIND.pictures: {
        const rows = await findPictures(owner.userId, q)
        pictures.push(...rows.map(pictureRef))
        return rows.length
          ? `PICTURES\n${rows.map(pictureLine).join('\n')}`
          : 'PICTURES: none found'
      }
      case KIND.characters: {
        const cards = await findCharacters(owner.clerkId, q)
        return cards.length
          ? `CHARACTERS\n${cards
              .map(
                (card) =>
                  `${PREFIX.character}${card.name} · looks: ${card.looks.map((look, index) => lookName(look, index)).join(', ')} · ${card.generationCount} pictures`,
              )
              .join('\n')}`
          : 'CHARACTERS: none found'
      }
      case KIND.loras: {
        const assets = await findLoras(owner.clerkId, q)
        return assets.length
          ? `LORAS\n${assets
              .map(
                (asset) =>
                  `${PREFIX.lora}${asset.name} · ${asset.type} · base ${asset.baseModelFamily ?? '?'}${asset.triggerWord ? ` · trigger ${asset.triggerWord}` : ''}`,
              )
              .join('\n')}`
          : 'LORAS: none found'
      }
      case KIND.prompts: {
        const recipes = await findPrompts(owner.clerkId, q)
        return recipes.length
          ? `SAVED PROMPTS\n${recipes
              .map(
                (recipe) =>
                  `${PREFIX.prompt}${recipe.name} · ${recipe.modelId ?? 'any model'} · ${clip(recipe.compiledPrompt, LIMITS.promptPreviewChars)}`,
              )
              .join('\n')}`
          : 'SAVED PROMPTS: none found'
      }
      case KIND.conversations: {
        if (owner.incognito)
          return 'CONVERSATIONS: not searched — incognito is on.'
        const rows = await findConversations(owner.userId, q)
        return rows.length
          ? `CONVERSATIONS\n${rows.map((row) => conversationLine(row, q)).join('\n')}`
          : 'CONVERSATIONS: none found'
      }
      default:
        return ''
    }
  }
  for (const kind of kinds) {
    try {
      const section = await run(kind)
      if (section) sections.push(section)
    } catch {
      sections.push(`${kind.toUpperCase()}: could not be searched right now.`)
    }
  }
  return { text: sections.join('\n\n'), pictures }
}

/** look 认出的一个编号 → 打开它。认不出 / 不存在回 null（交给台上那一套，或说清楚没找到）。 */
export async function openWorkspaceHandle(
  owner: WorkspaceOwner,
  handle: WorkspaceHandle,
): Promise<WorkspaceRead | null> {
  switch (handle.kind) {
    case 'picture': {
      const row = await readPicture(owner.userId, handle)
      if (!row) return null
      return {
        text: `${pictureTag(row)} · ${day(row.createdAt)}\n${await pictureRecipe(owner.userId, row)}`,
        pictures: [pictureRef(row)],
      }
    }
    case 'character':
      return readCharacter(owner, handle)
    case 'lora':
      return readLora(owner.clerkId, handle.name)
    case 'prompt':
      return readPrompt(owner.clerkId, handle.name)
    case 'conversation':
      return owner.incognito
        ? {
            text: 'Incognito is on: earlier conversations are not opened.',
            pictures: [],
          }
        : readConversation(owner.userId, handle.id)
    case 'skill':
      return {
        // 这个人那一套（改版 / 关掉的照他的）；读不出来就只看内置的。
        text: renderSkill(
          handle.name,
          await loadAssistantSkills(owner.userId).catch(() => BUILTIN_SKILLS),
        ),
        pictures: [],
      }
    case 'settings':
      return readSettings(owner)
  }
}
