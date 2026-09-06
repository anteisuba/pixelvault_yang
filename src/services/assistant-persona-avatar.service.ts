import 'server-only'

import { randomBytes } from 'node:crypto'

import { db } from '@/lib/db'
import { PROFILE } from '@/constants/config'
import { ASSISTANT_AVATAR_STORAGE_TYPE } from '@/constants/assistant-persona'
import { deleteFromR2, fetchAsBuffer, uploadToR2 } from '@/services/storage/r2'

/**
 * AI 头像的自定义上传（§8.3）—— **与账户头像那条并行，不是同一条**。
 *
 * ⚠ 为什么不给 `user.service.ts` 的 `uploadAvatar` 加一个 `target` 分支：
 * 那条路写死 `User.avatarUrl`，而它被账户头像与 Clerk 同步共用
 * （`user.service.ts:283` / `:327`）。加分支等于让两件事共用一个开关，
 * 而其中一件事的失败会表现成另一件事的头像变了。
 *
 * ⚠ 为什么单独一个文件而不是塞进 `assistant-persona.service.ts`：
 * 那个文件在工具环的 import 白名单里（`assistant-operator.money-gate.test.ts`），
 * 而这个文件会写 R2。分开之后「工具环够不着上传」这件事写在 import 表上，
 * 不需要任何人去论证。
 *
 * 形状与账户头像逐字一致：同 5 MB 上限、同 JPEG/PNG/WebP 白名单、
 * 同「先删旧 storageKey 再传」的顺序。只有两处不同 ——
 * key 前缀 `profiles/<userId>/assistant-avatar/`，写回 `AssistantPersona` 那两列。
 */

function generateAssistantAvatarKey(userId: string, mimeType: string): string {
  const date = new Date().toISOString().slice(0, 10)
  const random = randomBytes(8).toString('hex')
  const ext = mimeType.includes('webp')
    ? 'webp'
    : mimeType.includes('png')
      ? 'png'
      : 'jpg'
  return `profiles/${userId}/${ASSISTANT_AVATAR_STORAGE_TYPE}/${date}_${random}.${ext}`
}

async function findExistingKey(userId: string): Promise<string | null> {
  const row = await db.assistantPersona.findUnique({
    where: { userId },
    select: { avatarStorageKey: true },
  })
  return row?.avatarStorageKey ?? null
}

/**
 * 传一张自定义 AI 头像，写回 `AssistantPersona.avatarUrl` / `avatarStorageKey`。
 *
 * ⚠ persona 行可能还不存在（§8.4：不做首次访问自动建行）—— 所以这里是 `upsert`：
 * 用户传头像**就是**他第一次表态，这一刻建行是有理由的。
 */
export async function uploadAssistantAvatar(
  userId: string,
  imageData: string,
): Promise<{ url: string }> {
  const { buffer, mimeType } = await fetchAsBuffer(imageData)

  if (!PROFILE.SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, or WebP.')
  }
  if (buffer.length > PROFILE.AVATAR_MAX_SIZE_BYTES) {
    throw new Error('Avatar image must be under 5 MB')
  }

  const previousKey = await findExistingKey(userId)
  // 删旧对象失败不该拦住换头像 —— 与账户头像那条逐字同源。
  if (previousKey) await deleteFromR2(previousKey).catch(() => {})

  const key = generateAssistantAvatarKey(userId, mimeType)
  const url = await uploadToR2({ data: buffer, key, mimeType })

  await db.assistantPersona.upsert({
    where: { userId },
    create: { userId, avatarUrl: url, avatarStorageKey: key },
    update: { avatarUrl: url, avatarStorageKey: key },
  })

  return { url }
}

/**
 * 撤掉自定义头像，退回预设（§8.6 的 `avatarRemove`）。
 *
 * ⚠ 顺序与上传相反：**先清列再删对象**。反过来的话，删成功而清列失败会留下一条
 * 指向已删对象的 URL —— 用户看到的是一张永远碎着的头像。
 */
export async function removeAssistantAvatar(userId: string): Promise<void> {
  const previousKey = await findExistingKey(userId)
  if (!previousKey) return

  await db.assistantPersona.update({
    where: { userId },
    data: { avatarUrl: null, avatarStorageKey: null },
  })
  await deleteFromR2(previousKey).catch(() => {})
}
