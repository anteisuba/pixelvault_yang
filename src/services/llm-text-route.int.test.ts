/**
 * L2a 真库：`resolveLlmTextRoute` —— 点名的那把 key → 它那一家的文本线路。
 * key 真加密入库、真解密；别人的、关掉的、解不开的照实抛（⛔ 不去找别家的 key）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { resolveLlmTextRoute } from '@/services/llm-text.service'
import { plainKeyOf, seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestUser, resetDatabase } from '@/test/int/db'

let userId = ''

beforeEach(async () => {
  await resetDatabase()
  userId = (await createTestUser()).id
})

describe('resolveLlmTextRoute', () => {
  it('点名的那把 key → 它那一家，key 是解出来的明文', async () => {
    await seedAssistantKeys(userId, {
      keys: [
        { adapterType: AI_ADAPTER_TYPES.OPENAI },
        { adapterType: AI_ADAPTER_TYPES.GEMINI, id: 'key_gemini' },
      ],
    })

    const route = await resolveLlmTextRoute(userId, 'key_gemini')

    expect(route.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
    expect(route.apiKey).toBe(plainKeyOf(AI_ADAPTER_TYPES.GEMINI))
  })

  it('⛔ 那把 key 解不开 → 照实抛，不去找别家的 key', async () => {
    await seedAssistantKeys(userId, {
      keys: [
        {
          adapterType: AI_ADAPTER_TYPES.GEMINI,
          id: 'key_broken',
          broken: true,
        },
        { adapterType: AI_ADAPTER_TYPES.OPENAI },
      ],
    })

    await expect(resolveLlmTextRoute(userId, 'key_broken')).rejects.toThrow()
  })

  it('那把 key 不在了 / 关掉了 / 是别人的 → 照实抛', async () => {
    const stranger = await createTestUser()
    await seedAssistantKeys(stranger.id, {
      keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI, id: 'key_theirs' }],
    })
    await seedAssistantKeys(userId, {
      keys: [
        {
          adapterType: AI_ADAPTER_TYPES.GEMINI,
          id: 'key_off',
          isActive: false,
        },
      ],
    })

    for (const keyId of ['key_gone', 'key_off', 'key_theirs'])
      await expect(resolveLlmTextRoute(userId, keyId)).rejects.toThrow(
        'The selected API key is unavailable',
      )
  })
})
