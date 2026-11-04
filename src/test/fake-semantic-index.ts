import { vi } from 'vitest'

/**
 * 假的按意思搜 Worker（`workers/semantic-index`）：只替网络边界（fetch），
 * 真 `semantic-search.service` 照常拼请求、解析回包。
 *
 * - 写（/upsert）、删（/delete）落进内存，按 namespace 分区；
 * - 查（/query）默认回这一区同 kind 的全部条目（分数 0.9，按写入顺序），
 *   `answer(keys)` 可以指定下一次查回哪几条（按给的顺序、分数从高到低）；
 * - `down()` 之后每个请求都回 503。
 * 别的 fetch 交给 `fallback`（默认直接报错，免得漏网真联网）。
 */
export function fakeSemanticIndex(
  fallback: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response> = async (input) => {
    throw new Error(`fakeSemanticIndex：没登记的请求 ${String(input)}`)
  },
) {
  const BASE = 'https://semantic.test'
  vi.stubEnv('SEMANTIC_INDEX_URL', BASE)
  vi.stubEnv('SEMANTIC_INDEX_TOKEN', 'test-token')

  const zones = new Map<
    string,
    Map<
      string,
      { kind: string; key: string; text: string; meta: Record<string, unknown> }
    >
  >()
  const queries: Array<{ namespace: string; kind: string; text: string }> = []
  let nextAnswer: string[] | null = null
  let isDown = false

  const zone = (namespace: string) => {
    let entries = zones.get(namespace)
    if (!entries) {
      entries = new Map()
      zones.set(namespace, entries)
    }
    return entries
  }

  const fetchFake = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      )
      if (url.origin !== BASE) return fallback(input, init)
      if (isDown) return new Response('down', { status: 503 })
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        namespace: string
        kind?: string
        text?: string
        items?: Array<{
          kind: string
          key: string
          text?: string
          meta?: Record<string, unknown>
        }>
      }
      const entries = zone(body.namespace)
      if (url.pathname === '/upsert') {
        for (const item of body.items ?? []) {
          entries.set(`${item.kind}:${item.key}`, {
            kind: item.kind,
            key: item.key,
            text: item.text ?? '',
            meta: item.meta ?? {},
          })
        }
        return Response.json({ ok: true })
      }
      if (url.pathname === '/delete') {
        for (const item of body.items ?? [])
          entries.delete(`${item.kind}:${item.key}`)
        return Response.json({ ok: true })
      }
      if (url.pathname === '/query') {
        queries.push({
          namespace: body.namespace,
          kind: body.kind ?? '',
          text: body.text ?? '',
        })
        const keys =
          nextAnswer ??
          [...entries.values()]
            .filter((entry) => entry.kind === body.kind)
            .map((entry) => entry.key)
        nextAnswer = null
        return Response.json({
          matches: keys.map((key, index) => ({
            key,
            score: 0.9 - index * 0.01,
            meta: {},
          })),
        })
      }
      return new Response('not found', { status: 404 })
    },
  )
  vi.stubGlobal('fetch', fetchFake)

  return {
    /** 某一区里现有的条目（key → text）。 */
    entries(namespace: string) {
      return Object.fromEntries(
        [...zone(namespace).values()].map((entry) => [entry.key, entry.text]),
      )
    },
    queries,
    answer(keys: string[]) {
      nextAnswer = keys
    },
    down() {
      isDown = true
    },
  }
}
