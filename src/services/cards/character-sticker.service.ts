import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { after } from 'next/server'
import sharp from 'sharp'

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

type StickerRow = Parameters<typeof toRecord>[0]

/** 图片内容指纹：同一张图换个地址也认得出来。 */
export function stickerContentHash(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * 长相指纹（第 ⑨ 步）：缩成 9×8 灰度、相邻两格比亮暗得 64 位 dHash，裁边 / 缩放 / 小水印后差几位。
 * 动图只看第一帧。读不出来（坏图）= null，这张只按内容指纹去重。
 */
export async function stickerLook(
  data: Buffer,
): Promise<{ visualHash: string; pixels: number } | null> {
  try {
    const meta = await sharp(data, { animated: false }).metadata()
    const raw = await sharp(data, { animated: false })
      .grayscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer()
    // 每 4 位拼成一个十六进制字（左边亮过右边 = 1），一共 16 个字。
    let visualHash = ''
    for (let nibble = 0; nibble < 16; nibble++) {
      let value = 0
      for (let bit = 0; bit < 4; bit++) {
        const index = nibble * 4 + bit
        const at = Math.floor(index / 8) * 9 + (index % 8)
        value = (value << 1) | (raw[at]! > raw[at + 1]! ? 1 : 0)
      }
      visualHash += value.toString(16)
    }
    return {
      visualHash,
      pixels: (meta.width ?? 0) * (meta.height ?? 0),
    }
  } catch {
    return null
  }
}

/** 两个长相指纹差几位。 */
export function stickerLookDistance(a: string, b: string): number {
  let count = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    let diff = parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16)
    while (diff) {
      count += diff & 1
      diff >>= 1
    }
  }
  return count
}

function looksAlike(a: string | null, b: string | null): boolean {
  return Boolean(
    a &&
    b &&
    stickerLookDistance(a, b) <= CHARACTER_STICKERS.similarMaxDistance,
  )
}

/**
 * 收一张（她逛来的、你喂的同一条路）：图已经在 R2 的 `key` 上。
 * - 一模一样的已经有了 → 不收，删掉刚传的，回那一张。
 * - 长得像的已经有了 → 留更清楚（像素多）的那张：新的更清楚就把那一行换成新图（拉黑、
 *   发过、那句「什么时候发」都留着），否则不收。
 * - 都没有 → 新建一行。
 */
export async function placeSticker(input: {
  userId: string
  cardId: string
  key: string
  url: string
  sourceUrl: string | null
  whenToUse: string
  data: Buffer
}): Promise<{ row: StickerRow; created: boolean }> {
  const contentHash = stickerContentHash(input.data)
  const same = await db.characterSticker.findFirst({
    where: { characterCardId: input.cardId, contentHash },
    select: SELECT,
  })
  if (same) {
    await deleteFromR2(input.key).catch(() => undefined)
    return { row: same, created: false }
  }
  const look = await stickerLook(input.data)
  const alike = look
    ? (
        await db.characterSticker.findMany({
          where: { characterCardId: input.cardId, visualHash: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: { ...SELECT, visualHash: true, pixels: true },
        })
      ).find((row) => looksAlike(row.visualHash, look.visualHash))
    : undefined
  if (alike && look) {
    if (look.pixels <= (alike.pixels ?? 0)) {
      await deleteFromR2(input.key).catch(() => undefined)
      return { row: alike, created: false }
    }
    const row = await db.characterSticker.update({
      where: { id: alike.id },
      data: {
        storageKey: input.key,
        url: input.url,
        sourceUrl: input.sourceUrl,
        contentHash,
        visualHash: look.visualHash,
        pixels: look.pixels,
      },
      select: SELECT,
    })
    await deleteFromR2(alike.storageKey).catch(() => undefined)
    return { row, created: false }
  }
  const row = await db.characterSticker.create({
    data: {
      userId: input.userId,
      characterCardId: input.cardId,
      storageKey: input.key,
      url: input.url,
      sourceUrl: input.sourceUrl,
      whenToUse: input.whenToUse,
      contentHash,
      visualHash: look?.visualHash ?? null,
      pixels: look?.pixels ?? null,
    },
    select: SELECT,
  })
  return { row, created: true }
}

/**
 * 同一张图只留一张（10-30 owner「表情包找了好多次重复的」；第 ⑨ 步连长得像的也算）：
 * 先给还没指纹的补上（从 R2 取回来算），一模一样的留最早那张，长得像的留更清楚的那张；
 * 被删的那张拉黑过，留下的也算拉黑（她不会再发）。
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
      visualHash: true,
      pixels: true,
      isBlocked: true,
    },
  })
  for (const row of rows) {
    if (row.contentHash && row.visualHash) continue
    try {
      const { buffer } = await fetchAsBuffer(row.url)
      const look = await stickerLook(buffer)
      row.contentHash = stickerContentHash(buffer)
      row.visualHash = look?.visualHash ?? null
      row.pixels = look?.pixels ?? null
      await db.characterSticker.update({
        where: { id: row.id },
        data: {
          contentHash: row.contentHash,
          visualHash: row.visualHash,
          pixels: row.pixels,
        },
        select: { id: true },
      })
    } catch (error) {
      logger.info('character sticker hash failed', {
        cardId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const kept: (typeof rows)[number][] = []
  const extra: (typeof rows)[number][] = []
  for (const row of rows) {
    if (!row.contentHash) {
      kept.push(row)
      continue
    }
    const twin = kept.find(
      (other) =>
        other.contentHash === row.contentHash ||
        looksAlike(other.visualHash, row.visualHash),
    )
    if (!twin) {
      kept.push(row)
      continue
    }
    // 一模一样留早的；长得像留更清楚的。
    const clearer =
      twin.contentHash !== row.contentHash &&
      (row.pixels ?? 0) > (twin.pixels ?? 0)
    const [winner, loser] = clearer ? [row, twin] : [twin, row]
    if (clearer) kept[kept.indexOf(twin)] = row
    extra.push(loser)
    if (loser.isBlocked && !winner.isBlocked) {
      winner.isBlocked = true
      await db.characterSticker.update({
        where: { id: winner.id },
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
    select: { ...SELECT, contentHash: true, visualHash: true },
  })
  // 还有没指纹的旧行：回完这次在后台去一遍重，下次打开就干净了。
  if (rows.some((row) => !row.contentHash || !row.visualHash))
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
  // 一模一样的已经有了：⛔ 再传一遍，回那一张（长得像的要传上去比清楚，交给 `placeSticker`）。
  const existing = await db.characterSticker.findFirst({
    where: {
      characterCardId: owned.cardId,
      contentHash: stickerContentHash(input.fileBuffer),
    },
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
  const { row, created } = await placeSticker({
    userId: owned.userId,
    cardId: owned.cardId,
    key,
    url,
    sourceUrl: null,
    whenToUse: input.whenToUse || CHARACTER_STICKERS.defaultWhen,
    data: input.fileBuffer,
  })
  if (created) await pruneCharacterStickers(owned.cardId)
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
