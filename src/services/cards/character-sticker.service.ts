import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { after } from 'next/server'

import { CHARACTER_STICKERS } from '@/constants/character-browse'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  detectTrustedImageMime,
  deleteFromR2,
  fetchAsBuffer,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type { CharacterStickerRecord } from '@/types/character-sticker'

/**
 * **她的表情包**（4d）：她逛来的、你喂给她的，都在这一张表、同一条 R2 路径
 * `characters/<userId>/<cardId>/stickers/`（⛔ 素材库那条 `generations/`）。
 * ⭐ 每一步都按 userId + cardId 校验归属；别人的卡、删了的卡一律当没有（路由出 404）。
 */

/** 你上传的那张，路径里多一层 `mine/`：好分清是你喂的还是她逛来的。 */
const CREATOR_SEGMENT = 'mine'

export function stickerKey(
  userId: string,
  cardId: string,
  extension: string,
  fromCreator = false,
): string {
  return `characters/${userId}/${cardId}/stickers/${fromCreator ? `${CREATOR_SEGMENT}/` : ''}${new Date().toISOString().slice(0, 10)}_${randomBytes(12).toString('hex')}.${extension}`
}

function toRecord(row: {
  id: string
  url: string
  storageKey: string
  sourceUrl: string | null
  whenToUse: string
  isBlocked: boolean
  createdAt: Date
  sentAt: Date | null
}): CharacterStickerRecord {
  return {
    id: row.id,
    url: row.url,
    sourceUrl: row.sourceUrl,
    whenToUse: row.whenToUse,
    isBlocked: row.isBlocked,
    fromCreator: row.storageKey.includes(`/stickers/${CREATOR_SEGMENT}/`),
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  }
}

const SELECT = {
  id: true,
  url: true,
  storageKey: true,
  sourceUrl: true,
  whenToUse: true,
  isBlocked: true,
  createdAt: true,
  sentAt: true,
} as const

/** 图片内容指纹：同一张图换个地址也认得出来。 */
export function stickerContentHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * 同一张图只留一张（10-30 owner「表情包找了好多次重复的」）：先给还没指纹的补上（从 R2 取回来算），
 * 指纹一样的留最早那张，拉黑过的算拉黑（她不会再发），其余删掉。
 * ⚠ 只认一模一样的图；裁了边、换了尺寸的「长得像」留给表情包那一步。
 */
export async function dedupeCharacterStickers(cardId: string): Promise<void> {
  const rows = await db.characterSticker.findMany({
    where: { characterCardId: cardId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      url: true,
      storageKey: true,
      contentHash: true,
      isBlocked: true,
    },
  })
  for (const row of rows) {
    if (row.contentHash) continue
    try {
      const { buffer } = await fetchAsBuffer(row.url)
      row.contentHash = stickerContentHash(buffer)
      await db.characterSticker.update({
        where: { id: row.id },
        data: { contentHash: row.contentHash },
        select: { id: true },
      })
    } catch (error) {
      logger.info('character sticker hash failed', {
        cardId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const keep = new Map<string, (typeof rows)[number]>()
  const extra: (typeof rows)[number][] = []
  for (const row of rows) {
    if (!row.contentHash) continue
    const first = keep.get(row.contentHash)
    if (!first) {
      keep.set(row.contentHash, row)
      continue
    }
    extra.push(row)
    if (row.isBlocked && !first.isBlocked) {
      first.isBlocked = true
      await db.characterSticker.update({
        where: { id: first.id },
        data: { isBlocked: true },
        select: { id: true },
      })
    }
  }
  if (extra.length === 0) return
  await db.characterSticker.deleteMany({
    where: { id: { in: extra.map((row) => row.id) } },
  })
  for (const row of extra)
    await deleteFromR2(row.storageKey).catch(() => undefined)
}

async function ownedCardId(clerkId: string, cardId: string) {
  const user = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
    select: { id: true },
  })
  return card ? { userId: user.id, cardId: card.id } : null
}

async function ownedSticker(clerkId: string, stickerId: string) {
  const user = await ensureUser(clerkId)
  return db.characterSticker.findFirst({
    where: {
      id: stickerId,
      userId: user.id,
      characterCard: { isDeleted: false },
    },
    select: SELECT,
  })
}

/** 这张卡的全部表情包，新的在前；卡不是你的 = null。 */
export async function listCharacterStickers(
  clerkId: string,
  cardId: string,
): Promise<CharacterStickerRecord[] | null> {
  const owned = await ownedCardId(clerkId, cardId)
  if (!owned) return null
  const rows = await db.characterSticker.findMany({
    where: { characterCardId: owned.cardId },
    orderBy: { createdAt: 'desc' },
    select: { ...SELECT, contentHash: true },
  })
  // 还有没指纹的旧行：回完这次在后台去一遍重，下次打开就干净了。
  if (rows.some((row) => !row.contentHash))
    after(() =>
      dedupeCharacterStickers(owned.cardId).catch((error: unknown) => {
        logger.warn('character sticker dedupe failed', {
          cardId: owned.cardId,
          error: error instanceof Error ? error.message : String(error),
        })
      }),
    )
  return rows.map(toRecord)
}

export class CharacterStickerUploadError extends Error {
  constructor(readonly code: 'NOT_AN_IMAGE' | 'TOO_LARGE') {
    super(code)
  }
}

/** 你喂给她一张（上传的文件）。卡不是你的 = null。 */
export async function addCharacterStickerFromFile(
  clerkId: string,
  cardId: string,
  input: { fileBuffer: Buffer; whenToUse: string },
): Promise<CharacterStickerRecord | null> {
  const owned = await ownedCardId(clerkId, cardId)
  if (!owned) return null
  if (input.fileBuffer.byteLength > CHARACTER_STICKERS.maxBytes)
    throw new CharacterStickerUploadError('TOO_LARGE')
  const image = await detectTrustedImageMime(input.fileBuffer).catch(() => null)
  if (!image) throw new CharacterStickerUploadError('NOT_AN_IMAGE')
  // 已经有这张了：⛔ 再收一遍，回那一张。
  const contentHash = stickerContentHash(input.fileBuffer)
  const existing = await db.characterSticker.findFirst({
    where: { characterCardId: owned.cardId, contentHash },
    select: SELECT,
  })
  if (existing) return toRecord(existing)
  const key = stickerKey(
    owned.userId,
    owned.cardId,
    image.format === 'jpeg' ? 'jpg' : image.format,
    true,
  )
  const url = await uploadToR2({
    data: input.fileBuffer,
    key,
    mimeType: image.mimeType,
  })
  const row = await db.characterSticker.create({
    data: {
      userId: owned.userId,
      characterCardId: owned.cardId,
      storageKey: key,
      url,
      contentHash,
      whenToUse: input.whenToUse || CHARACTER_STICKERS.defaultWhen,
    },
    select: SELECT,
  })
  await pruneCharacterStickers(owned.cardId)
  return toRecord(row)
}

/** 拉黑 / 取消拉黑。不是你的 = null。 */
export async function setCharacterStickerBlocked(
  clerkId: string,
  stickerId: string,
  isBlocked: boolean,
): Promise<CharacterStickerRecord | null> {
  const sticker = await ownedSticker(clerkId, stickerId)
  if (!sticker) return null
  const row = await db.characterSticker.update({
    where: { id: sticker.id },
    data: { isBlocked },
    select: SELECT,
  })
  return toRecord(row)
}

/** 删掉（连 R2 上那张）。不是你的 = false。 */
export async function deleteCharacterSticker(
  clerkId: string,
  stickerId: string,
): Promise<boolean> {
  const sticker = await ownedSticker(clerkId, stickerId)
  if (!sticker) return false
  await db.characterSticker.delete({ where: { id: sticker.id } })
  await deleteFromR2(sticker.storageKey).catch(() => undefined)
  return true
}

/** 每张卡最多 `perCard` 张：先删没发过的里最旧的，还多再删发过的里最旧的。 */
export async function pruneCharacterStickers(cardId: string): Promise<void> {
  const all = await db.characterSticker.findMany({
    where: { characterCardId: cardId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, storageKey: true, sentAt: true },
  })
  const excess = all.length - CHARACTER_STICKERS.perCard
  if (excess <= 0) return
  const stale = [
    ...all.filter((sticker) => !sticker.sentAt),
    ...all.filter((sticker) => sticker.sentAt),
  ].slice(0, excess)
  await db.characterSticker.deleteMany({
    where: { id: { in: stale.map((sticker) => sticker.id) } },
  })
  for (const sticker of stale)
    await deleteFromR2(sticker.storageKey).catch(() => undefined)
}

/* ── 聊天里发（4d）─────────────────────────────────────────────────── */

/** 她在回复里写的记号：单独一行 `[表情·<编号>]`，编号是表情包 id 的前几位。 */
const STICKER_TOKEN = /\[表情·([^\]\s]{1,40})\]/g

function handleOf(id: string): string {
  return id.slice(0, CHARACTER_STICKERS.handleChars)
}

export interface ChatStickers {
  /** 编号 → 那一张（只含没拉黑的）。 */
  byHandle: Map<string, { id: string; url: string }>
  /** 系统提示里那一段；没有表情包就是空串。 */
  section: string
}

/** 和她聊天时：她手上能发的表情包（没拉黑的，新的在前）。 */
export async function loadChatStickers(
  userId: string,
  cardId: string,
): Promise<ChatStickers> {
  const rows = await db.characterSticker.findMany({
    where: { userId, characterCardId: cardId, isBlocked: false },
    orderBy: { createdAt: 'desc' },
    take: CHARACTER_STICKERS.perCard,
    select: { id: true, url: true, whenToUse: true },
  })
  const byHandle = new Map(
    rows.map((row) => [handleOf(row.id), { id: row.id, url: row.url }]),
  )
  const section = rows.length
    ? `\n\nYOUR STICKERS (reaction images you can send)
${rows.map((row) => `- [表情·${handleOf(row.id)}] — when: ${row.whenToUse}`).join('\n')}
- Send one only when it really fits the moment, the way a person drops a sticker in a chat — most replies have none, and never more than one per reply. Write it alone on its own line, exactly as listed ([表情·…]).`
    : ''
  return { byHandle, section }
}

/**
 * 回复定稿前：把她写的 `[表情·编号]` 换成一行图片（`![表情](地址)`，聊天气泡认它画成裸图），
 * 记下这张发过的时间。⚠ 一轮只认第一张；认不出的编号、多出来的一律去掉。
 */
export async function resolveStickerTokens(
  text: string,
  stickers: ChatStickers,
): Promise<string> {
  let sent: { id: string; url: string } | null = null
  const resolved = text
    .replace(STICKER_TOKEN, (_, handle: string) => {
      const sticker = stickers.byHandle.get(
        handle.slice(0, CHARACTER_STICKERS.handleChars),
      )
      if (!sticker || sent) return ''
      sent = sticker
      return `\n![表情](${sticker.url})\n`
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const chosen = sent as { id: string; url: string } | null
  if (chosen)
    await db.characterSticker
      .update({ where: { id: chosen.id }, data: { sentAt: new Date() } })
      .catch(() => undefined)
  return resolved
}
