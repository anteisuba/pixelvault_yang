/**
 * 只假网络（docs/references/testing.md「测试标准」）：服务端连外部站点的测试用。
 *
 * - `stubFetch(handler)`：替掉全局 `fetch`，每个请求交给 handler；返回 `vi.fn`，
 *   要断言「发出去的请求」就读它的 `mock.calls`。
 * - `serperOrganic(...)`：Serper `/search` 的回包长相（`webSearch` 真代码去解析）。
 * - `runWithTimers(promise)`：被测代码里有重试退避 / 冷却（真 `setTimeout`）时，
 *   配合 `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` 把时钟拨完再拿结果。
 */
import { vi } from 'vitest'

export type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>

export function stubFetch(handler: FetchHandler) {
  const fetchFake = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      return handler(url, init)
    },
  )
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

/** 发给 fetch 的请求里那几个 URL（按顺序）。 */
export function fetchedUrls(fetchFake: ReturnType<typeof stubFetch>) {
  return fetchFake.mock.calls.map(([input]) => String(input))
}

export interface SerperOrganicEntry {
  title: string
  link: string
  snippet?: string
  date?: string
}

export function serperOrganic(entries: SerperOrganicEntry[]): Response {
  return Response.json({ organic: entries })
}

/** 请求体里的 Serper 查询词。 */
export function serperQuery(init?: RequestInit): string {
  return (JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? ''
}

export async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } | null =
    null
  void promise.then(
    (value) => {
      outcome = { ok: true, value }
    },
    (error: unknown) => {
      outcome = { ok: false, error }
    },
  )
  for (let i = 0; i < 600 && !outcome; i += 1) {
    await vi.advanceTimersByTimeAsync(1_000)
  }
  const done = outcome as
    | { ok: true; value: T }
    | { ok: false; error: unknown }
    | null
  if (!done) throw new Error('runWithTimers：拨了 10 分钟还没结束')
  if (!done.ok) throw done.error
  return done.value
}
