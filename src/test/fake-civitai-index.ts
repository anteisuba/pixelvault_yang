import { vi } from 'vitest'

/**
 * 假的 Civitai 索引 Worker（`CIVITAI_INDEX_URL`）：只替网络边界（fetch），
 * 真 `civitai-lora-library.service` 照常把库页条件翻成索引查询。
 *
 * `/search` 回 `rows`（默认空）；`requests` 记下每次查询的 body。别的 fetch 交给
 * `fallback`（默认直接报错，免得漏网真联网）。用完 `vi.unstubAllEnvs()` +
 * `vi.unstubAllGlobals()`。
 */
export const CIVITAI_INDEX_TEST_URL = 'https://civitai-index.test'

export type CivitaiIndexRow = {
  modelId: number
  versionId: number
  versionName: string | null
  name: string
  creator: string | null
  creatorImage: string | null
  nsfw: boolean
  baseModel: string | null
  tags: string[]
  trainedWords: string[]
  hashAutoV3: string | null
  downloadCount: number
  thumbsUpCount: number
  images: Array<{ id: number; url: string; nsfwLevel?: number }>
  permissions: {
    allowCommercialUse: string[]
    allowDerivatives: boolean
    allowNoCredit: boolean
  }
  createdAt: number
}

export function civitaiIndexRow(
  overrides: Partial<CivitaiIndexRow> = {},
): CivitaiIndexRow {
  return {
    modelId: 122359,
    versionId: 135867,
    versionName: 'v1.0',
    name: 'Changli Wuthering Waves',
    creator: 'someauthor',
    creatorImage: null,
    nsfw: false,
    baseModel: 'Illustrious',
    tags: ['character'],
    trainedWords: ['changli'],
    hashAutoV3: 'abcdef123456',
    downloadCount: 4200,
    thumbsUpCount: 300,
    images: [{ id: 1, url: 'cover-uuid', nsfwLevel: 1 }],
    permissions: {
      allowCommercialUse: ['Image'],
      allowDerivatives: true,
      allowNoCredit: false,
    },
    createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

export function fakeCivitaiIndex(
  fallback: (url: string, init?: RequestInit) => Promise<Response> = async (
    url,
  ) => {
    throw new Error(`不该联网：${url}`)
  },
) {
  let rows: CivitaiIndexRow[] = []
  let failing = false
  const requests: Array<Record<string, unknown>> = []

  vi.stubEnv('CIVITAI_INDEX_URL', CIVITAI_INDEX_TEST_URL)
  vi.stubEnv('CIVITAI_INDEX_TOKEN', 'index-token')
  const fetchFake = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (!url.startsWith(CIVITAI_INDEX_TEST_URL)) return fallback(url, init)
      if (failing) return new Response('{}', { status: 400 })
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      requests.push(body as Record<string, unknown>)
      return Response.json({ rows, total: rows.length, totalCapped: false })
    },
  )
  vi.stubGlobal('fetch', fetchFake)

  return {
    fetch: fetchFake,
    requests,
    answer(next: CivitaiIndexRow[]) {
      rows = next
    },
    down() {
      failing = true
    },
  }
}
