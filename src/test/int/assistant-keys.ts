import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { encryptApiKey } from '@/lib/crypto'
import { db } from '@/lib/db'

/**
 * 「助手那一家」用例的真库底座（L2a）：几把真加密、真入库的 key + 人设里选的那一档。
 * 让用例跑真的 `resolveAssistantRoute` → `resolveLlmTextRoute` → 真解密。
 * ⛔ key 都是假的，用例里不许真去调模型（LLM 调用照旧在 `@/services/llm*` 边界上替掉）。
 */
export interface SeedKey {
  adapterType: AI_ADAPTER_TYPES
  /** 默认 `key_<厂商>`；同一个库里两个用户都有同一家时要自己起名。 */
  id?: string
  createdAt?: Date
  isActive?: boolean
  /** 密文坏了：真 `decryptApiKey` 解不开就抛。 */
  broken?: boolean
}

/** 解出来的明文（断言「用的就是这一把」）。 */
export function plainKeyOf(adapterType: AI_ADAPTER_TYPES): string {
  return `sk-test-${adapterType}`
}

export async function seedAssistantKeys(
  userId: string,
  setup: { keys: readonly SeedKey[]; routeModel?: string | null },
) {
  for (const key of setup.keys) {
    await db.userApiKey.create({
      data: {
        id: key.id ?? `key_${key.adapterType}`,
        userId,
        adapterType: key.adapterType,
        modelId: key.adapterType,
        providerConfig: {},
        label: `test ${key.adapterType}`,
        encryptedKey: key.broken
          ? 'broken'
          : encryptApiKey(plainKeyOf(key.adapterType)),
        isActive: key.isActive ?? true,
        ...(key.createdAt ? { createdAt: key.createdAt } : {}),
      },
    })
  }
  if (setup.routeModel !== undefined) {
    await db.assistantPersona.upsert({
      where: { userId },
      create: { userId, routeModel: setup.routeModel },
      update: { routeModel: setup.routeModel },
    })
  }
}
