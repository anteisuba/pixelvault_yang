import 'server-only'

import { getModelById } from '@/constants/models'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import type { GenerateVideoRequest } from '@/types'
import { loadCardBusCharacters } from '@/services/cards/card-bus.service'

/**
 * 卡片总线的**视频出口**（画布镜头里 @她，画布用角色 ④ 第 2 片，owner 09-28）。
 *
 * ⭐ 在场的角色 = `characterCardIds`；每位带哪几张 = `characterImagePicks`（与图片出口
 *   同一份形状、同一个装载器，按本人校验）。没挑的角色只带主图 1 张。
 * ⭐ 追加在请求自带的参考图**后面**，按这个端点一次能收几张封顶，已有的同一张不重复。
 * ⚠ 只加参考图，⛔ 不改正文：视频端点没有「照 Image N 保持」那套指令位，正文里她的
 *   名字已经由客户端把 `@` 去掉照原样写着。
 */
export async function withCharacterVideoReferences(
  userId: string,
  input: GenerateVideoRequest,
): Promise<GenerateVideoRequest> {
  if (!input.characterCardIds?.length) return input
  const characters = await loadCardBusCharacters(
    userId,
    input.characterCardIds,
    input.characterImagePicks,
  )
  const model = getModelById(input.modelId)
  const cap = model
    ? getVideoModelSendContract(input.modelId, model.adapterType).slots.images
    : null
  const existing = input.referenceImages ?? []
  const room =
    typeof cap === 'number' ? Math.max(0, cap - existing.length) : Infinity
  if (room === 0) return input

  const seen = new Set(existing)
  const added: string[] = []
  for (const character of characters) {
    const picked = input.characterImagePicks?.[character.cardId]
    const slots = picked?.length ? character.slots : character.slots.slice(0, 1)
    for (const slot of slots) {
      if (added.length >= room) break
      if (seen.has(slot.url)) continue
      seen.add(slot.url)
      added.push(slot.url)
    }
  }
  return added.length > 0
    ? { ...input, referenceImages: [...existing, ...added] }
    : input
}
