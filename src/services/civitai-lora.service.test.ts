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
    expect(requestUrl.searchParams.get('page')).toBe('2')
    expect(requestUrl.searchParams.get('cursor')).toBe('cursor-2')
    expect(requestUrl.searchParams.get('query')).toBeNull()
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual([
      'SDXL 1.0',
      'SDXL 0.9',
      'SDXL Turbo',
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
    // List thumbnail: 96px, drives a 40×40 DOM slot — never the original.
    expect(item?.thumbImageUrl).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/217179cb-87a0-4e96-8d77-e410f757aba0/width=96,optimized=true/1917130.jpeg',
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
  })

  it('passes cursor for non-search library pagination', async () => {
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
    expect(requestUrl.searchParams.get('page')).toBe('3')
    expect(requestUrl.searchParams.get('query')).toBeNull()
    expect(requestUrl.searchParams.get('cursor')).toBe('cursor-2')
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual(['Anima'])
    expect(result.nextCursor).toBeNull()
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
      }),
    )

    const result = await listCivitaiLoras({
      baseModel: 'Illustrious',
      pageSize: 10,
      search: 'Wuthering Waves',
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
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

    mockFetch.mockResolvedValue(
      jsonResponse({
        items: Array.from({ length: 12 }).map((_, index) => ({
          id: index + 1,
          name: `Wuthering Waves LoRA ${index + 1}`,
          type: 'LORA',
          modelVersions: [versionFor(index + 101)],
        })),
        metadata: { nextCursor: 'cursor-next' },
      }),
    )

    const result = await listCivitaiLoras({
      baseModel: 'Illustrious',
      pageSize: 10,
      search: '鸣潮',
    })

    expect(result.items).toHaveLength(10)
    expect(result.items[0]?.name).toBe('Wuthering Waves LoRA 1')
    expect(result.hasNextPage).toBe(true)
    expect(result.nextCursor).toBe('search-scan:2')

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('limit')).toBe('40')
    expect(requestUrl.searchParams.get('query')).toBe('鸣潮')
    expect(requestUrl.searchParams.getAll('baseModels')).toEqual([
      'Illustrious',
      'NoobAI',
    ])
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
    const expectedTotal =
      CIVITAI_LORA_BASE_MODEL_VALUES.length * CIVITAI_LORA_SORT_VALUES.length

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
    expect(requestUrl.searchParams.get('browsingLevel')).toBe('1')
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
    expect(requestUrl.searchParams.get('browsingLevel')).toBe('1')
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
    expect(searchUrl.searchParams.get('query')).toBe(
      'EnchantingEyesIllustrious',
    )
    expect(item).toMatchObject({
      id: 'civitai:974076:1463317',
      name: 'Enchanting Eyes (Detailed Eyes)',
      baseModelFamily: 'Illustrious',
    })
  })

  it('does not fuzzy-accept name search results without a stem match', async () => {
    mockFetch.mockResolvedValueOnce(
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

    expect(
      await resolveCivitaiLoraByReference({
        name: 'detailed hand focus style illustriousXL v1.1',
      }),
    ).toBeNull()
  })
})
