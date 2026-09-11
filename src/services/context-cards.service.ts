import 'server-only'

import { db } from '@/lib/db'
import {
  CONTEXT_CARD_KIND_IDS,
  CONTEXT_CARD_LIMITS,
  CONTEXT_CARD_STATUS_IDS,
  type ContextCardKindId,
  type ContextCardStatusId,
} from '@/constants/context-cards'
import { ensureUser } from '@/services/user.service'
import type {
  ContextCardKind,
  ContextCardStatus,
  Prisma,
} from '@/lib/generated/prisma/client'
import {
  ContextCardImageSchema,
  ContextCardSchema,
  type ContextCard,
  type ContextCardImage,
  type CreateContextCardRequest,
  type UpdateContextCardRequest,
} from '@/types/context-cards'

/**
 * **上下文卡**的全部读写（第三期 K1）。
 *
 * 一张卡 = 一段账号级持久上下文（角色 / 风格 / 品牌）。它可以被 `@` 点名注入，
 * 也可以**常挂**在某个工作台上，常挂之后每一轮都进系统提示。
 *
 * ⚠ **每一条查询都按 `userId` 收敛**，没有例外 —— 与 `project-rule.service.ts`
 * 逐字同一条：翻别人的卡和翻别人的素材库是同一件事。
 *
 * ── 它在工具环的 import 白名单里 ────────────────────────────────
 * 判据逐条对着 `assistant-operator.money-gate.test.ts` 那份名单的问题：它不创建
 * generation、不扣 credit、不调任何 provider、**不碰 R2**。它读写的是一张只有
 * 文本列与一列 Json 的表，而 Json 里存的是**已经上传好的** URL。
 * ⛔ 参考图上传那条腿住在另一个文件（`context-cards-avatar.service.ts`），
 * 与 persona 的头像那条逐字同源 —— 工具环因此在 import 表上就够不着上传。
 */

/** 协议侧的小写 id ↔ 库里的 SCREAMING_SNAKE 枚举。⛔ 两处都不许写字面量。 */
const DB_KIND_BY_ID: Record<ContextCardKindId, ContextCardKind> = {
  [CONTEXT_CARD_KIND_IDS.character]: 'CHARACTER',
  [CONTEXT_CARD_KIND_IDS.style]: 'STYLE',
  [CONTEXT_CARD_KIND_IDS.brand]: 'BRAND',
}

const ID_BY_DB_KIND: Record<ContextCardKind, ContextCardKindId> = {
  CHARACTER: CONTEXT_CARD_KIND_IDS.character,
  STYLE: CONTEXT_CARD_KIND_IDS.style,
  BRAND: CONTEXT_CARD_KIND_IDS.brand,
}

/** 同上，档位那一列（v2 §8.2）。 */
const DB_STATUS_BY_ID: Record<ContextCardStatusId, ContextCardStatus> = {
  [CONTEXT_CARD_STATUS_IDS.proposed]: 'PROPOSED',
  [CONTEXT_CARD_STATUS_IDS.confirmed]: 'CONFIRMED',
}

const ID_BY_DB_STATUS: Record<ContextCardStatus, ContextCardStatusId> = {
  PROPOSED: CONTEXT_CARD_STATUS_IDS.proposed,
  CONFIRMED: CONTEXT_CARD_STATUS_IDS.confirmed,
}

const CARD_SELECT = {
  id: true,
  kind: true,
  status: true,
  name: true,
  summary: true,
  body: true,
  images: true,
  negative: true,
  pinnedScopes: true,
  createdAt: true,
  updatedAt: true,
} as const

type CardRow = {
  id: string
  kind: ContextCardKind
  status: ContextCardStatus
  name: string
  summary: string
  body: string
  images: Prisma.JsonValue
  negative: string | null
  pinnedScopes: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * 库里那一列 Json → 一串参考图。
 *
 * ⚠ **逐张过 schema，坏的那张丢掉**，⛔ 不让一张坏图连累整张卡读不出来：
 * 角色卡上八张图里有一张的 role 是词表外的旧值时，用户该看到另外七张，
 * 而不是「这张卡打不开」。判据与 persona 的 `avatarPreset` 单独回落同源。
 */
export function parseContextCardImages(value: unknown): ContextCardImage[] {
  if (!Array.isArray(value)) return []
  const images: ContextCardImage[] = []
  for (const entry of value) {
    const parsed = ContextCardImageSchema.safeParse(entry)
    if (parsed.success) images.push(parsed.data)
    if (images.length >= CONTEXT_CARD_LIMITS.maxImages) break
  }
  return images
}

function toCard(row: CardRow): ContextCard | null {
  const parsed = ContextCardSchema.safeParse({
    id: row.id,
    kind: ID_BY_DB_KIND[row.kind],
    status: ID_BY_DB_STATUS[row.status],
    name: row.name,
    summary: row.summary,
    body: row.body,
    images: parseContextCardImages(row.images),
    negative: row.negative,
    pinnedScopes: row.pinnedScopes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
  return parsed.success ? parsed.data : null
}

export interface ListContextCardsOptions {
  kind?: ContextCardKindId | null
  /**
   * 要哪一档（v2 §8.1）。
   *
   * ⭐ **缺席 = 只要已确认的**：`list_context_cards`、系统提示注入、设置里的卡表
   * 三条路都不传它，于是助手提议的草稿一条都看不见 —— ⛔ 让模型读到自己提议的
   * 草稿等于给它一条自引用回路（「我记得你说过」而用户从没点过头）。
   * 待确认区显式传 `proposed`。
   */
  status?: ContextCardStatusId | null
  /** 给了就只要**常挂在这个域 / 工作台**的卡（系统提示注入走这一条）。 */
  pinnedScope?: string | null
  limit?: number
}

/** 列出用户的卡，最近改过的在前。 */
export async function listContextCards(
  userId: string,
  options: ListContextCardsOptions = {},
): Promise<ContextCard[]> {
  const rows = await db.contextCard.findMany({
    where: {
      userId,
      status:
        DB_STATUS_BY_ID[options.status ?? CONTEXT_CARD_STATUS_IDS.confirmed],
      ...(options.kind ? { kind: DB_KIND_BY_ID[options.kind] } : {}),
      ...(options.pinnedScope
        ? { pinnedScopes: { has: options.pinnedScope } }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(
      options.limit ?? CONTEXT_CARD_LIMITS.maxPerUser,
      CONTEXT_CARD_LIMITS.maxPerUser,
    ),
    select: CARD_SELECT,
  })

  return rows.map(toCard).filter((card): card is ContextCard => card !== null)
}

/** 同上，但从 clerkId 起跳（API 路由那一侧用）。 */
export async function listContextCardsForClerkId(
  clerkId: string,
  options: ListContextCardsOptions = {},
): Promise<ContextCard[]> {
  const user = await ensureUser(clerkId)
  return listContextCards(user.id, options)
}

/** 读一张。返回 null = 这张卡不属于这个用户（或已经没了）—— 路由据此 404。 */
export async function getContextCard(
  userId: string,
  cardId: string,
): Promise<ContextCard | null> {
  const row = await db.contextCard.findFirst({
    where: { id: cardId, userId },
    select: CARD_SELECT,
  })
  return row ? toCard(row) : null
}

export async function getContextCardForClerkId(
  clerkId: string,
  cardId: string,
): Promise<ContextCard | null> {
  const user = await ensureUser(clerkId)
  return getContextCard(user.id, cardId)
}

/** 卡表满了 —— 调用方据此拒，⛔ 不静默丢弃、也不挤掉最老的一张。 */
export class ContextCardLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Context card limit reached (${limit})`)
    this.name = 'ContextCardLimitError'
  }
}

/** 刚写进去的一行读不出来 = 词表与库的形状对不上，⛔ 不静默返回半成品。 */
function assertReadable(card: ContextCard | null): ContextCard {
  if (!card) throw new Error('CONTEXT_CARD_UNREADABLE_AFTER_WRITE')
  return card
}

/**
 * 建一张卡。
 *
 * ⚠ 上限是一条**真的会拒**的闸（判据与项目规则那条同源）：常挂的卡会拼进系统
 * 提示，没有上限的卡表等于一条会无限长的提示。
 * ⚠ `images` 不在这条路上 —— 新卡永远从零张图开始，图走上传那条腿加。
 */
export async function createContextCard(
  userId: string,
  input: CreateContextCardRequest,
): Promise<ContextCard> {
  const count = await db.contextCard.count({
    where: {
      userId,
      status: DB_STATUS_BY_ID[CONTEXT_CARD_STATUS_IDS.confirmed],
    },
  })
  if (count >= CONTEXT_CARD_LIMITS.maxPerUser) {
    throw new ContextCardLimitError(CONTEXT_CARD_LIMITS.maxPerUser)
  }

  const row = await db.contextCard.create({
    data: {
      userId,
      kind: DB_KIND_BY_ID[input.kind],
      /** ⚠ 缺席 = 已确认：用户自己建的卡与面板上「存这张卡」都走这条路。 */
      status:
        DB_STATUS_BY_ID[input.status ?? CONTEXT_CARD_STATUS_IDS.confirmed],
      name: input.name,
      summary: input.summary,
      body: input.body,
      negative: input.negative ?? null,
      pinnedScopes: dedupeScopes(input.pinnedScopes),
      images: [],
    },
    select: CARD_SELECT,
  })

  return assertReadable(toCard(row))
}

export async function createContextCardForClerkId(
  clerkId: string,
  input: CreateContextCardRequest,
): Promise<ContextCard> {
  const user = await ensureUser(clerkId)
  return createContextCard(user.id, input)
}

/** ⚠ 同一个域挂两遍是个 no-op，⛔ 别让它在数组里堆两条。 */
function dedupeScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes)].slice(0, CONTEXT_CARD_LIMITS.maxPinnedScopes)
}

/**
 * 改一张卡。返回 null = 不属于这个用户（或已经没了）。
 *
 * ⚠ 常挂那颗开关（`pin`）在**服务端**读改写，⛔ 不让客户端整份覆盖：
 * 两个工作台同时挂同一张卡时，整份覆盖会把对方的常挂抹掉而两边都显示成功。
 */
export async function updateContextCard(
  userId: string,
  cardId: string,
  input: UpdateContextCardRequest,
): Promise<ContextCard | null> {
  const existing = await db.contextCard.findFirst({
    where: { id: cardId, userId },
    select: { id: true, pinnedScopes: true },
  })
  if (!existing) return null

  let pinnedScopes: string[] | undefined
  if (input.pin) {
    const current = new Set(existing.pinnedScopes)
    if (input.pin.pinned) current.add(input.pin.scope)
    else current.delete(input.pin.scope)
    pinnedScopes = dedupeScopes([...current])
    if (pinnedScopes.length > CONTEXT_CARD_LIMITS.maxPinnedScopes) {
      pinnedScopes = pinnedScopes.slice(0, CONTEXT_CARD_LIMITS.maxPinnedScopes)
    }
  } else if (input.pinnedScopes) {
    pinnedScopes = dedupeScopes(input.pinnedScopes)
  }

  const row = await db.contextCard.update({
    where: { id: existing.id },
    data: {
      ...(input.kind ? { kind: DB_KIND_BY_ID[input.kind] } : {}),
      ...(input.status ? { status: DB_STATUS_BY_ID[input.status] } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.negative !== undefined
        ? { negative: input.negative ?? null }
        : {}),
      ...(pinnedScopes ? { pinnedScopes } : {}),
    },
    select: CARD_SELECT,
  })

  return assertReadable(toCard(row))
}

export async function updateContextCardForClerkId(
  clerkId: string,
  cardId: string,
  input: UpdateContextCardRequest,
): Promise<ContextCard | null> {
  const user = await ensureUser(clerkId)
  return updateContextCard(user.id, cardId, input)
}

/**
 * 常挂 / 取消常挂一张卡到一个域（对话框上那颗开关走的就是它）。
 *
 * ⚠ 这是 `updateContextCard` 的具名入口，不是第二条路 —— 读改写只有一处实现。
 */
export async function setContextCardPinned(
  userId: string,
  cardId: string,
  scope: string,
  pinned: boolean,
): Promise<ContextCard | null> {
  return updateContextCard(userId, cardId, { pin: { scope, pinned } })
}

/**
 * 删一张。返回 false = 不属于这个用户（或已经没了）—— 路由据此 404，
 * ⛔ 不把「删了别人的」和「什么都没删」混成同一个成功。
 *
 * ⚠ **参考图的 R2 对象不在这条路上删**：清对象要写 R2，而这个文件在工具环的
 * import 白名单里。删卡带对象清理的那一跳住在
 * `context-cards-avatar.service.ts`（路由调它），⛔ 别为了「顺手」把 R2 拉进来。
 */
export async function deleteContextCard(
  userId: string,
  cardId: string,
): Promise<boolean> {
  const { count } = await db.contextCard.deleteMany({
    where: { id: cardId, userId },
  })
  return count > 0
}

export async function deleteContextCardForClerkId(
  clerkId: string,
  cardId: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  return deleteContextCard(user.id, cardId)
}

/**
 * 把一串参考图整份写回一张卡（上传 / 摘图那条腿用）。
 *
 * ⚠ 它**不做上限判断以外的任何清洗** —— 调用方（上传服务）刚刚才把一张
 * 已上传的图拼进去，形状由它保证。⛔ 别在这里再 fetch 一次 URL 做校验：
 * 那会让这个文件长出一条对外请求。
 */
export async function replaceContextCardImages(
  userId: string,
  cardId: string,
  images: readonly ContextCardImage[],
): Promise<ContextCard | null> {
  const existing = await db.contextCard.findFirst({
    where: { id: cardId, userId },
    select: { id: true },
  })
  if (!existing) return null

  const row = await db.contextCard.update({
    where: { id: existing.id },
    data: {
      images: images.slice(
        0,
        CONTEXT_CARD_LIMITS.maxImages,
      ) as unknown as Prisma.InputJsonValue,
    },
    select: CARD_SELECT,
  })

  return assertReadable(toCard(row))
}
