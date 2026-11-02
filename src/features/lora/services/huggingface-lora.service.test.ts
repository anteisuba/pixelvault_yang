import { beforeEach, describe, expect, it, vi } from 'vitest'

import { safeFetch } from '@/lib/url-guard'
import type {
  HuggingFaceLoraSearchItem,
  HuggingFaceLoraSearchQuery,
} from '@/types'

import {
  extractReadmeImageUrls,
  extractReadmePromptCandidates,
  fetchReadmeCoverImageUrl,
  getHuggingFaceRepoShowcase,
  isFallbackSocialThumbnail,
  searchHuggingFaceLoras,
} from './huggingface-lora.service'

vi.mock('@/lib/url-guard', () => ({
  safeFetch: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockSafeFetch = vi.mocked(safeFetch)

function jsonResponse(payload: unknown, link?: string): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...(link ? { link } : {}),
    },
  })
}

function notFoundResponse(): Response {
  return new Response('{}', { status: 404 })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/markdown' },
  })
}

function imageLora(input: {
  id: string
  baseModel: string
  filename?: string
  size?: number
  triggerWord?: string
  downloads?: number
}) {
  return {
    id: input.id,
    sha: `${input.id.replace(/\W/g, '')}-sha`,
    gated: false,
    private: false,
    likes: 3,
    downloads: input.downloads ?? 10,
    pipeline_tag: 'text-to-image',
    tags: ['lora', 'diffusers', `base_model:${input.baseModel}`],
    cardData: input.triggerWord
      ? { trigger_word: input.triggerWord }
      : undefined,
    siblings: [
      {
        rfilename: input.filename ?? 'adapter.safetensors',
        size: input.size ?? 1024,
      },
    ],
  }
}

// 已发现结果条目（post-toSearchItem 形状）——`isFallbackSocialThumbnail`
// 之类的测试需要一个满足完整 Zod schema 的 HuggingFaceLoraSearchItem，不
// 是 `imageLora` 那种原始 Hub API 形状。
function makeSearchItem(
  overrides: Partial<HuggingFaceLoraSearchItem> = {},
): HuggingFaceLoraSearchItem {
  return {
    repoId: 'author/plain',
    name: 'plain',
    modelPageUrl: 'https://huggingface.co/author/plain',
    revision: 'main',
    files: [
      {
        filename: 'adapter.safetensors',
        downloadUrl:
          'https://huggingface.co/author/plain/resolve/main/adapter.safetensors',
        sizeBytes: 1024,
        baseModelFamily: 'sdxl',
      },
    ],
    triggerWord: '',
    type: 'style',
    baseModelFamily: 'sdxl',
    coverImageUrl: null,
    tags: [],
    downloads: 0,
    likes: 0,
    license: null,
    gated: false,
    private: false,
    ...overrides,
  }
}

describe('huggingface-lora.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns image-generation LoRAs across families and excludes LLM adapters', async () => {
    mockSafeFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
        return notFoundResponse()
      }
      return jsonResponse([
        imageLora({
          id: 'author/sdxl-style',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          triggerWord: 'sdxl_style',
        }),
        {
          id: 'author/qwen-llm-adapter',
          gated: false,
          private: false,
          pipeline_tag: 'text-generation',
          tags: ['lora', 'transformers', 'base_model:Qwen/Qwen2.5-7B'],
          siblings: [{ rfilename: 'adapter.safetensors', size: 1024 }],
        },
        {
          id: 'author/wan-video-adapter',
          gated: false,
          private: false,
          pipeline_tag: 'image-to-video',
          tags: ['lora', 'diffusers', 'video', 'base_model:Wan-AI/Wan2.2'],
          siblings: [{ rfilename: 'adapter.safetensors', size: 1024 }],
        },
      ])
    })

    const result = await searchHuggingFaceLoras({
      search: '',
      baseModelFamily: 'all',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 1,
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      repoId: 'author/sdxl-style',
      baseModelFamily: 'sdxl',
      triggerWord: 'sdxl_style',
    })
  })

  it('discovers Anima adapters by the exact base-model relation and pins the official bundle', async () => {
    mockSafeFetch.mockImplementation(async (input) => {
      const url = decodeURIComponent(String(input))
      if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
        return jsonResponse({
          id: 'circlestone-labs/Anima-Official-LoRAs',
          sha: 'official-sha',
          gated: false,
          private: false,
          likes: 23,
          downloads: 0,
          tags: [],
          siblings: [
            {
              rfilename: 'anima-greg-rutkowski-style.safetensors',
              size: 138_662_176,
            },
          ],
        })
      }
      if (url.includes('filter=base_model:adapter:circlestone-labs/Anima')) {
        return jsonResponse([
          imageLora({
            id: 'author/anima-style',
            baseModel: 'circlestone-labs/Anima',
            filename: 'anima-style.safetensors',
          }),
        ])
      }
      return jsonResponse([])
    })

    const result = await searchHuggingFaceLoras({
      search: '',
      baseModelFamily: 'anima-dit',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 1,
    })

    expect(result.items.map((item) => item.repoId)).toEqual([
      'circlestone-labs/Anima-Official-LoRAs',
      'author/anima-style',
    ])
    expect(result.items[0]).toMatchObject({
      triggerWord: '',
      baseModelFamily: 'anima-dit',
    })
    expect(
      mockSafeFetch.mock.calls.some(([input]) =>
        decodeURIComponent(String(input)).includes(
          'filter=base_model:adapter:circlestone-labs/Anima',
        ),
      ),
    ).toBe(true)
  })

  it('filters private, gated and non-LoRA diffusion assets', async () => {
    mockSafeFetch.mockResolvedValue(
      jsonResponse([
        {
          ...imageLora({
            id: 'author/gated',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          }),
          gated: 'manual',
        },
        {
          ...imageLora({
            id: 'author/private',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          }),
          private: true,
        },
        {
          ...imageLora({
            id: 'author/controlnet',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          }),
          tags: ['lora', 'diffusers', 'controlnet'],
        },
      ]),
    )

    const result = await searchHuggingFaceLoras({
      search: 'test',
      baseModelFamily: 'sdxl',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 1,
    })

    expect(result.items).toEqual([])
  })

  it('hydrates file sizes and rejects a complete checkpoint masquerading as a LoRA', async () => {
    mockSafeFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/models/author/size-check')) {
        return jsonResponse(
          imageLora({
            id: 'author/size-check',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
            size: 4_182_218_328,
          }),
        )
      }
      return jsonResponse([
        {
          ...imageLora({
            id: 'author/size-check',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          }),
          siblings: [{ rfilename: 'anima_baseV10.safetensors' }],
        },
      ])
    })

    const result = await searchHuggingFaceLoras({
      search: 'size',
      baseModelFamily: 'all',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 2,
      cursor: 'after-curated',
    })

    expect(result.items).toEqual([])
    expect(
      mockSafeFetch.mock.calls.some(([input]) =>
        String(input).includes('/models/author/size-check'),
      ),
    ).toBe(true)
  })

  it('uses the Hub next cursor so later pages do not repeat or skip accepted LoRAs', async () => {
    mockSafeFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
        return notFoundResponse()
      }
      if (url.includes('cursor=cursor-page-2')) {
        return jsonResponse([
          imageLora({
            id: 'author/page-2',
            baseModel: 'black-forest-labs/FLUX.1-dev',
          }),
        ])
      }
      return jsonResponse(
        [
          imageLora({
            id: 'author/page-1',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          }),
        ],
        '<https://huggingface.co/api/models?filter=lora&cursor=cursor-page-2>; rel="next"',
      )
    })

    const first = await searchHuggingFaceLoras({
      search: '',
      baseModelFamily: 'all',
      sort: 'downloads',
      type: 'all',
      limit: 1,
      page: 1,
    })
    const second = await searchHuggingFaceLoras({
      search: '',
      baseModelFamily: 'all',
      sort: 'downloads',
      type: 'all',
      limit: 1,
      page: 2,
      cursor: first.nextCursor ?? undefined,
    })

    expect(first).toMatchObject({
      page: 1,
      total: null,
      hasNextPage: true,
      nextCursor: 'cursor-page-2',
    })
    expect(first.items[0]?.repoId).toBe('author/page-1')
    expect(second.items[0]?.repoId).toBe('author/page-2')
    expect(second.hasNextPage).toBe(false)
  })

  it('applies a requested family filter while scanning the global image-LoRA feed', async () => {
    mockSafeFetch.mockResolvedValue(
      jsonResponse([
        imageLora({
          id: 'author/pony-style',
          baseModel: 'Pony Diffusion V6 XL',
        }),
        imageLora({
          id: 'author/flux-style',
          baseModel: 'black-forest-labs/FLUX.1-dev',
        }),
      ]),
    )

    const result = await searchHuggingFaceLoras({
      search: '',
      baseModelFamily: 'pony',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 1,
    })

    expect(result.items.map((item) => item.repoId)).toEqual([
      'author/pony-style',
    ])
  })

  // S1 统一外壳：HF 排序实测（lora-workbench.md §2.1）确认 trendingScore /
  // downloads / lastModified 三值都被 Hub 接受，服务端把选中的排序原样转发
  // 给 /api/models（此前硬编码 'downloads'）。
  it('forwards the requested sort to the Hub models endpoint', async () => {
    mockSafeFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
        return notFoundResponse()
      }
      return jsonResponse([])
    })

    await searchHuggingFaceLoras({
      search: '',
      baseModelFamily: 'all',
      sort: 'trendingScore',
      type: 'all',
      limit: 12,
      page: 1,
    })

    expect(
      mockSafeFetch.mock.calls.some(([input]) =>
        String(input).includes('sort=trendingScore'),
      ),
    ).toBe(true)
  })

  // Bug 修复（owner 报告：HF tab + Illustrious 筛选 → 「没有找到匹配的公开
  // LoRA」）：非 anima-dit 家族此前只传 `filter=lora` 全局盲扫，扫描窗口内
  // 没扫到该家族就报空。家族关键词播种 Hub `search` 参数后把扫描窗口对准
  // 供给存在的页面（HUGGINGFACE_LORA_FAMILY_SEARCH_SEEDS 的注释有完整实测
  // 背景）。
  describe('family search seeding (empty-results fix)', () => {
    it('seeds the Hub search parameter with the family keyword when the user typed nothing', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([])
      })

      await searchHuggingFaceLoras({
        search: '',
        baseModelFamily: 'illustrious',
        sort: 'downloads',
        type: 'all',
        limit: 12,
        page: 1,
      })

      const searchCall = mockSafeFetch.mock.calls.find(([input]) =>
        String(input).includes('/models?'),
      )
      expect(searchCall).toBeDefined()
      const url = new URL(String(searchCall?.[0]))
      expect(url.searchParams.get('search')).toBe('illustrious')
    })

    it('combines the user search term with the family seed keyword', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([])
      })

      await searchHuggingFaceLoras({
        search: 'naruto',
        baseModelFamily: 'pony',
        sort: 'downloads',
        type: 'all',
        limit: 12,
        page: 1,
      })

      const searchCall = mockSafeFetch.mock.calls.find(([input]) =>
        String(input).includes('/models?'),
      )
      const url = new URL(String(searchCall?.[0]))
      expect(url.searchParams.get('search')).toBe('naruto pony')
    })

    it('does not duplicate the seed keyword when the user already typed it', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([])
      })

      await searchHuggingFaceLoras({
        search: 'Flux artstyle',
        baseModelFamily: 'flux',
        sort: 'downloads',
        type: 'all',
        limit: 12,
        page: 1,
      })

      const searchCall = mockSafeFetch.mock.calls.find(([input]) =>
        String(input).includes('/models?'),
      )
      const url = new URL(String(searchCall?.[0]))
      expect(url.searchParams.get('search')).toBe('Flux artstyle')
    })

    it('falls back to the current blanket scan (no search param) for a family without a proven seed keyword', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([])
      })

      await searchHuggingFaceLoras({
        search: '',
        baseModelFamily: 'other',
        sort: 'downloads',
        type: 'all',
        limit: 12,
        page: 1,
      })

      const searchCall = mockSafeFetch.mock.calls.find(([input]) =>
        String(input).includes('/models?'),
      )
      const url = new URL(String(searchCall?.[0]))
      expect(url.searchParams.has('search')).toBe(false)
    })

    it('does not seed anima-dit — it already scopes discovery via the dedicated adapter filter', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([])
      })

      await searchHuggingFaceLoras({
        search: '',
        baseModelFamily: 'anima-dit',
        sort: 'downloads',
        type: 'all',
        limit: 12,
        page: 1,
      })

      const searchCall = mockSafeFetch.mock.calls.find(([input]) =>
        String(input).includes('/models?'),
      )
      const url = new URL(String(searchCall?.[0]))
      expect(url.searchParams.has('search')).toBe(false)
      expect(url.searchParams.get('filter')).toBe(
        'base_model:adapter:circlestone-labs/Anima',
      )
    })
  })

  // Bug 修复（owner 报告：HF「风格」类型每页只出 3-4 张）：内容类型此前不
  // 播种 Hub `search`，选类型时盲扫窗口里该类型供给稀薄凑不满一页。类型
  // 关键词播种后（HUGGINGFACE_LORA_CONTENT_TYPE_SEARCH_SEEDS 的注释有完整
  // 实测背景）与家族种子 AND 组合。
  describe('content type search seeding (sparse-results fix)', () => {
    async function searchAndGetOutboundUrl(
      query: Pick<
        HuggingFaceLoraSearchQuery,
        'search' | 'baseModelFamily' | 'type'
      >,
    ) {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([])
      })

      await searchHuggingFaceLoras({
        search: query.search,
        baseModelFamily: query.baseModelFamily,
        sort: 'downloads',
        type: query.type,
        limit: 12,
        page: 1,
      })

      const searchCall = mockSafeFetch.mock.calls.find(([input]) =>
        String(input).includes('/models?'),
      )
      expect(searchCall).toBeDefined()
      return new URL(String(searchCall?.[0]))
    }

    it('seeds the Hub search parameter with the content-type keyword even when family is unset', async () => {
      const url = await searchAndGetOutboundUrl({
        search: '',
        baseModelFamily: 'all',
        type: 'style',
      })
      expect(url.searchParams.get('search')).toBe('style')
    })

    it('combines the family seed and the content-type seed with AND semantics', async () => {
      const url = await searchAndGetOutboundUrl({
        search: '',
        baseModelFamily: 'pony',
        type: 'style',
      })
      expect(url.searchParams.get('search')).toBe('pony style')
    })

    it('does not duplicate a content-type seed the user already typed', async () => {
      const url = await searchAndGetOutboundUrl({
        search: 'anime character',
        baseModelFamily: 'all',
        type: 'character',
      })
      expect(url.searchParams.get('search')).toBe('anime character')
    })

    it('does not seed a content type without a proven seed keyword (expression)', async () => {
      const url = await searchAndGetOutboundUrl({
        search: '',
        baseModelFamily: 'all',
        type: 'expression',
      })
      expect(url.searchParams.has('search')).toBe(false)
    })

    it('does not add any content-type seed when type is "all"', async () => {
      const url = await searchAndGetOutboundUrl({
        search: '',
        baseModelFamily: 'all',
        type: 'all',
      })
      expect(url.searchParams.has('search')).toBe(false)
    })
  })

  it('scopes multi-family repositories to the exact selected weight family', async () => {
    mockSafeFetch.mockResolvedValue(
      jsonResponse([
        {
          id: 'author/multi-family-character',
          sha: 'multi-sha',
          gated: false,
          private: false,
          pipeline_tag: 'text-to-image',
          tags: ['lora', 'diffusers', 'base_model:circlestone-labs/Anima'],
          cardData: {
            base_model: 'circlestone-labs/Anima',
            trigger_word: null,
          },
          siblings: [
            { rfilename: 'character_ANI.safetensors', size: 1024 },
            { rfilename: 'character_ponyV6.safetensors', size: 1024 },
            { rfilename: 'character_ILV10.safetensors', size: 1024 },
          ],
        },
      ]),
    )

    const result = await searchHuggingFaceLoras({
      search: '',
      baseModelFamily: 'pony',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 1,
    })

    expect(result.items[0]?.files).toEqual([
      expect.objectContaining({
        filename: 'character_ponyV6.safetensors',
        baseModelFamily: 'pony',
      }),
    ])
  })

  // S2（docs/references/pages/lora-workbench.md §3）：内容类型筛选走既有的
  // 「抓 Hub 页 + 服务端过滤」架构（isPotentialLoraCandidate 新增
  // modelMatchesContentType 判据），L1=hfTags、L2=repoId/模型名/tags/文件名
  // 子串匹配。
  describe('S2 content type filter', () => {
    it('keeps a repository whose name matches an L2 keyword for the requested type', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([
          imageLora({
            id: 'author/sailor-outfit-lora',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          }),
        ])
      })

      const result = await searchHuggingFaceLoras({
        search: '',
        baseModelFamily: 'all',
        sort: 'downloads',
        type: 'clothing',
        limit: 12,
        page: 1,
      })

      expect(result.items.map((item) => item.repoId)).toEqual([
        'author/sailor-outfit-lora',
      ])
    })

    it('drops a repository that matches neither hfTags nor nameKeywords for the requested type', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([
          imageLora({
            id: 'author/generic-lora',
            baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
          }),
        ])
      })

      const result = await searchHuggingFaceLoras({
        search: '',
        baseModelFamily: 'all',
        sort: 'downloads',
        type: 'clothing',
        limit: 12,
        page: 1,
      })

      expect(result.items).toEqual([])
    })

    it('keeps a repository tagged with an hfTag for the requested type (L1)', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([
          {
            ...imageLora({
              id: 'author/tagged-character',
              baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
            }),
            tags: ['lora', 'diffusers', 'character'],
          },
        ])
      })

      const result = await searchHuggingFaceLoras({
        search: '',
        baseModelFamily: 'all',
        sort: 'downloads',
        type: 'character',
        limit: 12,
        page: 1,
      })

      expect(result.items.map((item) => item.repoId)).toEqual([
        'author/tagged-character',
      ])
    })
  })

  describe('cover image resolution chain', () => {
    const query = {
      search: '',
      baseModelFamily: 'all',
      sort: 'downloads',
      type: 'all',
      limit: 12,
      page: 1,
    } as const

    function mockSingleRepo(model: unknown) {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
          return notFoundResponse()
        }
        return jsonResponse([model])
      })
    }

    it('prefers cardData.thumbnail over widget images', async () => {
      mockSingleRepo({
        ...imageLora({
          id: 'author/thumb',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
        }),
        cardData: {
          thumbnail: 'https://example.com/thumb.png',
          widget: [{ output: { url: 'https://example.com/widget.png' } }],
        },
      })

      const result = await searchHuggingFaceLoras(query)
      expect(result.items[0]?.coverImageUrl).toBe(
        'https://example.com/thumb.png',
      )
    })

    it('resolves a repo-relative thumbnail into a resolve URL', async () => {
      mockSingleRepo({
        ...imageLora({
          id: 'author/rel',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
        }),
        cardData: { thumbnail: './previews/cover.png' },
      })

      const result = await searchHuggingFaceLoras(query)
      expect(result.items[0]?.coverImageUrl).toBe(
        'https://huggingface.co/author/rel/resolve/authorrel-sha/previews/cover.png',
      )
    })

    it('keeps using widget images when there is no thumbnail', async () => {
      mockSingleRepo({
        ...imageLora({
          id: 'author/widget',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
        }),
        cardData: {
          widget: [{ output: { url: 'https://example.com/widget.png' } }],
        },
      })

      const result = await searchHuggingFaceLoras(query)
      expect(result.items[0]?.coverImageUrl).toBe(
        'https://example.com/widget.png',
      )
    })

    it('falls back to a repository image file, preferring hinted names', async () => {
      mockSingleRepo({
        ...imageLora({
          id: 'author/sibling',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
        }),
        siblings: [
          { rfilename: 'adapter.safetensors', size: 1024 },
          { rfilename: 'aaa.png' },
          { rfilename: 'sample.jpg' },
        ],
      })

      const result = await searchHuggingFaceLoras(query)
      expect(result.items[0]?.coverImageUrl).toBe(
        'https://huggingface.co/author/sibling/resolve/authorsibling-sha/sample.jpg',
      )
    })

    it('falls back to the Hub social thumbnail when the repo has no imagery', async () => {
      mockSingleRepo(
        imageLora({
          id: 'author/plain',
          baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
        }),
      )

      const result = await searchHuggingFaceLoras(query)
      expect(result.items[0]?.coverImageUrl).toBe(
        'https://cdn-thumbnails.huggingface.co/social-thumbnails/models/author/plain.png',
      )
    })

    // 2026-07-18 方案 B（owner 拍板）：README 内嵌图（第四级）不再在列表
    // 请求里同步抓——曾经的 `hydrateReadmeCoverImages` 在列表里 await 对每
    // 个落到社交横幅兜底的条目拉 README，N 个往返的尾延迟把 HF 库首屏拖到
    // 5–31s。列表现在只到第三级 + 社交横幅兜底就返回，哪怕 README 里其实
    // 有真图也不再触发请求；第四级改为客户端渐进增强，行为覆盖见下方
    // `getHuggingFaceRepoShowcase` describe 块。
    describe('README cover fallback is no longer synchronous in the list flow', () => {
      it('never requests README.md during list search, even for a repo whose README has real images', async () => {
        mockSafeFetch.mockImplementation(async (input) => {
          const url = String(input)
          if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
            return notFoundResponse()
          }
          if (url.includes('/README.md')) {
            throw new Error(
              'README should not be requested by the list flow anymore',
            )
          }
          return jsonResponse([
            imageLora({
              id: 'author/readme-img-tag',
              baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
            }),
          ])
        })

        const result = await searchHuggingFaceLoras(query)

        expect(result.items[0]?.coverImageUrl).toBe(
          'https://cdn-thumbnails.huggingface.co/social-thumbnails/models/author/readme-img-tag.png',
        )
        expect(
          mockSafeFetch.mock.calls.some(([input]) =>
            String(input).includes('/README.md'),
          ),
        ).toBe(false)
      })

      it('does not request the README when cardData.thumbnail already resolved a cover (performance discipline)', async () => {
        mockSafeFetch.mockImplementation(async (input) => {
          const url = String(input)
          if (url.includes('/models/circlestone-labs/Anima-Official-LoRAs')) {
            return notFoundResponse()
          }
          if (url.includes('/README.md')) {
            throw new Error('README should not be requested for this repo')
          }
          return jsonResponse([
            {
              ...imageLora({
                id: 'author/has-thumbnail',
                baseModel: 'stabilityai/stable-diffusion-xl-base-1.0',
              }),
              cardData: { thumbnail: 'https://example.com/thumb.png' },
            },
          ])
        })

        const result = await searchHuggingFaceLoras(query)
        expect(result.items[0]?.coverImageUrl).toBe(
          'https://example.com/thumb.png',
        )
      })
    })
  })

  describe('extractReadmeImageUrls', () => {
    const repoId = 'author/repo'
    const revision = 'main'

    it('extracts an HTML <img> src', () => {
      expect(
        extractReadmeImageUrls(
          '<img src="https://cdn-uploads.huggingface.co/production/uploads/a.png" width="200">',
          repoId,
          revision,
        ),
      ).toEqual(['https://cdn-uploads.huggingface.co/production/uploads/a.png'])
    })

    it('extracts a markdown ![]() image, ignoring an optional title', () => {
      expect(
        extractReadmeImageUrls(
          '![alt text](https://huggingface.co/author/repo/resolve/main/a.png "a title")',
          repoId,
          revision,
        ),
      ).toEqual(['https://huggingface.co/author/repo/resolve/main/a.png'])
    })

    it('resolves a repository-relative path into a resolve URL', () => {
      expect(
        extractReadmeImageUrls('![alt](assets/sample.png)', repoId, revision),
      ).toEqual([
        'https://huggingface.co/author/repo/resolve/main/assets/sample.png',
      ])
    })

    it('rejects an absolute URL outside the HF host whitelist', () => {
      expect(
        extractReadmeImageUrls(
          '<img src="https://imgur.com/hotlink.png">',
          repoId,
          revision,
        ),
      ).toEqual([])
    })

    it('accepts a huggingface.co subdomain like cdn-uploads.huggingface.co', () => {
      expect(
        extractReadmeImageUrls(
          '<img src="https://cdn-uploads.huggingface.co/production/uploads/x.png">',
          repoId,
          revision,
        ),
      ).toEqual(['https://cdn-uploads.huggingface.co/production/uploads/x.png'])
    })

    it('preserves document order and dedupes repeated images across both syntaxes', () => {
      const markdown = [
        '![first](https://huggingface.co/author/repo/resolve/main/first.png)',
        '<img src="https://huggingface.co/author/repo/resolve/main/second.png">',
        '<img src="https://huggingface.co/author/repo/resolve/main/first.png">',
      ].join('\n')
      expect(extractReadmeImageUrls(markdown, repoId, revision)).toEqual([
        'https://huggingface.co/author/repo/resolve/main/first.png',
        'https://huggingface.co/author/repo/resolve/main/second.png',
      ])
    })

    it('returns an empty array when the README has no images', () => {
      expect(
        extractReadmeImageUrls(
          '# Title\n\nJust prose, no images.',
          repoId,
          revision,
        ),
      ).toEqual([])
    })
  })

  // H1 生成侧「样例参考」提示词启发式（lora-workbench.md §13）：两路
  // best-effort——fenced code block（含逗号、不像结构化代码）+ `prompt:`
  // 前缀行。真实样本取自 `lrzjason/Anything2Real`（2026-07-18 实测，见
  // handoff）：唯一一个 fence 是
  // "change the picture 1 to realistic photograph, [description of your image]"。
  describe('extractReadmePromptCandidates', () => {
    it('takes a fenced code block whose content has a comma and no language hint', () => {
      const markdown =
        '## Usage\n\n```\nchange the picture 1 to realistic photograph, [description of your image]\n```\n'
      expect(extractReadmePromptCandidates(markdown)).toEqual([
        'change the picture 1 to realistic photograph, [description of your image]',
      ])
    })

    it('takes a `prompt:` prefixed line, case-insensitively', () => {
      const markdown = 'Example:\nPrompt: 1girl, solo, masterpiece, blue hair\n'
      expect(extractReadmePromptCandidates(markdown)).toEqual([
        '1girl, solo, masterpiece, blue hair',
      ])
    })

    it('rejects a fenced code block tagged as json even if it has a comma', () => {
      const markdown = '```json\n{"prompt": "a cat, sitting"}\n```\n'
      expect(extractReadmePromptCandidates(markdown)).toEqual([])
    })

    it('rejects a fenced code block that looks like yaml front matter (no comma)', () => {
      const markdown =
        '```\nbase_model: illustrious\nlicense: apache-2.0\n```\n'
      expect(extractReadmePromptCandidates(markdown)).toEqual([])
    })

    it('rejects a fenced code block tagged as python', () => {
      const markdown =
        '```python\nimport torch, diffusers\nprint("hello, world")\n```\n'
      expect(extractReadmePromptCandidates(markdown)).toEqual([])
    })

    it('rejects a fenced code block with no comma at all', () => {
      const markdown = '```\njust one plain word\n```\n'
      expect(extractReadmePromptCandidates(markdown)).toEqual([])
    })

    it('dedupes case-insensitively across both heuristics and caps at the candidate limit', () => {
      const markdown = [
        'Prompt: masterpiece, best quality',
        'prompt: MASTERPIECE, best quality',
        'Prompt: one girl, red dress',
        'Prompt: two girls, blue dress',
        'Prompt: three girls, green dress',
        'Prompt: four girls, yellow dress',
        'Prompt: five girls, purple dress',
        'Prompt: six girls, pink dress',
      ].join('\n')
      const result = extractReadmePromptCandidates(markdown)
      expect(result.length).toBeLessThanOrEqual(6)
      expect(result).toContain('masterpiece, best quality')
      expect(
        result.filter((p) => p.toLowerCase() === 'masterpiece, best quality')
          .length,
      ).toBe(1)
    })

    it('returns an empty array when the README has neither heuristic', () => {
      expect(
        extractReadmePromptCandidates(
          '# Title\n\nJust prose, no code, no prompt line.',
        ),
      ).toEqual([])
    })
  })

  // 库侧封面渐进增强（2026-07-18 方案 B）：README 挖掘从列表同步阻塞改成
  // 客户端按需懒加载调用的单仓库端点。这里测试的是新的服务函数本身——
  // 端点路由层的 auth/schema 校验见 route.test.ts。
  describe('getHuggingFaceRepoShowcase', () => {
    function mockReadme(readmeBody: string | null) {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (!url.includes('/README.md')) {
          throw new Error(`Unexpected fetch in showcase test: ${url}`)
        }
        return readmeBody === null
          ? notFoundResponse()
          : textResponse(readmeBody)
      })
    }

    it('returns every README embedded image in document order, not just the first', async () => {
      mockReadme(
        '# Anything2Real\n\n<img src="https://cdn-uploads.huggingface.co/production/uploads/sample-1.png">\n<img src="https://cdn-uploads.huggingface.co/production/uploads/sample-2.png">\n',
      )

      const result = await getHuggingFaceRepoShowcase(
        'lrzjason/Anything2Real',
        'main',
      )

      expect(result.images).toEqual([
        'https://cdn-uploads.huggingface.co/production/uploads/sample-1.png',
        'https://cdn-uploads.huggingface.co/production/uploads/sample-2.png',
      ])
      // 这份 fixture 里没有 fenced code block 也没有 `prompt:` 行，H1 的
      // 启发式（见 extractReadmePromptCandidates 单测）如实提不到，返回空
      // 数组——不是占位，是真提取的结果。
      expect(result.prompts).toEqual([])
    })

    it('wires the H1 prompt heuristic through end to end (images + prompts from the same README fetch)', async () => {
      // 用独立 repoId（不是 "returns every README embedded image..." 用的
      // lrzjason/Anything2Real）——`getHuggingFaceRepoShowcase` 有模块级
      // repoId+revision 缓存，同一 key 会命中前一个测试的缓存值，与本测试
      // 想验证的新 mock README 内容互相污染。
      mockReadme(
        [
          '# Anything2Real (prompt-heuristic fixture)',
          '',
          '<img src="https://cdn-uploads.huggingface.co/production/uploads/sample-1.png">',
          '',
          '## Usage',
          '',
          '```',
          'change the picture 1 to realistic photograph, [description of your image]',
          '```',
        ].join('\n'),
      )

      const result = await getHuggingFaceRepoShowcase(
        'lrzjason/anything2real-prompt-fixture',
        'main',
      )

      expect(result.images).toEqual([
        'https://cdn-uploads.huggingface.co/production/uploads/sample-1.png',
      ])
      expect(result.prompts).toEqual([
        'change the picture 1 to realistic photograph, [description of your image]',
      ])
      // Single README fetch feeds both extractors — not two round trips.
      const readmeCalls = mockSafeFetch.mock.calls.filter(([input]) =>
        String(input).includes('/README.md'),
      ).length
      expect(readmeCalls).toBe(1)
    })

    it('resolves a repo-relative README image path into a resolve URL', async () => {
      mockReadme('![sample](./images/sample.png)')

      const result = await getHuggingFaceRepoShowcase(
        'author/readme-relative-img',
        'abc123',
      )

      expect(result.images).toEqual([
        'https://huggingface.co/author/readme-relative-img/resolve/abc123/images/sample.png',
      ])
    })

    it('rejects an off-whitelist third-party host', async () => {
      mockReadme('<img src="https://evil-cdn.example.com/hotlink.png">')

      const result = await getHuggingFaceRepoShowcase(
        'author/readme-offsite-img',
        'main',
      )

      expect(result.images).toEqual([])
    })

    it('returns an empty array (not an error) when the README has no images', async () => {
      mockReadme('# Qwen-Image-Lightning\n\nNo sample images here.\n')

      const result = await getHuggingFaceRepoShowcase(
        'lightx2v/qwen-image-lightning',
        'main',
      )

      expect(result.images).toEqual([])
    })

    it('returns an empty array (not a throw) when the README request itself fails', async () => {
      mockReadme(null)

      const result = await getHuggingFaceRepoShowcase(
        'author/readme-404',
        'main',
      )

      expect(result.images).toEqual([])
    })

    it('caches the result for the same repo+revision — a second call does not refetch', async () => {
      mockReadme(
        '<img src="https://cdn-uploads.huggingface.co/production/uploads/cached.png">',
      )

      const first = await getHuggingFaceRepoShowcase(
        'author/cached-repo',
        'main',
      )
      const readmeCallsAfterFirst = mockSafeFetch.mock.calls.filter(([input]) =>
        String(input).includes('/README.md'),
      ).length
      const second = await getHuggingFaceRepoShowcase(
        'author/cached-repo',
        'main',
      )
      const readmeCallsAfterSecond = mockSafeFetch.mock.calls.filter(
        ([input]) => String(input).includes('/README.md'),
      ).length

      expect(first).toEqual(second)
      expect(readmeCallsAfterFirst).toBe(1)
      expect(readmeCallsAfterSecond).toBe(1)
    })
  })

  // 服务端等值判定——保留供测试/未来复用（导出理由见函数注释）。
  describe('isFallbackSocialThumbnail / fetchReadmeCoverImageUrl (retained helpers)', () => {
    it('isFallbackSocialThumbnail matches the exact social-thumbnail URL for the repo', () => {
      expect(
        isFallbackSocialThumbnail(
          makeSearchItem({
            repoId: 'author/plain',
            coverImageUrl:
              'https://cdn-thumbnails.huggingface.co/social-thumbnails/models/author/plain.png',
          }),
        ),
      ).toBe(true)
      expect(
        isFallbackSocialThumbnail(
          makeSearchItem({
            repoId: 'author/plain',
            coverImageUrl: 'https://example.com/thumb.png',
          }),
        ),
      ).toBe(false)
    })

    it('fetchReadmeCoverImageUrl returns the first README image', async () => {
      mockSafeFetch.mockImplementation(async (input) => {
        const url = String(input)
        if (!url.includes('/README.md')) {
          throw new Error(`Unexpected fetch: ${url}`)
        }
        return textResponse(
          '<img src="https://cdn-uploads.huggingface.co/production/uploads/first.png">\n<img src="https://cdn-uploads.huggingface.co/production/uploads/second.png">',
        )
      })

      const cover = await fetchReadmeCoverImageUrl('author/repo', 'main')

      expect(cover).toBe(
        'https://cdn-uploads.huggingface.co/production/uploads/first.png',
      )
    })
  })
})
