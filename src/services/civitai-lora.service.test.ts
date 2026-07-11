import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CIVITAI_LORA_BASE_MODEL_VALUES,
  CIVITAI_LORA_SORT_VALUES,
} from '@/constants/lora'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Bypass withRetry so tests assert the service's own logic without the
// 3-attempt backoff chain. Production behavior of retry-on-timeout is
// already covered by with-retry.ts's own tests.
vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import {
  listCivitaiLoras,
  mineCivitaiUserPrompts,
  prewarmCivitaiLoraLibrary,
  resolveCivitaiLoraByReference,
  resolveCivitaiModelPageUrlByVersion,
} from '@/services/civitai-lora.service'

const mockFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.useRealTimers()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('listCivitaiLoras', () => {
  it('normalizes public Civitai LoRA models into usable library items', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 122359,
            name: 'Detail Tweaker XL',
            type: 'LORA',
            tags: ['detail', 'style'],
            stats: { downloadCount: 10, thumbsUpCount: 4 },
            creator: {
              username: 'w4r10ck',
              image: 'https://example.com/avatar.png',
            },
            modelVersions: [
              {
                id: 135867,
                name: 'v1.0',
                baseModel: 'SDXL 1.0',
                publishedAt: null,
                createdAt: '2023-08-07T14:55:02.627Z',
                trainedWords: ['add detail'],
                stats: { downloadCount: 8, thumbsUpCount: 3 },
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl:
                      'https://civitai.com/api/download/models/135867',
                  },
                ],
                images: [
                  {
                    url: 'https://image.civitai.com/example.jpeg',
                    nsfwLevel: 1,
                  },
                ],
              },
            ],
          },
        ],
        metadata: {
          totalItems: 1,
          nextCursor: 'cursor-3',
        },
      }),
    )

    const result = await listCivitaiLoras({
      page: 2,
      cursor: 'cursor-2',
      baseModel: 'SDXL 1.0',
      sort: 'Most Downloaded',
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('types')).toBe('LORA')
    // cursor 优先——一旦有 cursor 就不发 page，两套分页信号不同时出现。
    expect(requestUrl.searchParams.get('page')).toBeNull()
    expect(requestUrl.searchParams.get('cursor')).toBe('cursor-2')
    expect(requestUrl.searchParams.get('query')).toBeNull()
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual([
      'SDXL 1.0',
      'SDXL 0.9',
      'SDXL Turbo',
      'SDXL Lightning',
      'SDXL Hyper',
      'SDXL 1.0 LCM',
    ])
    expect(requestUrl.searchParams.get('sort')).toBe('Most Downloaded')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'civitai:122359:135867',
      styleCode: 'civitai-135867',
      name: 'Detail Tweaker XL',
      source: 'imported',
      baseModelFamily: 'SDXL 1.0',
      provider: 'civitai',
      triggerWord: 'add detail',
      loraUrl: 'https://civitai.com/api/download/models/135867',
      coverImageUrl: 'https://image.civitai.com/example.jpeg',
      creatorName: 'w4r10ck',
      downloadCount: 8,
      thumbsUpCount: 3,
      createdAt: '2023-08-07T14:55:02.627Z',
    })
    expect(result.total).toBe(1)
    expect(result.hasNextPage).toBe(true)
    expect(result.nextCursor).toBe('cursor-3')
  })

  it('promotes an NSFW (XXX) image to the cover in the default unrestricted filter', async () => {
    // hentai LoRA case (ExpressiveH): 示例图全是 XXX（nsfwLevel 16）。默认
    // unrestricted 档天花板放到 16，第一张 XXX 图应成为封面而非退化占位卡。
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 555,
            name: 'Some Style LoRA',
            type: 'LORA',
            tags: ['style'],
            modelVersions: [
              {
                id: 999,
                name: 'v1',
                baseModel: 'Pony',
                createdAt: '2024-03-09T00:00:00.000Z',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/999',
                  },
                ],
                images: [
                  { url: 'https://image.civitai.com/xxx.jpeg', nsfwLevel: 16 },
                  { url: 'https://image.civitai.com/sfw.jpeg', nsfwLevel: 1 },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )

    const result = await listCivitaiLoras({ nsfwFilter: 'unrestricted' })

    expect(result.items[0]?.coverImageUrlOriginal).toBe(
      'https://image.civitai.com/xxx.jpeg',
    )
  })

  // Issue B fix (docs/plans/lora-search-image-audit-2026-07.md): previously
  // this LoRA stayed in `safe` results with just its cover swapped to the
  // SFW image — exactly the reported bug ("safe 档里内容 NSFW 的 LoRA 仍作
  // 为卡片出现，只是封面被挡成占位/换图"). A model with even one image
  // above the safe ceiling is now dropped entirely, not just cover-adjusted.
  it('drops a LoRA entirely under the safe filter when any of its images exceed the safe nsfw ceiling', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 556,
            name: 'Some Style LoRA',
            type: 'LORA',
            tags: ['style'],
            modelVersions: [
              {
                id: 1000,
                name: 'v1',
                baseModel: 'Pony',
                createdAt: '2024-03-09T00:00:00.000Z',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/1000',
                  },
                ],
                images: [
                  { url: 'https://image.civitai.com/xxx.jpeg', nsfwLevel: 16 },
                  { url: 'https://image.civitai.com/sfw.jpeg', nsfwLevel: 1 },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )

    const safeResult = await listCivitaiLoras({ nsfwFilter: 'safe' })
    expect(safeResult.items).toEqual([])

    // The same image-level signal now also qualifies this model for
    // nsfwOnly even though civitai's own `model.nsfw` bool is unset on this
    // fixture — the level check is an OR alongside the bool, not a
    // replacement of it (REST fixtures without an images array still rely
    // on the bool alone; see the nsfwFilterFixture tests below).
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 556,
            name: 'Some Style LoRA',
            type: 'LORA',
            tags: ['style'],
            modelVersions: [
              {
                id: 1000,
                name: 'v1',
                baseModel: 'Pony',
                createdAt: '2024-03-09T00:00:00.000Z',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/1000',
                  },
                ],
                images: [
                  { url: 'https://image.civitai.com/xxx.jpeg', nsfwLevel: 16 },
                  { url: 'https://image.civitai.com/sfw.jpeg', nsfwLevel: 1 },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )
    const nsfwOnlyResult = await listCivitaiLoras({ nsfwFilter: 'nsfwOnly' })
    expect(nsfwOnlyResult.items).toHaveLength(1)
    expect(nsfwOnlyResult.items[0]?.id).toBe('civitai:556:1000')
  })

  it('skips video covers — <img> cannot render video/mp4 (anim=false does not transcode either)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 558,
            name: 'Video Cover LoRA',
            type: 'LORA',
            tags: ['character'],
            modelVersions: [
              {
                id: 1003,
                name: 'v1',
                baseModel: 'Pony',
                createdAt: '2024-03-09T00:00:00.000Z',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/1003',
                  },
                ],
                images: [
                  {
                    url: 'https://image.civitai.com/clip.mp4',
                    type: 'video',
                    nsfwLevel: 1,
                  },
                  {
                    url: 'https://image.civitai.com/still.jpeg',
                    type: 'image',
                    nsfwLevel: 1,
                  },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )

    const result = await listCivitaiLoras({ nsfwFilter: 'unrestricted' })

    expect(result.items[0]?.coverImageUrlOriginal).toBe(
      'https://image.civitai.com/still.jpeg',
    )
  })

  // Issue B fix: this is the exact "blank placeholder card" pattern from
  // the bug report — an all-XXX LoRA used to survive `safe` filtering with
  // a null cover instead of being excluded. Now excluded entirely.
  it('drops an all-XXX LoRA entirely under the safe filter (no placeholder card)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 557,
            name: 'Some Style LoRA',
            type: 'LORA',
            tags: ['style'],
            modelVersions: [
              {
                id: 1001,
                name: 'v1',
                baseModel: 'Pony',
                createdAt: '2024-03-09T00:00:00.000Z',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/1001',
                  },
                ],
                images: [
                  { url: 'https://image.civitai.com/xxx.jpeg', nsfwLevel: 16 },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )

    const result = await listCivitaiLoras({ nsfwFilter: 'safe' })

    expect(result.items).toEqual([])
  })

  it('tolerates Civitai model images with zero dimensions', async () => {
    const coverUrl = 'https://image.civitai.com/zero-dimension.jpeg'
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 558,
            name: 'Zero Dimension LoRA',
            type: 'LORA',
            tags: ['style'],
            modelVersions: [
              {
                id: 1002,
                name: 'v1',
                baseModel: 'Pony V7',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/1002',
                  },
                ],
                images: [
                  {
                    url: coverUrl,
                    width: 0,
                    height: 0,
                    nsfwLevel: 1,
                  },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )

    const result = await listCivitaiLoras({
      baseModel: 'other',
      nsfwFilter: 'unrestricted',
    })

    expect(result.items[0]?.coverImageUrlOriginal).toBe(coverUrl)
    expect(result.items[0]?.baseModelFamily).toBe('Pony V7')
  })

  it('falls back to extracting cursor from metadata.nextPage when nextCursor is absent (the actual pagination bug)', async () => {
    // Real suspected root cause: for a plain browse request (no query),
    // Civitai's response only carries metadata.nextPage (a full next-page
    // URL) — no top-level nextCursor field at all. Without this fallback,
    // parseNextCursor() always returned null, cursorByPageRef never got a
    // real cursor, and every "next page" click resent the same
    // page-only/cursor-less request — which is why every prior attempt at
    // this fix (page-only, page+cursor, cursor-priority) looked identical:
    // there was never a cursor to send in the first place.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [],
        metadata: {
          totalItems: 500,
          nextPage:
            'https://civitai.com/api/v1/models?limit=20&page=2&cursor=abc123',
        },
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.nextCursor).toBe('abc123')
    expect(result.hasNextPage).toBe(true)
  })

  it('extracts a clean primary trigger + alternates + author-recommended prompt from Civitai trainedWords', async () => {
    // The exact wuthering-waves case that surfaced the original bug: author
    // left trainedWords empty so the trigger has to be inferred from the
    // model name. tags=['character', ...] used to pollute it.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            name: '鸣潮 (Wuthering Waves) || 达妮娅 (Denia)',
            type: 'LORA',
            tags: ['character', 'woman', 'denia', '达妮娅'],
            modelVersions: [
              {
                id: 100,
                name: 'v1',
                baseModel: 'Illustrious',
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/100',
                  },
                ],
                trainedWords: [],
                images: [],
                stats: {},
              },
            ],
          },
        ],
        metadata: {},
      }),
    )
    const empty = await listCivitaiLoras()
    expect(empty.items[0]?.triggerWord).not.toBe('character')
    expect(empty.items[0]?.triggerSource).toBe('inferred')
    expect(empty.items[0]?.recommendedPrompt).toBeNull()

    // A character LoRA with a long comma-separated trainedWord + a second
    // outfit variant. The first comma-segment becomes the primary trigger;
    // the full string becomes the author-recommended prompt; the second
    // entry becomes an alternate trigger.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 2,
            name: 'Cure Mystique',
            type: 'LORA',
            tags: ['character'],
            modelVersions: [
              {
                id: 200,
                name: 'v1',
                baseModel: 'Illustrious',
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/200',
                  },
                ],
                trainedWords: [
                  'cure mystique, pink hair, magical girl',
                  'kobayashi mikuru, school uniform',
                ],
                images: [],
                stats: {},
              },
            ],
          },
        ],
        metadata: {},
      }),
    )
    const rich = await listCivitaiLoras()
    expect(rich.items[0]?.triggerWord).toBe('cure mystique')
    expect(rich.items[0]?.triggerAlternates).toEqual(['kobayashi mikuru'])
    expect(rich.items[0]?.recommendedPrompt).toBe(
      'cure mystique, pink hair, magical girl',
    )
    expect(rich.items[0]?.triggerSource).toBe('official')
  })

  it('lifts outfit prompts from model.description when trainedWords is empty (the wuthering-waves Denia case)', async () => {
    // Real-world bug: trainedWords=[], tags[0]='character', but the
    // activation token `c1`/`c2` lives in description <pre><code> blocks.
    // Old service shipped trigger='character' and a useless template;
    // new service must lift the description prompt and expose both
    // outfits so users actually get the LoRA they expect.
    const description = `<ul><li><p>This is the character <strong>"Denia"</strong>.</p></li></ul>
<p><strong>outfits:</strong></p>
<p><strong>costume1</strong></p>
<pre><code>purple eyes,pink pupils,pink hair,c1,white hair ribbon,2d style,</code></pre>
<p><strong>costume2</strong></p>
<pre><code>black halo,purple eyes,c2,black hair ribbon,2d style,</code></pre>`

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 2649729,
            name: '鸣潮 (Wuthering Waves) || 达妮娅 (Denia)',
            type: 'LORA',
            description,
            tags: ['character', 'woman', 'wuthering waves', '鸣潮', 'denia'],
            modelVersions: [
              {
                id: 2975273,
                name: 'ILLU',
                baseModel: 'Illustrious',
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl:
                      'https://civitai.com/api/download/models/2975273',
                  },
                ],
                trainedWords: [],
                images: [],
                stats: {},
              },
            ],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()
    const item = result.items[0]
    expect(item).toBeDefined()
    // Critical: trigger MUST NOT be 'character' (the tag fallback bug
    // that shipped the original wrong UX).
    expect(item?.triggerWord).not.toBe('character')
    // Recommended prompt is lifted from description block #1 so copying
    // it activates `c1` outfit.
    expect(item?.recommendedPrompt).toContain('c1')
    expect(item?.recommendedPrompt).toContain('white hair ribbon')
    // Block #2 is exposed as alternate so the c2 outfit isn't lost.
    expect(item?.recommendedPromptAlternates).toHaveLength(1)
    expect(item?.recommendedPromptAlternates[0]?.label).toBe('costume2')
    expect(item?.recommendedPromptAlternates[0]?.prompt).toContain('c2')
    // Author wrote the prompts in description so this counts as official.
    expect(item?.triggerSource).toBe('official')
  })

  it('rewrites Civitai cover URLs to sized transforms and keeps the original for the lightbox', async () => {
    const ORIGINAL_URL =
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/original=true/1917130.jpeg'
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 1,
            name: 'Some LoRA',
            type: 'LORA',
            tags: [],
            modelVersions: [
              {
                id: 100,
                name: 'v1',
                baseModel: 'SDXL 1.0',
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/100',
                  },
                ],
                images: [{ url: ORIGINAL_URL, nsfwLevel: 1 }],
                stats: {},
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )

    const result = await listCivitaiLoras()
    const item = result.items[0]
    expect(item).toBeDefined()
    // List thumbnail: 96px — mount-stack chip / facepile only, never the grid card.
    expect(item?.thumbImageUrl).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=96,optimized=true/1917130.jpeg',
    )
    // P0-3: public library grid card, 450px — was wrongly using the 96px
    // list thumbnail, which renders systemically blurry on a ~200px card.
    expect(item?.cardImageUrl).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=450,optimized=true/1917130.jpeg',
    )
    // Inspector cover: 640px, fits the aspect-video panel.
    expect(item?.coverImageUrl).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=640,optimized=true/1917130.jpeg',
    )
    // Lightbox "view original" only — preserved untouched.
    expect(item?.coverImageUrlOriginal).toBe(ORIGINAL_URL)
    // Preview gallery (reserved for future): 768px.
    expect(item?.previewImageUrls[0]).toContain('width=768,optimized=true')
    // Defense: never leak `anim=false` (Civitai CDN has a fallback bug
    // for some `(anim=false, width=N, optimized=true)` cache entries).
    expect(item?.coverImageUrl).not.toContain('anim=false')
    expect(item?.thumbImageUrl).not.toContain('anim=false')
    expect(item?.cardImageUrl).not.toContain('anim=false')
  })

  it('prefers cursor over page for non-search library pagination once a cursor exists', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras({
      page: 3,
      cursor: 'cursor-2',
      baseModel: 'Anima',
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    // cursor 优先——page=3 不再发送，避免和 cursor 同时出现在请求里。
    expect(requestUrl.searchParams.get('page')).toBeNull()
    expect(requestUrl.searchParams.get('query')).toBeNull()
    expect(requestUrl.searchParams.get('cursor')).toBe('cursor-2')
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual(['Anima'])
    expect(result.nextCursor).toBeNull()
  })

  it('walks Civitai cursors instead of forwarding page-only non-search requests', async () => {
    const modelFor = (id: number) => ({
      id,
      name: `LoRA ${id}`,
      type: 'LORA',
      modelVersions: [
        {
          id: id + 100,
          name: 'v1',
          baseModel: 'Anima',
          files: [
            {
              type: 'Model',
              primary: true,
              downloadUrl: `https://civitai.com/api/download/models/${id + 100}`,
            },
          ],
          trainedWords: ['trigger'],
        },
      ],
    })

    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          items: [modelFor(1)],
          metadata: { nextCursor: 'cursor-2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [modelFor(2)],
          metadata: { nextCursor: 'cursor-3' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [modelFor(3)],
          metadata: { nextCursor: 'cursor-4' },
        }),
      )

    const result = await listCivitaiLoras({
      page: 3,
      baseModel: 'Anima',
    })

    const firstRequestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(firstRequestUrl.searchParams.get('page')).toBe('1')
    expect(firstRequestUrl.searchParams.get('cursor')).toBeNull()

    const secondRequestUrl = new URL(String(mockFetch.mock.calls[1]?.[0]))
    expect(secondRequestUrl.searchParams.get('page')).toBeNull()
    expect(secondRequestUrl.searchParams.get('cursor')).toBe('cursor-2')

    const finalRequestUrl = new URL(String(mockFetch.mock.calls[2]?.[0]))
    expect(finalRequestUrl.searchParams.get('page')).toBeNull()
    expect(finalRequestUrl.searchParams.get('cursor')).toBe('cursor-3')

    expect(result.page).toBe(3)
    expect(result.items[0]?.name).toBe('LoRA 3')
    expect(result.nextCursor).toBe('cursor-4')
  })

  it('forwards base model family buckets when browsing so upstream sort is global', async () => {
    const versionFor = (baseModel: string, id: number) => ({
      id,
      name: 'v1',
      baseModel,
      files: [
        {
          type: 'Model',
          primary: true,
          downloadUrl: `https://civitai.com/api/download/models/${id}`,
        },
      ],
      trainedWords: ['trigger'],
    })

    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 1,
            name: 'Illustrious LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Illustrious', 101)],
          },
          {
            id: 2,
            name: 'NoobAI LoRA',
            type: 'LORA',
            modelVersions: [versionFor('NoobAI', 102)],
          },
        ],
        metadata: { nextCursor: 'cursor-next' },
      }),
    )

    const result = await listCivitaiLoras({
      baseModel: 'Illustrious',
      pageSize: 10,
      sort: 'Most Downloaded',
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('limit')).toBe('10')
    // 没有 cursor 的第一页请求——page 模式的 fallback 分支仍然要发 page。
    expect(requestUrl.searchParams.get('page')).toBe('1')
    expect(requestUrl.searchParams.get('cursor')).toBeNull()
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual([
      'Illustrious',
      'NoobAI',
    ])
    expect(requestUrl.searchParams.get('sort')).toBe('Most Downloaded')

    expect(result.items.map((item) => item.baseModelFamily)).toEqual([
      'Illustrious',
      'NoobAI',
    ])
    expect(result.hasNextPage).toBe(true)
  })

  it("fetches long-tail baseModels for the 'other' bucket and keeps only unbucketed families", async () => {
    const versionFor = (baseModel: string, id: number) => ({
      id,
      name: 'v1',
      baseModel,
      files: [
        {
          type: 'Model',
          primary: true,
          downloadUrl: `https://civitai.com/api/download/models/${id}`,
        },
      ],
      trainedWords: ['trigger'],
    })

    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 1,
            name: 'Wan LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Wan Video 14B t2v', 101)],
          },
          {
            id: 2,
            name: 'Illustrious LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Illustrious', 102)],
          },
          {
            id: 3,
            name: 'Pony V7 LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Pony V7', 103)],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras({ baseModel: 'other' })

    // REST 表达不了 NOT IN；browse 态先用明确长尾 baseModels 缩小上游窗口，
    // 再由客户端补集过滤兜住误归类。
    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    const baseModels = requestUrl.searchParams.getAll('baseModels')
    expect(baseModels).toContain('Pony V7')
    expect(baseModels).toContain('Wan Video 14B t2v')
    expect(baseModels).not.toContain('Illustrious')
    expect(result.items.map((item) => item.baseModelFamily)).toEqual([
      'Wan Video 14B t2v',
      'Pony V7',
    ])
  })

  it("searches the 'other' bucket via a meilisearch NOT IN complement filter", async () => {
    mockFetch.mockImplementation(async (input) => {
      if (String(input).includes('search-new.civitai.com')) {
        return jsonResponse({ results: [{ hits: [], estimatedTotalHits: 0 }] })
      }
      return jsonResponse({ items: [], metadata: {} })
    })

    const result = await listCivitaiLoras({ baseModel: 'other', search: 'wan' })

    const searchCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('search-new.civitai.com'),
    )
    const searchBody = JSON.parse(String(searchCall?.[1]?.body)) as {
      queries: { filter: string[] }[]
    }
    expect(searchBody.queries[0]?.filter[0]).toBe('type = LoRA')
    expect(searchBody.queries[0]?.filter[1]).toMatch(
      /^versions\.baseModel NOT IN \[/,
    )
    expect(searchBody.queries[0]?.filter[1]).toContain('"Illustrious"')
    expect(searchBody.queries[0]?.filter[1]).toContain('"ZImageTurbo"')
    expect(result.items).toEqual([])
  })

  it('deduplicates repeated Civitai model versions from upstream pages', async () => {
    const duplicate = {
      id: 117135,
      name: 'Duplicated LoRA',
      type: 'LORA',
      modelVersions: [
        {
          id: 2234652,
          name: 'v1',
          baseModel: 'Illustrious',
          trainedWords: ['duplicate'],
          files: [
            {
              type: 'Model',
              primary: true,
              downloadUrl: 'https://civitai.com/api/download/models/2234652',
            },
          ],
        },
      ],
    }

    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [duplicate, duplicate],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe('civitai:117135:2234652')
  })

  it('uses an expanded upstream window for searched base model buckets', async () => {
    const versionFor = (baseModel: string, id: number) => ({
      id,
      name: 'v1',
      baseModel,
      files: [
        {
          type: 'Model',
          primary: true,
          downloadUrl: `https://civitai.com/api/download/models/${id}`,
        },
      ],
      trainedWords: ['trigger'],
    })

    // B11: search always tries meilisearch first — fail it here so the
    // request falls through to the REST scan path this test exercises.
    // mockImplementation (not mockResolvedValue) so each call gets a fresh
    // Response body instead of reusing one already-consumed instance.
    mockFetch.mockImplementation(async (input) => {
      if (String(input).includes('search-new.civitai.com')) {
        return jsonResponse({ message: 'down' }, 503)
      }
      return jsonResponse({
        items: [
          {
            id: 1,
            name: 'Illustrious LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Illustrious', 101)],
          },
          {
            id: 2,
            name: 'NoobAI LoRA',
            type: 'LORA',
            modelVersions: [versionFor('NoobAI', 102)],
          },
          {
            id: 3,
            name: 'SDXL LoRA',
            type: 'LORA',
            modelVersions: [versionFor('SDXL 1.0', 103)],
          },
          {
            id: 4,
            name: 'Anima LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Anima', 104)],
          },
        ],
        metadata: {},
      })
    })

    const result = await listCivitaiLoras({
      baseModel: 'Illustrious',
      pageSize: 10,
      search: 'Wuthering Waves',
    })

    const restCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/models'),
    )
    const requestUrl = new URL(String(restCall?.[0]))
    expect(requestUrl.searchParams.get('limit')).toBe('40')
    expect(requestUrl.searchParams.get('query')).toBe('Wuthering Waves')
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual([
      'Illustrious',
      'NoobAI',
    ])

    // Local filtering still guards the family bucket if Civitai returns an
    // unexpected mixed page.
    expect(result.items.map((item) => item.baseModelFamily)).toEqual([
      'Illustrious',
      'NoobAI',
    ])
    expect(result.hasNextPage).toBe(false)
  })

  it('returns a full logical page from expanded searched base model results', async () => {
    const versionFor = (id: number) => ({
      id,
      name: 'v1',
      baseModel: 'Illustrious',
      files: [
        {
          type: 'Model',
          primary: true,
          downloadUrl: `https://civitai.com/api/download/models/${id}`,
        },
      ],
      trainedWords: [`trigger-${id}`],
    })

    // B11: fail meilisearch first so this falls through to the REST scan
    // path under test (see comment on the previous test).
    mockFetch.mockImplementation(async (input) => {
      if (String(input).includes('search-new.civitai.com')) {
        return jsonResponse({ message: 'down' }, 503)
      }
      return jsonResponse({
        items: Array.from({ length: 12 }).map((_, index) => ({
          id: index + 1,
          name: `Wuthering Waves LoRA ${index + 1}`,
          type: 'LORA',
          modelVersions: [versionFor(index + 101)],
        })),
        metadata: { nextCursor: 'cursor-next' },
      })
    })

    const result = await listCivitaiLoras({
      baseModel: 'Illustrious',
      pageSize: 10,
      search: '鸣潮',
    })

    expect(result.items).toHaveLength(10)
    expect(result.items[0]?.name).toBe('Wuthering Waves LoRA 1')
    expect(result.hasNextPage).toBe(true)
    expect(result.nextCursor).toEqual(expect.any(String))

    const restCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/models'),
    )
    const requestUrl = new URL(String(restCall?.[0]))
    expect(requestUrl.searchParams.get('limit')).toBe('40')
    expect(requestUrl.searchParams.get('query')).toBe('鸣潮')
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual([
      'Illustrious',
      'NoobAI',
    ])
  })

  it('continues sparse searched base model pages until the logical page is full', async () => {
    const versionFor = (id: number) => ({
      id,
      name: 'v1',
      baseModel: 'Anima',
      files: [
        {
          type: 'Model',
          primary: true,
          downloadUrl: `https://civitai.com/api/download/models/${id}`,
        },
      ],
      trainedWords: [`trigger-${id}`],
    })
    const modelFor = (id: number) => ({
      id,
      name: `Wuthering Waves Anima ${id}`,
      type: 'LORA',
      modelVersions: [versionFor(id + 100)],
    })
    const pages = new Map<
      string | null,
      { ids: number[]; next: string | null }
    >([
      [null, { ids: [1], next: 'cursor-1' }],
      ['cursor-1', { ids: [2, 3], next: 'cursor-2' }],
      ['cursor-2', { ids: [], next: 'cursor-3' }],
      ['cursor-3', { ids: [4], next: 'cursor-4' }],
      ['cursor-4', { ids: [5, 6], next: 'cursor-5' }],
      ['cursor-5', { ids: [7, 8, 9, 10, 11], next: 'cursor-6' }],
    ])

    // B11: fail meilisearch first (+1 call) so this falls through to the
    // REST scan path under test.
    mockFetch.mockImplementation(async (input) => {
      if (String(input).includes('search-new.civitai.com')) {
        return jsonResponse({ message: 'down' }, 503)
      }
      const cursor = new URL(String(input)).searchParams.get('cursor')
      const page = pages.get(cursor)
      if (!page) throw new Error(`Unexpected cursor: ${cursor}`)
      return jsonResponse({
        items: page.ids.map(modelFor),
        metadata: { nextCursor: page.next },
      })
    })

    const result = await listCivitaiLoras({
      baseModel: 'Anima',
      pageSize: 10,
      search: '鸣潮',
      sort: 'Newest',
    })

    expect(result.items).toHaveLength(10)
    expect(result.items.map((item) => item.name)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `Wuthering Waves Anima ${index + 1}`,
      ),
    )
    expect(result.hasNextPage).toBe(true)
    expect(result.nextCursor).toEqual(expect.any(String))
    expect(mockFetch).toHaveBeenCalledTimes(7)
  })

  it('preserves a continuation when sparse search reaches the scan safety limit', async () => {
    const versionFor = (id: number) => ({
      id,
      name: 'v1',
      baseModel: 'Anima',
      files: [
        {
          type: 'Model',
          primary: true,
          downloadUrl: `https://civitai.com/api/download/models/${id}`,
        },
      ],
      trainedWords: [`trigger-${id}`],
    })
    const modelFor = (id: number) => ({
      id,
      name: `Sparse Anima ${id}`,
      type: 'LORA',
      modelVersions: [versionFor(id + 200)],
    })
    const sparseIds = [[1], [2], [], [3], [], [4], [], [5], [], [6]]
    const pages = new Map<
      string | null,
      { ids: number[]; next: string | null }
    >()

    sparseIds.forEach((ids, index) => {
      pages.set(index === 0 ? null : `cursor-${index}`, {
        ids,
        next: `cursor-${index + 1}`,
      })
    })
    pages.set('cursor-10', { ids: [7, 8, 9, 10, 11], next: null })

    // B11: fail meilisearch first (+1 call per listCivitaiLoras invocation)
    // so both pages fall through to the REST scan path under test.
    mockFetch.mockImplementation(async (input) => {
      if (String(input).includes('search-new.civitai.com')) {
        return jsonResponse({ message: 'down' }, 503)
      }
      const cursor = new URL(String(input)).searchParams.get('cursor')
      const page = pages.get(cursor)
      if (!page) throw new Error(`Unexpected cursor: ${cursor}`)
      return jsonResponse({
        items: page.ids.map(modelFor),
        metadata: { nextCursor: page.next },
      })
    })

    const firstPage = await listCivitaiLoras({
      baseModel: 'Anima',
      pageSize: 10,
      search: '鸣潮',
      sort: 'Newest',
    })

    expect(firstPage.items.map((item) => item.name)).toEqual(
      Array.from({ length: 6 }, (_, index) => `Sparse Anima ${index + 1}`),
    )
    expect(firstPage.hasNextPage).toBe(true)
    expect(firstPage.nextCursor).toEqual(expect.any(String))
    expect(mockFetch).toHaveBeenCalledTimes(11)

    const secondPage = await listCivitaiLoras({
      baseModel: 'Anima',
      cursor: firstPage.nextCursor,
      page: 2,
      pageSize: 10,
      search: '鸣潮',
      sort: 'Newest',
    })

    expect(secondPage.items.map((item) => item.name)).toEqual(
      Array.from({ length: 5 }, (_, index) => `Sparse Anima ${index + 7}`),
    )
    expect(secondPage.hasNextPage).toBe(false)
    expect(secondPage.nextCursor).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(13)
  })

  it('forwards Civitai license fields to library items', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 9,
            name: 'Licensed LoRA',
            type: 'LORA',
            allowCommercialUse: ['Image', 'Rent', 'Sell'],
            allowDerivatives: true,
            modelVersions: [
              {
                id: 99,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/99',
                  },
                ],
              },
            ],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items[0]).toMatchObject({
      allowCommercialUse: ['Image', 'Rent', 'Sell'],
      allowDerivatives: true,
    })
  })

  it('parses Civitai PostgreSQL array literal allowCommercialUse strings', async () => {
    // Civitai's REAL response shape — PG array literal, not JSON array.
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 11,
            name: 'PG-literal LoRA',
            type: 'LORA',
            allowCommercialUse: '{Image,RentCivit,Rent}',
            allowDerivatives: true,
            modelVersions: [
              {
                id: 111,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/111',
                  },
                ],
              },
            ],
          },
          {
            id: 12,
            name: 'Empty PG-literal LoRA',
            type: 'LORA',
            allowCommercialUse: '{}',
            allowDerivatives: false,
            modelVersions: [
              {
                id: 112,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/112',
                  },
                ],
              },
            ],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items[0]?.allowCommercialUse).toEqual([
      'Image',
      'RentCivit',
      'Rent',
    ])
    expect(result.items[1]?.allowCommercialUse).toEqual([])
  })

  it('defaults license fields when Civitai omits them', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 10,
            name: 'No License Info',
            type: 'LORA',
            modelVersions: [
              {
                id: 100,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/100',
                  },
                ],
              },
            ],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items[0]).toMatchObject({
      allowCommercialUse: [],
      allowDerivatives: false,
    })
  })

  it('prewarms the first page for every base model and sort combination', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          items: [],
          metadata: { nextCursor: 'cursor-next' },
        }),
      ),
    )

    const result = await prewarmCivitaiLoraLibrary()
    // 'other' 兜底桶被排除在预热外（REST 补集只能多页扫描，成本不值）。
    const expectedTotal =
      CIVITAI_LORA_BASE_MODEL_VALUES.filter((value) => value !== 'other')
        .length * CIVITAI_LORA_SORT_VALUES.length

    expect(result.total).toBe(expectedTotal)
    expect(result.successCount).toBe(expectedTotal)
    expect(result.failureCount).toBe(0)
    expect(mockFetch).toHaveBeenCalledTimes(expectedTotal)

    const urls = mockFetch.mock.calls.map((call) => new URL(String(call[0])))
    expect(
      urls.some(
        (url) =>
          url.searchParams.get('sort') === 'Newest' &&
          url.searchParams.get('baseModels') === null,
      ),
    ).toBe(true)
    expect(
      urls.some(
        (url) =>
          url.searchParams.get('sort') === 'Most Downloaded' &&
          url.searchParams.getAll('baseModels').includes('Illustrious') &&
          url.searchParams.getAll('baseModels').includes('NoobAI'),
      ),
    ).toBe(true)
  })

  it('skips LoRA entries without a downloadable model version', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 1,
            name: 'No file',
            type: 'LORA',
            modelVersions: [{ id: 2, name: 'v1' }],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items).toEqual([])
  })

  it('throws when Civitai returns a non-OK response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'rate limited' }, 429))

    await expect(listCivitaiLoras()).rejects.toThrow(/429/)
  })

  it('times out slow Civitai responses', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>(() => {
          // Intentionally unresolved: the service-level timeout should win.
        }),
    )

    const promise = expect(listCivitaiLoras()).rejects.toThrow(/timed out/)
    // Run all pending fake timers (8s service timeout + withRetry's backoff
    // delays between retries). Using runAllTimersAsync instead of a single
    // advanceTimersByTimeAsync(8000) so we don't have to predict the exact
    // schedule across multiple retry attempts.
    await vi.runAllTimersAsync()
    await promise
  })

  // P1-6（2026-07-04 三态；2026-07-06 默认改回 safe）：safe（默认，civitai
  // `nsfw=false` + 名称词表兜底）/ unrestricted（不过滤）/ nsfwOnly（civitai
  // `nsfw=true` + 只留 `model.nsfw` 标记为真的条目）。三个 fixture 条目分别
  // 只踩中其中一种信号，用来确认两种客户端过滤各自只认自己的信号，不互相误判。
  function nsfwFilterFixture() {
    function modelFor(id: number, name: string, nsfw: boolean) {
      return {
        id,
        name,
        type: 'LORA',
        tags: [],
        stats: {},
        nsfw,
        modelVersions: [
          {
            id: id * 10,
            name: 'v1',
            baseModel: 'SDXL 1.0',
            files: [
              {
                type: 'Model',
                primary: true,
                downloadUrl: `https://civitai.com/api/download/models/${id * 10}`,
              },
            ],
            images: [],
            stats: {},
          },
        ],
      }
    }

    return {
      items: [
        modelFor(1, 'Clean Style LoRA', false),
        // Name-keyword hit, but civitai's own model.nsfw flag is false —
        // only the 'safe' mode's name-keyword filter should catch this one.
        modelFor(2, 'Hentai Style LoRA', false),
        // civitai model.nsfw flag is true, but the name gives no hint —
        // only the 'nsfwOnly' mode's isNsfw filter should catch this one.
        modelFor(3, 'Realistic Lingerie LoRA', true),
      ],
      metadata: { totalItems: 3 },
    }
  }

  it('defaults to nsfwFilter=safe: requests nsfw=false and name-filters NSFW models', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(nsfwFilterFixture()))

    const result = await listCivitaiLoras()

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('nsfw')).toBe('false')
    // 默认 safe：名称词表命中的 'Hentai Style LoRA' 被过滤；civitai-nsfw 标记
    // 为真但名字无害的 'Realistic Lingerie LoRA' 仍留（safe 只认名称信号）。
    expect(result.items.map((item) => item.name)).toEqual([
      'Clean Style LoRA',
      'Realistic Lingerie LoRA',
    ])
  })

  it('nsfwFilter=safe requests nsfw=false and filters NSFW-named models by keyword', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(nsfwFilterFixture()))

    const result = await listCivitaiLoras({ nsfwFilter: 'safe' })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('nsfw')).toBe('false')
    // Keeps the civitai-nsfw-flagged-but-innocuous-named model — the safe
    // filter only knows about the name-keyword signal, not model.nsfw.
    expect(result.items.map((item) => item.name)).toEqual([
      'Clean Style LoRA',
      'Realistic Lingerie LoRA',
    ])
  })

  it('nsfwFilter=nsfwOnly requests nsfw=true and keeps only civitai-flagged NSFW models', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(nsfwFilterFixture()))

    const result = await listCivitaiLoras({ nsfwFilter: 'nsfwOnly' })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('nsfw')).toBe('true')
    // Excludes the NSFW-named-but-civitai-flagged-safe model — nsfwOnly
    // only trusts the real model.nsfw signal, not the name.
    expect(result.items.map((item) => item.name)).toEqual([
      'Realistic Lingerie LoRA',
    ])
  })

  // Issue B: live-verified real-world case (2026-07-11, query "girl") — a
  // model with nsfwLevel:[16] (XXX-only images) was flagged `nsfw:false` by
  // civitai itself. Under the old REST-path logic (nsfwOnly trusted only
  // `item.isNsfw`) this would never surface in nsfwOnly AND would leak into
  // safe (only the name-keyword filter applied). The new image-level signal
  // fixes both without needing civitai's bool to be correct.
  it('catches an nsfw-bool-false-but-image-level-high LoRA via the level signal (REST path)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 65407,
            name: 'girl handjob POV',
            type: 'LORA',
            tags: [],
            nsfw: false,
            modelVersions: [
              {
                id: 654070,
                name: 'v1',
                baseModel: 'SDXL 1.0',
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl:
                      'https://civitai.com/api/download/models/654070',
                  },
                ],
                images: [
                  { url: 'https://image.civitai.com/xxx.jpeg', nsfwLevel: 16 },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )
    const safeResult = await listCivitaiLoras({ nsfwFilter: 'safe' })
    expect(safeResult.items).toEqual([])

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 65407,
            name: 'girl handjob POV',
            type: 'LORA',
            tags: [],
            nsfw: false,
            modelVersions: [
              {
                id: 654070,
                name: 'v1',
                baseModel: 'SDXL 1.0',
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl:
                      'https://civitai.com/api/download/models/654070',
                  },
                ],
                images: [
                  { url: 'https://image.civitai.com/xxx.jpeg', nsfwLevel: 16 },
                ],
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      }),
    )
    const nsfwOnlyResult = await listCivitaiLoras({ nsfwFilter: 'nsfwOnly' })
    expect(nsfwOnlyResult.items).toHaveLength(1)
  })
})

// P1-11/B11: REST `/api/v1/models` silently ignores `sort` once a `query`
// is present (confirmed against the real endpoint + civitai/civitai#1848).
// Search now goes through civitai's own meilisearch endpoint instead, which
// has a completely different hit shape (no files/downloadUrl at all —
// confirmed via a live curl during implementation) and needs an extra
// per-hit request to recover the download link.
describe('listCivitaiLoras — B11 meilisearch search path', () => {
  function searchHitFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: 1277664,
      name: 'Cantarella LoRA',
      type: 'LORA',
      nsfw: false,
      createdAt: '2025-02-21T03:23:32.151Z',
      metrics: { downloadCount: 5380, thumbsUpCount: 633 },
      user: { username: 'wiehhg_37', image: null },
      permissions: {
        allowCommercialUse: ['RentCivit', 'Rent'],
        allowDerivatives: false,
      },
      tags: [{ name: 'wuthering waves' }, { name: 'character' }],
      images: [
        {
          id: 59589204,
          url: '2dfde10e-6245-4a6b-be7d-5888a72dacd0',
          // <=2 so pickImages-equivalent filtering keeps it as the cover —
          // matches the existing REST-path image-safety threshold.
          nsfwLevel: 1,
        },
      ],
      version: {
        id: 1451120,
        name: 'Illustrious&noob_1.0',
        baseModel: 'Illustrious',
        trainedWords: ['Cantarella'],
        metrics: { downloadCount: 5137, thumbsUpCount: 617 },
        createdAt: '2025-02-23T09:33:50.194Z',
      },
      versions: [],
      ...overrides,
    }
  }

  function multiSearchResponse(
    hits: unknown[],
    estimatedTotalHits = hits.length,
  ) {
    return { results: [{ hits, estimatedTotalHits }] }
  }

  function versionDownloadResponse(versionId: number, downloadUrl: string) {
    return {
      id: versionId,
      name: 'v1',
      baseModel: 'Illustrious',
      downloadUrl,
      files: [{ type: 'Model', primary: true, downloadUrl }],
      modelId: 1277664,
      model: { name: 'Cantarella LoRA', type: 'LORA' },
    }
  }

  // Routes fetch calls by URL: multi-search POST vs per-version GET.
  function mockSearchAndVersionFetch(searchBody: unknown, searchStatus = 200) {
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('search-new.civitai.com')) {
        return jsonResponse(searchBody, searchStatus)
      }
      const match = url.match(/model-versions\/(\d+)/)
      const versionId = match ? Number(match[1]) : 0
      return jsonResponse(
        versionDownloadResponse(
          versionId,
          `https://civitai.com/api/download/models/${versionId}`,
        ),
      )
    })
  }

  it('routes non-empty search queries to meilisearch, not the REST models endpoint', async () => {
    mockSearchAndVersionFetch(multiSearchResponse([searchHitFixture()]))

    await listCivitaiLoras({ search: '鸣潮', sort: 'Most Downloaded' })

    const searchCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('search-new.civitai.com'),
    )
    expect(searchCall).toBeDefined()
    const init = searchCall?.[1] as RequestInit
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body.queries[0].q).toBe('鸣潮')
    expect(body.queries[0].sort).toEqual(['metrics.downloadCount:desc'])
  })

  it.each([
    ['Highest Rated', undefined],
    ['Most Downloaded', ['metrics.downloadCount:desc']],
    ['Newest', ['createdAt:desc']],
  ] as const)(
    'maps sort=%s to the meilisearch sort field %j',
    async (sort, expected) => {
      mockSearchAndVersionFetch(multiSearchResponse([searchHitFixture()]))

      await listCivitaiLoras({ search: 'detail', sort })

      const searchCall = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes('search-new.civitai.com'),
      )
      const body = JSON.parse(String((searchCall?.[1] as RequestInit).body))
      expect(body.queries[0].sort).toEqual(expected)
    },
  )

  it('maps a meilisearch hit into a full library item, reconstructing the cover URL from the CDN bucket', async () => {
    mockSearchAndVersionFetch(multiSearchResponse([searchHitFixture()]))

    const result = await listCivitaiLoras({ search: 'Cantarella' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'civitai:1277664:1451120',
      name: 'Cantarella LoRA',
      baseModelFamily: 'Illustrious',
      loraUrl: 'https://civitai.com/api/download/models/1451120',
      creatorName: 'wiehhg_37',
      downloadCount: 5137,
      thumbsUpCount: 617,
      allowCommercialUse: ['RentCivit', 'Rent'],
      allowDerivatives: false,
      isNsfw: false,
      tags: ['wuthering waves', 'character'],
    })
    expect(result.items[0]?.coverImageUrl).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/2dfde10e-6245-4a6b-be7d-5888a72dacd0/width=640,optimized=true/59589204.jpeg',
    )
  })

  it('computes the meilisearch offset from the requested page number', async () => {
    mockSearchAndVersionFetch(multiSearchResponse([searchHitFixture()], 100))

    await listCivitaiLoras({ search: 'detail', page: 3, pageSize: 12 })

    const searchCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('search-new.civitai.com'),
    )
    const body = JSON.parse(String((searchCall?.[1] as RequestInit).body))
    expect(body.queries[0].offset).toBe(24)
    expect(body.queries[0].limit).toBe(12)
  })

  it('derives hasNextPage from estimatedTotalHits', async () => {
    mockSearchAndVersionFetch(multiSearchResponse([searchHitFixture()], 50))

    const result = await listCivitaiLoras({
      search: 'detail',
      page: 1,
      pageSize: 12,
    })

    // offset(0) + hits.length(1) = 1 < estimatedTotalHits(50)
    expect(result.hasNextPage).toBe(true)
    expect(result.total).toBe(50)
  })

  it('falls back to the REST search path when meilisearch fails, and flags sortFellBackToRelevance', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('search-new.civitai.com')) {
        return jsonResponse({ message: 'down' }, 503)
      }
      // REST fallback path (models?query=...) — return a normal REST payload.
      return jsonResponse({
        items: [
          {
            id: 1,
            name: 'Fallback Result',
            type: 'LORA',
            tags: [],
            stats: {},
            modelVersions: [
              {
                id: 10,
                name: 'v1',
                baseModel: 'SDXL 1.0',
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/10',
                  },
                ],
                images: [],
                stats: {},
              },
            ],
          },
        ],
        metadata: { totalItems: 1 },
      })
    })

    const result = await listCivitaiLoras({ search: 'detail' })

    expect(result.sortFellBackToRelevance).toBe(true)
    expect(result.items.map((item) => item.name)).toEqual(['Fallback Result'])
    // REST fallback really was hit (not just an empty/errored result).
    const restCall = mockFetch.mock.calls.find(
      (call) =>
        String(call[0]).includes('/api/v1/models') &&
        !String(call[0]).includes('model-versions'),
    )
    expect(restCall).toBeDefined()
  })

  it('search mode keeps the safe name-keyword client filter on hits', async () => {
    // safe only trusts the name-keyword signal client-side; the nsfwLevel
    // ceiling is enforced upstream by the meilisearch source filter (see the
    // 'pushes the nsfw tri-state down into the meilisearch filter clause'
    // test below), not by re-inspecting `hit.images` here.
    const cleanHit = searchHitFixture({
      id: 1,
      name: 'Clean Search Hit',
      nsfw: false,
      version: { ...searchHitFixture().version, id: 101 },
    })
    const nameFlaggedHit = searchHitFixture({
      id: 2,
      name: 'Hentai Search Hit',
      nsfw: false,
      version: { ...searchHitFixture().version, id: 102 },
    })
    const civitaiFlaggedHit = searchHitFixture({
      id: 3,
      name: 'Innocuous Search Hit',
      nsfw: true,
      version: { ...searchHitFixture().version, id: 103 },
    })
    const hits = [cleanHit, nameFlaggedHit, civitaiFlaggedHit]

    mockSearchAndVersionFetch(multiSearchResponse(hits))
    const safeResult = await listCivitaiLoras({
      search: 'x',
      nsfwFilter: 'safe',
    })
    expect(safeResult.items.map((i) => i.name)).toEqual([
      'Clean Search Hit',
      'Innocuous Search Hit',
    ])
  })

  // Issue B fix: nsfwOnly no longer re-filters by `hit.nsfw` client-side —
  // that boolean is unreliable (live-verified false negatives) and doing so
  // was exactly what shrank a fetched page of ~12 down to ~6 (the reported
  // "每页只出几张" symptom). The source filter (asserted below) now does the
  // real narrowing, so every hit the mocked transport returns must survive
  // to `items` unchanged, regardless of its `nsfw` bool.
  it('search mode trusts the nsfwOnly source filter and does not re-narrow hits client-side', async () => {
    const hits = [
      searchHitFixture({
        id: 1,
        name: 'Bool True Hit',
        nsfw: true,
        version: { ...searchHitFixture().version, id: 101 },
      }),
      // Mirrors the live-verified "girl handjob POV" case: nsfwLevel says
      // NSFW but civitai's own bool says false. Must still come through —
      // proves nsfwOnly isn't quietly re-applying the unreliable bool.
      searchHitFixture({
        id: 2,
        name: 'Bool False Hit',
        nsfw: false,
        version: { ...searchHitFixture().version, id: 102 },
      }),
    ]

    mockSearchAndVersionFetch(multiSearchResponse(hits))
    const result = await listCivitaiLoras({
      search: 'x',
      nsfwFilter: 'nsfwOnly',
    })

    expect(result.items.map((i) => i.name)).toEqual([
      'Bool True Hit',
      'Bool False Hit',
    ])
  })

  // Issue B: the actual narrowing mechanism — the tri-state now travels as
  // a meilisearch filter clause on the array `nsfwLevel` attribute, not a
  // client-side post-filter. Threshold 2 matches
  // CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL (the existing "safe cover"
  // ceiling elsewhere in this file) so safe/nsfwOnly stay exact complements.
  it.each([
    ['safe', 'NOT nsfwLevel > 2'],
    ['nsfwOnly', 'nsfwLevel > 2'],
  ] as const)(
    'pushes the nsfw tri-state down into the meilisearch filter clause for %s',
    async (nsfwFilter, expectedClause) => {
      mockSearchAndVersionFetch(multiSearchResponse([searchHitFixture()]))

      await listCivitaiLoras({ search: 'x', nsfwFilter })

      const searchCall = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes('search-new.civitai.com'),
      )
      const body = JSON.parse(String((searchCall?.[1] as RequestInit).body))
      expect(body.queries[0].filter).toEqual(['type = LoRA', expectedClause])
    },
  )

  it('adds no nsfw filter clause for unrestricted', async () => {
    mockSearchAndVersionFetch(multiSearchResponse([searchHitFixture()]))

    await listCivitaiLoras({ search: 'x', nsfwFilter: 'unrestricted' })

    const searchCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('search-new.civitai.com'),
    )
    const body = JSON.parse(String((searchCall?.[1] as RequestInit).body))
    expect(body.queries[0].filter).toEqual(['type = LoRA'])
  })

  // Issue C (docs/plans/lora-search-image-audit-2026-07.md): the client
  // (useCivitaiLoraLibrary) locks onto a backend after page 1 and passes it
  // back as `source` on subsequent pages so the session never silently
  // swaps between meilisearch's offset pagination and REST's cursor-scan
  // pagination mid-flight (that swap is what caused duplicate/misaligned
  // pages).
  describe('source-locked backend (Issue C)', () => {
    it('source=rest skips meilisearch entirely and goes straight to REST', async () => {
      mockFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('search-new.civitai.com')) {
          throw new Error('meilisearch must not be called when source=rest')
        }
        return jsonResponse({
          items: [
            {
              id: 1,
              name: 'Locked REST Result',
              type: 'LORA',
              tags: [],
              stats: {},
              modelVersions: [
                {
                  id: 10,
                  name: 'v1',
                  baseModel: 'SDXL 1.0',
                  files: [
                    {
                      type: 'Model',
                      primary: true,
                      downloadUrl: 'https://civitai.com/api/download/models/10',
                    },
                  ],
                  images: [],
                  stats: {},
                },
              ],
            },
          ],
          metadata: { totalItems: 1 },
        })
      })

      const result = await listCivitaiLoras({
        search: 'detail',
        page: 2,
        source: 'rest',
      })

      expect(result.sortFellBackToRelevance).toBe(true)
      expect(result.items.map((item) => item.name)).toEqual([
        'Locked REST Result',
      ])
      const searchCall = mockFetch.mock.calls.find((call) =>
        String(call[0]).includes('search-new.civitai.com'),
      )
      expect(searchCall).toBeUndefined()
    })

    it('source=meilisearch surfaces the error instead of silently falling back to REST', async () => {
      mockFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('search-new.civitai.com')) {
          return jsonResponse({ message: 'down' }, 503)
        }
        throw new Error('REST must not be called when source=meilisearch')
      })

      await expect(
        listCivitaiLoras({ search: 'detail', page: 3, source: 'meilisearch' }),
      ).rejects.toThrow()

      const restCall = mockFetch.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/v1/models') &&
          !String(call[0]).includes('model-versions'),
      )
      expect(restCall).toBeUndefined()
    })

    it('with no source (first page / unlocked), still falls back to REST on meilisearch failure — existing behavior preserved', async () => {
      mockFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('search-new.civitai.com')) {
          return jsonResponse({ message: 'down' }, 503)
        }
        return jsonResponse({
          items: [
            {
              id: 1,
              name: 'Unlocked Fallback',
              type: 'LORA',
              tags: [],
              stats: {},
              modelVersions: [
                {
                  id: 10,
                  name: 'v1',
                  baseModel: 'SDXL 1.0',
                  files: [
                    {
                      type: 'Model',
                      primary: true,
                      downloadUrl: 'https://civitai.com/api/download/models/10',
                    },
                  ],
                  images: [],
                  stats: {},
                },
              ],
            },
          ],
          metadata: { totalItems: 1 },
        })
      })

      const result = await listCivitaiLoras({ search: 'detail' })

      expect(result.sortFellBackToRelevance).toBe(true)
      expect(result.items.map((item) => item.name)).toEqual([
        'Unlocked Fallback',
      ])
    })
  })
})

describe('resolveCivitaiModelPageUrlByVersion', () => {
  it('resolves a concrete Civitai model page from a model version id', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2819970,
        modelId: 2508748,
        model: {
          name: '鸣潮 (Wuthering Waves) || 娜波摩 (Nivora)',
          type: 'LORA',
        },
      }),
    )

    const result = await resolveCivitaiModelPageUrlByVersion(2819970)

    expect(result).toBe(
      'https://civitai.com/models/2508748?modelVersionId=2819970',
    )
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe(
      'https://civitai.com/api/v1/model-versions/2819970',
    )
  })

  it('falls back to nested model.id when modelId is omitted', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2819970,
        model: { id: 2508748 },
      }),
    )

    await expect(resolveCivitaiModelPageUrlByVersion(2819970)).resolves.toBe(
      'https://civitai.com/models/2508748?modelVersionId=2819970',
    )
  })

  it('returns null when Civitai omits the owning model id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 2819970, model: {} }))

    await expect(resolveCivitaiModelPageUrlByVersion(2819970)).resolves.toBe(
      null,
    )
  })
})

describe('mineCivitaiUserPrompts', () => {
  it('prefers model-version source image prompts over the community images endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2819970,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/source-1.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 1,
            meta: {
              prompt:
                'simple background, <lora:NivoraV1-Nuclear1811-IL:0.85>, Nivora, turquoise eyes, 2d style',
              negativePrompt: '3d, realistic',
              seed: 1234567890,
              steps: 28,
              cfgScale: 6.5,
              sampler: 'DPM++ 2M Karras',
              'Clip skip': '2',
              Size: '832x1216',
              Model: 'Illustrious-XL-v1.0',
              resources: [
                {
                  hash: '7353E384259C',
                  name: 'NivoraV1-Nuclear1811-IL',
                  type: 'lora',
                  weight: 0.85,
                },
                { name: 'detail-tweaker-xl', type: 'lora', weight: 0.4 },
              ],
            },
          },
          {
            url: 'https://image.civitai.com/source-2.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt:
                'portrait, <lora:NivoraV1-Nuclear1811-IL:0.85>, Nivora, fur hood, anime illustration',
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 2508748,
      modelVersionId: 2819970,
      fileHashAutoV3: '7353e384259c',
    })

    expect(result.outfits).toHaveLength(2)
    expect(result.outfits[0]?.label).toBe('')
    expect(result.outfits[0]?.source).toBe('model_version_image')
    expect(result.outfits[0]?.prompt).toBe(
      'simple background, Nivora, turquoise eyes, 2d style',
    )
    expect(result.outfits[1]?.source).toBe('model_version_image')
    expect(result.totalSampled).toBe(2)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Per-image recipes pair the image URL with the FULL generation params
    // (hash matching is case-insensitive) and surface stacked extra LoRAs.
    expect(result.recipes).toHaveLength(2)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/source-1.jpeg',
      width: 832,
      height: 1216,
      source: 'model_version_image',
      negativePrompt: '3d, realistic',
      seed: 1234567890,
      steps: 28,
      cfgScale: 6.5,
      sampler: 'DPM++ 2M Karras',
      clipSkip: 2,
      sizeRaw: '832x1216',
      checkpoint: 'Illustrious-XL-v1.0',
      loraWeight: 0.85,
      extraLoras: [{ name: 'detail-tweaker-xl', weight: 0.4 }],
    })
    // Second image has bare meta (no resources) — recipe still exists, and
    // the weight is recovered from its single in-prompt `<lora:..:0.85>` tag.
    expect(result.recipes?.[1]).toMatchObject({
      imageUrl: 'https://image.civitai.com/source-2.jpeg',
      source: 'model_version_image',
      loraWeight: 0.85,
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/model-versions/2819970')
  })

  it('mines source recipes from NSFW (XXX) model-version images', async () => {
    // hentai LoRA "一键同款"：来源图全是 XXX（nsfwLevel 16）。放开天花板后
    // 这些图仍应产出配方，而不是被过滤成 0 → 空态。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 3001,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/nsfw-source.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 16,
            meta: {
              prompt: '<lora:ExpressiveH:0.8>, expressiveh, 1girl',
              resources: [
                {
                  hash: 'ABCDEF123456',
                  name: 'ExpressiveH',
                  type: 'lora',
                  weight: 0.8,
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 3000,
      modelVersionId: 3001,
      fileHashAutoV3: 'abcdef123456',
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/nsfw-source.jpeg',
      source: 'model_version_image',
      loraWeight: 0.8,
    })
    // 只打了 model-versions 一次——source-image 命中就不再回落 community。
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('clusters real activation segments from /api/v1/images by hash', async () => {
    // Two c1-outfit generations + one c2-outfit, mirroring the actual
    // wuthering-waves Denia shape. Hash comparison is case-insensitive
    // (Civitai uppercases AutoV3 in `version.files` but lowercases it
    // in image `meta.resources`).
    const FILE_HASH = '7353e384259c'
    const LORA_NAME = 'DeniaV1-Nuclear1811-IL'
    const c1Prompt = `intro tokens,\n<lora:${LORA_NAME}:0.9>,purple eyes,pink hair,c1,white dress,2d style,\nfull body,pose`
    const c2Prompt = `intro tokens,\n<lora:${LORA_NAME}:0.9>,black halo,purple eyes,c2,black dress,2d style,\nfull body,pose`

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2975273,
        name: 'v1',
        images: [],
      }),
    )
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            url: 'https://image.civitai.com/community-1.jpeg',
            width: 512,
            height: 768,
            meta: {
              meta: {
                prompt: c1Prompt,
                resources: [
                  {
                    hash: FILE_HASH.toUpperCase(),
                    name: LORA_NAME,
                    type: 'lora',
                    weight: 0.9,
                  },
                ],
              },
            },
          },
          {
            id: 2,
            url: 'https://image.civitai.com/community-2.jpeg',
            meta: {
              meta: {
                prompt: c1Prompt,
                resources: [{ hash: FILE_HASH, name: LORA_NAME, type: 'lora' }],
              },
            },
          },
          {
            id: 3,
            meta: {
              meta: {
                prompt: c2Prompt,
                resources: [{ hash: FILE_HASH, name: LORA_NAME, type: 'lora' }],
              },
            },
          },
          // Noise: a generation that doesn't reference our LoRA — must
          // be ignored without crashing.
          { id: 4, meta: { meta: { prompt: 'no lora here', resources: [] } } },
          // Noise: missing meta entirely.
          { id: 5, meta: null },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 2649729,
      modelVersionId: 2975273,
      fileHashAutoV3: FILE_HASH,
    })

    // Two outfit clusters surfaced (c1 = 2 samples, c2 = 1)
    expect(result.outfits).toHaveLength(2)
    expect(result.outfits[0]?.label).toBe('')
    expect(result.outfits[0]?.source).toBe('community_image')
    expect(result.outfits[0]?.sampleCount).toBe(2)
    expect(result.outfits[0]?.prompt).toContain('c1')
    expect(result.outfits[1]?.sampleCount).toBe(1)
    expect(result.outfits[1]?.prompt).toContain('c2')
    // totalSampled counts every image with usable meta.prompt — the
    // 4-with-no-resources is still "considered", the 5-with-null-meta
    // is not.
    expect(result.totalSampled).toBe(4)

    // Community recipes: only hash-matched images WITH a url (items 1+2;
    // item 3 has no url, items 4+5 don't reference the LoRA). Full prompt
    // (lora tag stripped), real weight from resources.
    expect(result.recipes).toHaveLength(2)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/community-1.jpeg',
      width: 512,
      height: 768,
      source: 'community_image',
      loraWeight: 0.9,
    })
    expect(result.recipes?.[0]?.prompt).toContain('c1')
    expect(result.recipes?.[0]?.prompt).not.toContain('<lora:')

    // Verify the API was called with the right query params: version id
    // only (no modelId — Cloudflare timeout risk), withMeta=true (without
    // it meta is always null), browsingLevel instead of legacy nsfw.
    const requestUrl = new URL(String(mockFetch.mock.calls[1]?.[0]))
    expect(requestUrl.searchParams.get('modelId')).toBeNull()
    expect(requestUrl.searchParams.get('modelVersionId')).toBe('2975273')
    expect(requestUrl.searchParams.get('withMeta')).toBe('true')
    // 31 = 放开到 XXX（仍挡 Blocked），让 NSFW LoRA 的社区配方也进入挖掘。
    expect(requestUrl.searchParams.get('browsingLevel')).toBe('31')
    expect(requestUrl.searchParams.get('nsfw')).toBeNull()
    expect(requestUrl.searchParams.get('sort')).toBe('Most Reactions')
  })

  it('handles the single-layer meta variant Civitai returns when modelVersionId+sort are set', async () => {
    // /api/v1/images with `modelId&modelVersionId&sort=Most Reactions`
    // returns `meta.{prompt,resources}` flat — not nested under
    // `meta.meta`. Service must accept both shapes.
    const FILE_HASH = 'abc123def456'
    const LORA_NAME = 'TestLoRA'
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            meta: {
              prompt: `<lora:${LORA_NAME}:1>,trigger_word,1girl`,
              resources: [{ hash: FILE_HASH, name: LORA_NAME, type: 'lora' }],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 1,
      fileHashAutoV3: FILE_HASH,
    })
    expect(result.outfits).toHaveLength(1)
    expect(result.outfits[0]?.prompt).toBe('trigger_word, 1girl')
    expect(result.totalSampled).toBe(1)

    // Legacy favorites without a version id fall back to modelId — the
    // meta/browsing params must still be present.
    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('modelId')).toBe('1')
    expect(requestUrl.searchParams.get('modelVersionId')).toBeNull()
    expect(requestUrl.searchParams.get('withMeta')).toBe('true')
    expect(requestUrl.searchParams.get('browsingLevel')).toBe('31')
  })

  it('returns empty outfits without crashing when no generation references the LoRA', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            meta: {
              meta: {
                prompt: 'just a generic prompt, 1girl',
                resources: [],
              },
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 999,
      fileHashAutoV3: 'deadbeef',
    })
    expect(result.outfits).toEqual([])
    expect(result.recipes).toEqual([])
    expect(result.totalSampled).toBe(1)
  })

  it('recovers lora weight from the prompt tag when resources only list the checkpoint', async () => {
    // Live-verified shape (Detail Tweaker XL source images): resources has
    // ONLY the checkpoint; the LoRA weight lives in the in-prompt tag.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 135867,
        name: 'v1',
        files: [
          { type: 'Model', primary: true, name: 'add-detail-xl.safetensors' },
        ],
        images: [
          {
            url: 'https://image.civitai.com/source-tag.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt:
                'photo, 8k portrait, intricate, elegant, <lora:add-detail-xl:0.8>',
              resources: [
                { hash: '82b5f664ae', name: 'dreamshaperXL10', type: 'model' },
              ],
            },
          },
          {
            url: 'https://image.civitai.com/source-multitag.jpeg',
            nsfwLevel: 1,
            meta: {
              // Multi-tag prompt: ours is identified by the file-name stem;
              // the other tag becomes an extra (fidelity warning).
              prompt:
                '1girl, <lora:add-detail-xl:0.6>, <lora:other-style:0.5>, scenery',
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 122359,
      modelVersionId: 135867,
      fileHashAutoV3: '9c783c8ce46c',
    })

    expect(result.recipes?.[0]?.loraWeight).toBe(0.8)
    expect(result.recipes?.[0]?.extraLoras).toBeUndefined()
    expect(result.recipes?.[1]?.loraWeight).toBe(0.6)
    expect(result.recipes?.[1]?.extraLoras).toEqual([
      { name: 'other-style', weight: 0.5 },
    ])
  })

  it('recovers lora weight from civitaiResources by modelVersionId (onsite generations)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 555,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/onsite.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt: 'masterpiece, 1girl, white dress',
              civitaiResources: [
                { type: 'checkpoint', modelVersionId: 999999 },
                { type: 'lora', weight: 0.75, modelVersionId: 555 },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 444,
      modelVersionId: 555,
      fileHashAutoV3: 'deadbeef0000',
    })

    expect(result.recipes?.[0]?.loraWeight).toBe(0.75)
    expect(result.recipes?.[0]?.extraLoras).toBeUndefined()
  })

  it('extras carry their locators (hash / modelVersionId) for one-tap mounting', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 555,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/stacked.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt: 'masterpiece, 1girl',
              resources: [
                {
                  hash: 'AABBCCDDEEFF',
                  name: 'other-by-hash',
                  type: 'lora',
                  weight: 0.4,
                },
              ],
              civitaiResources: [
                { type: 'lora', weight: 0.75, modelVersionId: 555 }, // target
                { type: 'lora', weight: 0.3, modelVersionId: 777 }, // extra
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 444,
      modelVersionId: 555,
      fileHashAutoV3: 'deadbeef0000',
    })

    expect(result.recipes?.[0]?.extraLoras).toEqual([
      { name: 'other-by-hash', weight: 0.4, hash: 'aabbccddeeff' },
      { weight: 0.3, modelVersionId: 777 },
    ])
  })

  it('repairs Civitai mojibake strings in source recipes and extra LoRAs', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 160,
        name: 'v1.6',
        files: [
          {
            type: 'Model',
            primary: true,
            name: 'waiIllustriousSDXL_v160.safetensors',
          },
        ],
        images: [
          {
            url: 'https://image.civitai.com/mojibake.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt:
                '<lora:waiIllustriousSDXL_v160:0.9>, detached sleeves, dragon girl, <lora:ææ¥æ¹èç»æ«å°å²ä»£çäºº:0.8>, white dress',
              negativePrompt:
                'bad proportions,out of focus,username,text,bad anatomy',
              seed: '3839998829',
              steps: '24',
              cfgScale: '3.5',
              Size: '832x1216',
              Model: 'éç¨æ´æ°å¿«waiIllustriousSDXL_v160',
              resources: [
                {
                  hash: 'DEADBEEF0000',
                  name: 'waiIllustriousSDXL_v160',
                  type: 'lora',
                  weight: 0.9,
                },
                {
                  name: 'ææ¥æ¹èç»æ«å°å²ä»£çäºº',
                  type: 'lora',
                  weight: 0.8,
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 999,
      modelVersionId: 160,
      fileHashAutoV3: 'deadbeef0000',
    })

    expect(result.recipes?.[0]).toMatchObject({
      checkpoint: '通用更新快waiIllustriousSDXL_v160',
      seed: 3839998829,
      steps: 24,
      cfgScale: 3.5,
      sizeRaw: '832x1216',
      loraWeight: 0.9,
      extraLoras: [
        {
          name: '明日方舟终末地岁代理人',
          weight: 0.8,
        },
      ],
    })
    expect(result.recipes?.[0]?.prompt).toBe(
      'detached sleeves, dragon girl, white dress',
    )
  })

  // Issue A (docs/plans/lora-search-image-audit-2026-07.md): meilisearch
  // search-hit LoRAs never carry a fileHashAutoV3 (hitToLibraryItem writes
  // null — the search index doesn't expose files[].hashes). Recipes must
  // still come back from the model-version source images using only
  // modelId+modelVersionId; the hash is not a gate.
  it('mines source recipes from model-version images when fileHashAutoV3 is null (search-hit LoRAs)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2050454,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/phrolova-source.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 1,
            meta: {
              prompt: '<lora:Phrolova:0.8>, phrolova, purple hair, wings',
              seed: 42,
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 1494914,
      modelVersionId: 2050454,
      fileHashAutoV3: null,
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/phrolova-source.jpeg',
      source: 'model_version_image',
      // No hash to match against resources[] — weight still recovers from
      // the sole in-prompt <lora:..> tag (resolveRecipeLoraSignals' single-
      // tag fallback), proving the null hash doesn't break weight recovery.
      loraWeight: 0.8,
    })
    expect(result.outfits).toHaveLength(1)
    // Only the model-versions endpoint is hit — no community-images
    // fallback call, and no crash from the null hash reaching
    // resolveRecipeLoraSignals.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/model-versions/2050454')
  })

  it('mines source recipes when fileHashAutoV3 is omitted entirely (undefined, not just null)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 999,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/no-hash-field.jpeg',
            nsfwLevel: 1,
            meta: { prompt: 'a simple prompt, no lora tag at all' },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 1,
      modelVersionId: 2,
      // fileHashAutoV3 omitted — exercises the `fileHashAutoV3?: string |
      // null | undefined` widened type end-to-end (undefined, not null).
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes?.[0]?.prompt).toBe(
      'a simple prompt, no lora tag at all',
    )
  })
})

describe('resolveCivitaiLoraByReference', () => {
  // Live-verified by-hash payload shape (2026-06-11): version object with
  // modelId + nested model {name, type} + files/images/downloadUrl.
  const VERSION_PAYLOAD = {
    id: 135867,
    modelId: 122359,
    name: 'v1.0',
    baseModel: 'SDXL 1.0',
    trainedWords: ['add detail'],
    downloadUrl: 'https://civitai.com/api/download/models/135867',
    model: { name: 'Detail Tweaker XL', type: 'LORA' },
    files: [
      {
        type: 'Model',
        primary: true,
        name: 'add-detail-xl.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/135867',
        hashes: { AutoV3: '9C783C8CE46C' },
      },
    ],
    images: [
      {
        url: 'https://image.civitai.com/cover/original=true/1.jpeg',
        nsfwLevel: 1,
      },
    ],
  }

  it('resolves a hash into a mountable library item', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(VERSION_PAYLOAD))

    const item = await resolveCivitaiLoraByReference({ hash: '9C783C8CE46C' })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(
      '/api/v1/model-versions/by-hash/9c783c8ce46c',
    )
    expect(item).toMatchObject({
      id: 'civitai:122359:135867',
      name: 'Detail Tweaker XL',
      loraUrl: 'https://civitai.com/api/download/models/135867',
      baseModelFamily: 'SDXL 1.0',
      fileHashAutoV3: '9c783c8ce46c',
    })
  })

  it('resolves a modelVersionId via the /:id endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(VERSION_PAYLOAD))

    const item = await resolveCivitaiLoraByReference({ modelVersionId: 135867 })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/model-versions/135867')
    expect(item?.id).toBe('civitai:122359:135867')
  })

  it('returns null for non-LoRA references and missing input', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ...VERSION_PAYLOAD,
        model: { name: 'Some Checkpoint', type: 'Checkpoint' },
      }),
    )
    expect(
      await resolveCivitaiLoraByReference({ hash: 'aabbccddeeff' }),
    ).toBeNull()
    expect(await resolveCivitaiLoraByReference({})).toBeNull()
  })

  it('falls back to name search with exact file-stem matching when the hash misses', async () => {
    // Live-verified failure mode: meta hashes are often the author's LOCAL
    // file (pruned/converted) and miss Civitai's index, while the meta name
    // equals the published file's stem.
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 999,
              name: 'Unrelated Style',
              type: 'LORA',
              modelVersions: [
                {
                  id: 1,
                  name: 'v1',
                  baseModel: 'Illustrious',
                  files: [
                    {
                      type: 'Model',
                      primary: true,
                      name: 'SomethingElse.safetensors',
                      downloadUrl: 'https://civitai.com/api/download/models/1',
                    },
                  ],
                },
              ],
            },
            {
              id: 974076,
              name: 'Enchanting Eyes (Detailed Eyes)',
              type: 'LORA',
              modelVersions: [
                {
                  id: 1463317,
                  name: 'Illustrious',
                  baseModel: 'Illustrious',
                  trainedWords: [],
                  files: [
                    {
                      type: 'Model',
                      primary: true,
                      name: 'EnchantingEyesIllustrious.safetensors',
                      downloadUrl:
                        'https://civitai.com/api/download/models/1463317',
                      hashes: { AutoV3: '6F4F88234D6C' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      )

    const item = await resolveCivitaiLoraByReference({
      hash: 'aaaaaaaaaaaa', // 作者本地文件 hash，索引里没有
      name: 'EnchantingEyesIllustrious',
    })

    const searchUrl = new URL(String(mockFetch.mock.calls[1]?.[0]))
    expect(searchUrl.pathname).toBe('/api/v1/models')
    // camelCase 词干必须拆词后再搜 — Civitai 搜索不拆 camelCase（实测）。
    expect(searchUrl.searchParams.get('query')).toBe(
      'Enchanting Eyes Illustrious',
    )
    expect(item).toMatchObject({
      id: 'civitai:974076:1463317',
      name: 'Enchanting Eyes (Detailed Eyes)',
      baseModelFamily: 'Illustrious',
    })
  })

  it('repairs mojibake before exact name-stem matching', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 3001,
            name: 'Arknights Endfield Agent',
            type: 'LORA',
            modelVersions: [
              {
                id: 4001,
                name: 'Illustrious',
                baseModel: 'Illustrious',
                trainedWords: [],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    name: '明日方舟终末地岁代理人.safetensors',
                    downloadUrl: 'https://civitai.com/api/download/models/4001',
                    hashes: { AutoV3: 'AABBCCDDEEFF' },
                  },
                ],
              },
            ],
          },
        ],
      }),
    )

    const item = await resolveCivitaiLoraByReference({
      name: 'ææ¥æ¹èç»æ«å°å²ä»£çäºº',
    })

    const searchUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(searchUrl.searchParams.get('query')).toBe('明日方舟终末地岁代理人')
    expect(item).toMatchObject({
      id: 'civitai:3001:4001',
      name: 'Arknights Endfield Agent',
      baseModelFamily: 'Illustrious',
      fileHashAutoV3: 'aabbccddeeff',
    })
  })

  it('does not fuzzy-accept name search results without a stem match', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 1,
              name: 'Close But No Match',
              type: 'LORA',
              modelVersions: [
                {
                  id: 2,
                  name: 'v1',
                  files: [
                    {
                      type: 'Model',
                      name: 'close-but-no.safetensors',
                      downloadUrl: 'https://civitai.com/api/download/models/2',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [{ hits: [] }] }))

    expect(
      await resolveCivitaiLoraByReference({
        name: 'detailed hand focus style illustriousXL v1.1',
      }),
    ).toBeNull()
  })

  it('falls back to Civitai web search when the public models API misses an exact version file stem', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              hits: [
                {
                  id: 421162,
                  name: 'Detailed style XL + F1D + SD1.5 + zib',
                  type: 'LORA',
                  versions: [
                    {
                      id: 469308,
                      name: 'Detailed XL v1.0',
                      baseModel: 'SDXL 1.0',
                      files: [
                        {
                          name: 'detailed hand focus style XL v1.0.safetensors',
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 200255,
                  name: 'Hands XL + SD 1.5 + F1D + Pony + Illustrious + zit + ZIB',
                  type: 'LORA',
                  versions: [
                    {
                      id: 2212079,
                      name: 'Hands Illu v1.1',
                      baseModel: 'Illustrious',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 2212079,
          modelId: 200255,
          name: 'Hands Illu v1.1',
          baseModel: 'Illustrious',
          trainedWords: [],
          downloadUrl: 'https://civitai.com/api/download/models/2212079',
          model: {
            name: 'Hands XL + SD 1.5 + F1D + Pony + Illustrious + zit + ZIB',
            type: 'LORA',
          },
          files: [
            {
              type: 'Model',
              primary: true,
              name: 'detailed hand focus style illustriousXL v1.1.safetensors',
              downloadUrl: 'https://civitai.com/api/download/models/2212079',
              hashes: { AutoV3: '6D97C71F80C8' },
            },
          ],
        }),
      )

    const item = await resolveCivitaiLoraByReference({
      name: 'detailed hand focus style illustriousXL v1.1',
      baseModelFamily: 'Illustrious',
    })

    const searchUrl = new URL(String(mockFetch.mock.calls[1]?.[0]))
    const searchInit = mockFetch.mock.calls[1]?.[1] as RequestInit | undefined
    const searchBody = JSON.parse(String(searchInit?.body)) as {
      queries: Array<{
        indexUid: string
        q: string
        limit: number
        filter: string[]
      }>
    }
    const versionUrl = new URL(String(mockFetch.mock.calls[2]?.[0]))

    expect(searchUrl.origin).toBe('https://search-new.civitai.com')
    expect(searchBody.queries[0]).toMatchObject({
      indexUid: 'models_v9',
      q: 'detailed hand focus style illustrious XL v1.1',
      limit: 50,
      filter: [
        'type = LoRA',
        'versions.baseModel IN ["Illustrious", "NoobAI"]',
      ],
    })
    expect(versionUrl.pathname).toBe('/api/v1/model-versions/2212079')
    expect(item).toMatchObject({
      id: 'civitai:200255:2212079',
      name: 'Hands XL + SD 1.5 + F1D + Pony + Illustrious + zit + ZIB',
      baseModelFamily: 'Illustrious',
      fileHashAutoV3: '6d97c71f80c8',
    })
  })

  it('does not accept web search matches from a different base model family', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              hits: [
                {
                  id: 421162,
                  name: 'Detailed style XL + F1D + SD1.5 + zib',
                  type: 'LORA',
                  versions: [
                    {
                      id: 469308,
                      name: 'Detailed XL v1.0',
                      baseModel: 'SDXL 1.0',
                      files: [
                        {
                          name: 'detailed hand focus style illustriousXL v1.1.safetensors',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      )

    expect(
      await resolveCivitaiLoraByReference({
        name: 'detailed hand focus style illustriousXL v1.1',
        baseModelFamily: 'Illustrious',
      }),
    ).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
