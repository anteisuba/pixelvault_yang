import 'server-only'

import { createHash } from 'node:crypto'

import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * OpenAI `safety_identifier`：稳定、不可逆的匿名用户标识，让 OpenAI 的滥用检测
 * 能定位到单个用户，而不是把整个 BYOK key 一起封掉。官方要求哈希、≤128 字；
 * sha256 hex 恒 64 字。用内部 DB user id（不是 Clerk id、不是邮箱）再加域前缀，
 * 同一用户跨生成 / 改图恒定。
 * https://developers.openai.com/api/docs/guides/image-generation
 */
export function toOpenAISafetyIdentifier(userId: string): string {
  return createHash('sha256').update(`antei:${userId}`).digest('hex')
}

/** 只给声明了 `acceptsSafetyIdentifier` 的 OpenAI 模型算；其余返回 undefined = 不发。 */
export function openAISafetyIdentifierFor(
  adapterType: AI_ADAPTER_TYPES,
  modelId: string,
  userId: string,
): string | undefined {
  if (adapterType !== AI_ADAPTER_TYPES.OPENAI) return undefined
  return getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI, modelId)
    .acceptsSafetyIdentifier
    ? toOpenAISafetyIdentifier(userId)
    : undefined
}
