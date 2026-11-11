import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { fakeServer } from '@/test/app-harness'
import type {
  ApiKeyHealthStatus,
  GenerationRecord,
  UserApiKeyRecord,
} from '@/types'
import type { MonthlyUsageRow } from '@/types/usage'

/**
 * 常用的几条假接口（L2b）：素材库列表 / 文件夹 / 分面计数。
 * 按 `fakeServer()` 的登记法挂上去；要看请求内容的，自己再 `.on(...)` 盖一条。
 */
export function fakeAssetLibraryRoutes(
  server: ReturnType<typeof fakeServer>,
  generations: GenerationRecord[] = [],
) {
  return server
    .on('GET', '/api/images', (request) =>
      Response.json({
        success: true,
        data: {
          generations,
          page: 1,
          limit: Number(request.nextUrl.searchParams.get('limit') ?? 24),
          total: generations.length,
          hasMore: false,
          nextCursor: null,
        },
      }),
    )
    .on('GET', '/api/projects', () =>
      Response.json({ success: true, data: [] }),
    )
    .on('GET', '/api/assets/section-counts', () =>
      Response.json({
        success: true,
        data: {
          all: generations.length,
          favorites: 0,
          published: 0,
          image: generations.length,
          video: 0,
          audio: 0,
          unassigned: 0,
          byProject: {},
          byModel: {},
        },
      }),
    )
}

/** jsdom 没有的几样浏览器 API：观察器、scrollIntoView。 */
export function stubBrowserObservers() {
  class Noop {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  globalThis.IntersectionObserver ??= Noop as never
  globalThis.ResizeObserver ??= Noop as never
  Element.prototype.scrollIntoView ??= () => {}
}

/** 一把 key 的列表行（`GET /api/api-keys` 回的形状）。 */
export function apiKeyRecord(
  id: string,
  adapterType: AI_ADAPTER_TYPES,
  label: string,
  providerLabel = label,
): UserApiKeyRecord {
  return {
    id,
    modelId: 'whatever',
    adapterType,
    providerConfig: { label: providerLabel, baseUrl: 'https://example.com' },
    label,
    maskedKey: '••••••••',
    isActive: true,
    isDefault: false,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  }
}

/**
 * key 名单 + 本月用量那几条接口；`health` 写进真 `useApiKeys` 读的那份
 * localStorage 体检缓存（等于「上次校验过，结果是…」）。
 */
export function fakeApiKeyRoutes(
  server: ReturnType<typeof fakeServer>,
  keys: UserApiKeyRecord[],
  {
    health = {},
    usage = [],
  }: {
    health?: Record<string, ApiKeyHealthStatus>
    usage?: MonthlyUsageRow[]
  } = {},
) {
  const now = Date.now()
  localStorage.setItem(
    'pixelvault:api-key-health',
    JSON.stringify(
      Object.fromEntries(
        Object.entries(health).map(([id, status]) => [id, { status, ts: now }]),
      ),
    ),
  )
  return server
    .on('GET', '/api/api-keys', () =>
      Response.json({ success: true, data: keys }),
    )
    .on('GET', '/api/usage/by-model', () =>
      Response.json({ success: true, data: { month: '2026-09', rows: usage } }),
    )
    .on('GET', '/api/runner/usage', () =>
      Response.json({ success: false, error: 'off' }, { status: 404 }),
    )
}

/** 浏览器空闲回调立刻跑（jsdom 没有，`deferToIdle` 会退回 1 秒的 setTimeout）。 */
export function runIdleCallbacksNow() {
  globalThis.requestIdleCallback = ((task: () => void) => {
    task()
    return 1
  }) as never
  globalThis.cancelIdleCallback = (() => {}) as never
}
