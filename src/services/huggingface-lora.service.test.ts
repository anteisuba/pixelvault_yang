import { beforeEach, describe, expect, it, vi } from 'vitest'

import { safeFetch } from '@/lib/url-guard'

import { searchHuggingFaceLoras } from './huggingface-lora.service'

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
})
