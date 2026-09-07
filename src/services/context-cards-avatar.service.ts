import 'server-only'

import { randomBytes } from 'node:crypto'

import { PROFILE } from '@/constants/config'
import {
  CONTEXT_CARD_LIMITS,
  CONTEXT_CARD_STORAGE_TYPE,
  type ContextCardImageRoleId,
} from '@/constants/context-cards'
import {
  deleteFromR2,
  fetchAsBuffer,
  parseOwnedStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import {
  getContextCard,
  replaceContextCardImages,
} from '@/services/context-cards.service'
import type { ContextCard, ContextCardImage } from '@/types/context-cards'

/**
 * 上下文卡**参考图的上传与摘除** —— 与 `context-cards.service.ts` 并行，
 * ⛔ 有意分成两个文件。
 *
 * 判据只有一条，与 persona 的头像那条**逐字同源**：那个文件在工具环的 import
 * 白名单里（`assistant-operator.money-gate.test.ts`），而这个文件会写 R2。
 * 分开之后「工具环够不着上传」这件事写在 import 表上，不需要任何人去论证。
 *
 * 形状照抄 `assistant-persona-avatar.service.ts`：同一份 JPEG/PNG/WebP 白名单、
 * 同「先删旧对象再写库」的顺序判据。两处不同 —— key 前缀
 * `context-cards/<userId>/`，尺寸上限走 `CONTEXT_CARD_LIMITS.maxImageBytes`
 * （设定图比头像大，理由见那条常量的注释）。
 */

function generateContextCardImageKey(userId: string, mimeType: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const random = randomBytes(8).toString('hex')
  const ext = mimeType.includes('webp')
    ? 'webp'
    : mimeType.includes('png')
      ? 'png'
      : 'jpg'
  return `${CONTEXT_CARD_STORAGE_TYPE}/${userId}/${date}_${random}.${ext}`
}

/** 一张卡的参考图满了 —— 调用方据此拒，⛔ 不静默挤掉最老的一张。 */
export class ContextCardImageLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Context card image limit reached (${limit})`)
    this.name = 'ContextCardImageLimitError'
  }
}

export interface AddContextCardImageInput {
  /** data URL 或 http 地址 —— 与账户头像那条路逐字同形。 */
  imageData: string
  role: ContextCardImageRoleId
  sourceRef?: string | null
}

/**
 * 传一张参考图，追加到卡的 `images` 上。
 *
 * ⚠ 上限**在传之前查**：先传后拒等于往 R2 上留一个没人引用的对象。
 * ⚠ 卡不存在 / 不属于这个用户时返回 null，⛔ 不在别人的卡上落对象。
 */
export async function addContextCardImage(
  userId: string,
  cardId: string,
  input: AddContextCardImageInput,
): Promise<ContextCard | null> {
  const card = await getContextCard(userId, cardId)
  if (!card) return null

  if (card.images.length >= CONTEXT_CARD_LIMITS.maxImages) {
    throw new ContextCardImageLimitError(CONTEXT_CARD_LIMITS.maxImages)
  }

  const { buffer, mimeType } = await fetchAsBuffer(input.imageData)

  if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, or WebP.')
  }
  if (buffer.length > CONTEXT_CARD_LIMITS.maxImageBytes) {
    throw new Error('Reference image must be under 10 MB')
  }

  const key = generateContextCardImageKey(userId, mimeType)
  const url = await uploadToR2({ data: buffer, key, mimeType })

  const image: ContextCardImage = {
    url,
    role: input.role,
    sourceRef: input.sourceRef ?? null,
  }

  const updated = await replaceContextCardImages(userId, cardId, [
    ...card.images,
    image,
  ])

  /**
   * 卡在这两跳之间被删掉了 —— 把刚传上去的对象收回来，⛔ 不留孤儿。
   * 删失败不该把这次失败改写成别的东西，所以吞掉（与头像那条同源）。
   */
  if (!updated) await deleteFromR2(key).catch(() => {})
  return updated
}

/**
 * 摘一张参考图：**先改库、再删对象**。
 *
 * ⚠ 顺序与上传相反，理由与头像那条逐字一样：反过来的话，删成功而写库失败会在卡上
 * 留一条指向已删对象的 URL —— 用户看到的是一张永远碎着的图。
 * ⚠ 卡上没有这条 URL 时返回 null → 路由 404，⛔ 不把「摘了不存在的」当成功。
 */
export async function removeContextCardImage(
  userId: string,
  cardId: string,
  url: string,
): Promise<ContextCard | null> {
  const card = await getContextCard(userId, cardId)
  if (!card) return null

  const remaining = card.images.filter((image) => image.url !== url)
  if (remaining.length === card.images.length) return null

  const updated = await replaceContextCardImages(userId, cardId, remaining)
  if (!updated) return null

  await deleteOwnedObject(url)
  return updated
}

/**
 * 删一张卡时把它的参考图对象一起清掉（路由在删库之前调它）。
 *
 * ⚠ 只清**我们自己桶里**的对象（`parseOwnedStorageKey`）：卡上也可能挂着别处的
 * 地址，那些不归我们删。
 */
export async function purgeContextCardImages(
  images: readonly ContextCardImage[],
): Promise<void> {
  await Promise.all(images.map((image) => deleteOwnedObject(image.url)))
}

async function deleteOwnedObject(url: string): Promise<void> {
  const key = parseOwnedStorageKey(url)
  if (!key) return
  await deleteFromR2(key).catch(() => {})
}
