/**
 * 「助手那一家」用例的库桩（owner 2026-10-15「全跟助手」）。
 *
 * ⭐ 让用例跑**真的** `resolveAssistantRoute` + `resolveLlmTextRoute`，只桩库那几张表：
 * 小功能的路由此前就是在这两跳之间悄悄换成了别家的 key，桩掉解析器就测不出来。
 *
 * 用法（`vi.mock` 工厂会被提升，所以桩函数走 `vi.hoisted`；⚠ 工厂里不能引用本文件的
 * 导出 —— 提升后它们还没 import，所以 db 形状在各用例里手写）：
 *
 * ```ts
 * const keyStore = vi.hoisted(() => ({
 *   findFirst: vi.fn(), findMany: vi.fn(), personaFindUnique: vi.fn(),
 * }))
 * vi.mock('@/lib/db', () => ({ db: {
 *   userApiKey: { findFirst: keyStore.findFirst, findMany: keyStore.findMany },
 *   assistantPersona: { findUnique: keyStore.personaFindUnique },
 * } }))
 * vi.mock('@/lib/crypto', () => ({ decryptApiKey: (enc: string) => `plain:${enc}` }))
 * seedAssistantRoute(keyStore, { keys: [assistantKey(AI_ADAPTER_TYPES.DEEPSEEK)] })
 * ```
 */
import type { Mock } from 'vitest'

import type { AI_ADAPTER_TYPES } from '@/constants/providers'

export interface AssistantKeyRow {
  id: string
  userId: string
  adapterType: AI_ADAPTER_TYPES
  encryptedKey: string
  isActive: boolean
  createdAt: Date
}

export interface AssistantKeyStoreMocks {
  /** `db.userApiKey.findFirst` */
  findFirst: Mock
  /** `db.userApiKey.findMany` */
  findMany: Mock
  /** `db.assistantPersona.findUnique` */
  personaFindUnique: Mock
}

/** 一把活着的 key：`id` / 密文默认按厂商起名，解出来是 `plain:<密文>`。 */
export function assistantKey(
  adapterType: AI_ADAPTER_TYPES,
  overrides: Partial<Omit<AssistantKeyRow, 'adapterType'>> = {},
): AssistantKeyRow {
  return {
    id: `key_${adapterType}`,
    userId: 'db_user_1',
    adapterType,
    encryptedKey: `enc_${adapterType}`,
    isActive: true,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }
}

interface KeyQuery {
  where?: {
    id?: string
    userId?: string
    isActive?: boolean
    adapterType?: string | { in?: readonly string[] }
  }
}

function matches(key: AssistantKeyRow, query: KeyQuery): boolean {
  const where = query.where ?? {}
  if (where.id !== undefined && key.id !== where.id) return false
  if (where.userId !== undefined && key.userId !== where.userId) return false
  if (where.isActive !== undefined && key.isActive !== where.isActive)
    return false
  const adapter = where.adapterType
  if (typeof adapter === 'string' && key.adapterType !== adapter) return false
  if (
    typeof adapter === 'object' &&
    adapter.in &&
    !adapter.in.includes(key.adapterType)
  )
    return false
  return true
}

function newestFirst(keys: readonly AssistantKeyRow[]): AssistantKeyRow[] {
  return [...keys].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/**
 * 把库桩成「这个人有这几把 key、助手选的是这一档」。`routeModel` 缺席 = 「自动」。
 * ⚠ 按 id 查（`resolveLlmTextRoute(userId, apiKeyId)`）与按厂商查都照真库的语义回。
 */
export function seedAssistantRoute(
  mocks: AssistantKeyStoreMocks,
  setup: { keys: readonly AssistantKeyRow[]; routeModel?: string | null },
): void {
  mocks.findFirst.mockImplementation(async (query: KeyQuery) => {
    return newestFirst(setup.keys).find((key) => matches(key, query)) ?? null
  })
  mocks.findMany.mockImplementation(async (query: KeyQuery) =>
    newestFirst(setup.keys)
      .filter((key) => matches(key, query))
      .map((key) => ({ id: key.id, adapterType: key.adapterType })),
  )
  mocks.personaFindUnique.mockResolvedValue(
    setup.routeModel === undefined ? null : { routeModel: setup.routeModel },
  )
}
