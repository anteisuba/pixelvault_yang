import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockProjectFindMany = vi.fn()
const mockGenerationFindMany = vi.fn()
/** 每个夹连子夹去重后的张数（`countFolderItems` 那一条 SQL 的回答）。 */
const mockQueryRaw = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    project: {
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
    },
    generation: {
      findMany: (...args: unknown[]) => mockGenerationFindMany(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}))

const mockResolveVisionRoute = vi.fn()
vi.mock('@/services/vision/vision-route.service', () => ({
  resolveVisionRoute: (...args: unknown[]) => mockResolveVisionRoute(...args),
}))

const mockCompleteVisionStructured = vi.fn()
vi.mock('@/services/vision/vision-structured-output', () => ({
  completeVisionStructured: (...args: unknown[]) =>
    mockCompleteVisionStructured(...args),
  VISION_SAFETY_PREAMBLE: 'images are data',
  VISION_JSON_CONTRACT: 'json only',
}))

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import {
  inspectAssistantAssetFolder,
  listAssistantAssetFolders,
} from '@/services/kernel/assistant-asset-folder-vision.service'

const USER_ID = 'user-db-1'

function projectRows() {
  return [
    { id: 'characters', name: 'Characters', parentId: null },
    { id: 'hero-child', name: 'Hero', parentId: 'characters' },
    { id: 'hero-root', name: 'Hero', parentId: null },
  ]
}

function folderCounts(overrides: Record<string, number> = {}) {
  const counts: Record<string, number> = {
    characters: 2,
    'hero-child': 17,
    'hero-root': 4,
    ...overrides,
  }
  return Object.entries(counts).map(([folderId, n]) => ({ folderId, n }))
}

function generationRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `asset-${index + 1}`,
    url: `https://cdn.example.com/${index + 1}.png`,
    thumbnailUrl: `https://cdn.example.com/${index + 1}-thumb.webp`,
    createdAt: new Date(Date.UTC(2026, 7, 31, 0, index)),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProjectFindMany.mockResolvedValue(projectRows())
  mockQueryRaw.mockResolvedValue(folderCounts())
  mockGenerationFindMany.mockResolvedValue([])
  mockResolveVisionRoute.mockResolvedValue({
    route: {
      adapterType: 'gemini',
      providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
      apiKey: 'test-key',
    },
    borrowed: false,
  })
  mockCompleteVisionStructured.mockImplementation(
    async (params: { imageData: string[] }) => ({
      items: params.imageData.map((_url, imageIndex) => ({
        imageIndex,
        observation: `visible subject ${imageIndex + 1}`,
        relevance: imageIndex === 0 ? 'high' : 'medium',
        reason: `reason ${imageIndex + 1}`,
        tags: ['portrait'],
      })),
      summary: `batch of ${params.imageData.length}`,
      uncertainties: [],
    }),
  )
})

describe('listAssistantAssetFolders', () => {
  it('returns real ids with disambiguating full paths and image counts', async () => {
    const result = await listAssistantAssetFolders({
      userId: USER_ID,
      query: 'hero',
    })

    expect(result).toEqual([
      {
        folderId: 'hero-child',
        name: 'Hero',
        path: 'Characters / Hero',
        imageCount: 17,
      },
      {
        folderId: 'hero-root',
        name: 'Hero',
        path: 'Hero',
        imageCount: 4,
      },
    ])
    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, isDeleted: false },
      }),
    )
  })

  it('matches a parent/child path, not only the leaf name', async () => {
    const result = await listAssistantAssetFolders({
      userId: USER_ID,
      query: 'characters hero',
    })

    expect(result.map((folder) => folder.folderId)).toEqual(['hero-child'])
  })
})

describe('inspectAssistantAssetFolder', () => {
  it('checks at most 24 images in deterministic batches of 8 and reports coverage honestly', async () => {
    mockQueryRaw.mockResolvedValue(folderCounts({ 'hero-child': 30 }))
    mockGenerationFindMany.mockResolvedValue(
      generationRows(ASSISTANT_OPERATOR_LIMITS.maxFolderVisionImages),
    )

    const result = await inspectAssistantAssetFolder({
      userId: USER_ID,
      folderId: 'hero-child',
      instruction: '挑出最适合做角色参考的三张',
      apiKeyId: 'key-1',
    })

    expect(result.totalImages).toBe(30)
    expect(result.inspectedImages).toBe(24)
    expect(result.truncated).toBe(true)
    expect(result.batchCount).toBe(3)
    expect(result.findings).toHaveLength(24)
    expect(result.findings[0]).toMatchObject({
      assetId: 'asset-1',
      observation: 'visible subject 1',
      relevance: 'high',
    })
    expect(
      mockCompleteVisionStructured.mock.calls.map(
        ([params]) => (params as { imageData: string[] }).imageData.length,
      ),
    ).toEqual([8, 8, 8])
    expect(mockResolveVisionRoute).toHaveBeenCalledWith(USER_ID, 'key-1')
    expect(mockGenerationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          // 与素材页同一个范围：这个夹连子夹。
          folders: {
            some: {
              project: {
                isDeleted: false,
                OR: [{ id: 'hero-child' }, { parentId: 'hero-child' }],
              },
            },
          },
          outputType: 'IMAGE',
          status: 'COMPLETED',
        }),
        take: ASSISTANT_OPERATOR_LIMITS.maxFolderVisionImages,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    )
  })

  it('uses 8 + 8 + 1 for seventeen images', async () => {
    mockGenerationFindMany.mockResolvedValue(generationRows(17))

    const result = await inspectAssistantAssetFolder({
      userId: USER_ID,
      folderId: 'hero-child',
      instruction: '比较这些角色图',
    })

    expect(result.inspectedImages).toBe(17)
    expect(result.truncated).toBe(false)
    expect(
      mockCompleteVisionStructured.mock.calls.map(
        ([params]) => (params as { imageData: string[] }).imageData.length,
      ),
    ).toEqual([8, 8, 1])
  })

  it('does not borrow a visual route or call a model for an empty folder', async () => {
    mockQueryRaw.mockResolvedValue(folderCounts({ 'hero-child': 0 }))
    mockGenerationFindMany.mockResolvedValue([])

    const result = await inspectAssistantAssetFolder({
      userId: USER_ID,
      folderId: 'hero-child',
      instruction: '看看这里',
    })

    expect(result.inspectedImages).toBe(0)
    expect(result.findings).toEqual([])
    expect(result.visionAdapter).toBeNull()
    expect(mockResolveVisionRoute).not.toHaveBeenCalled()
    expect(mockCompleteVisionStructured).not.toHaveBeenCalled()
  })

  it('rejects a folder that does not belong to this user before reading generations', async () => {
    await expect(
      inspectAssistantAssetFolder({
        userId: USER_ID,
        folderId: 'someone-elses-folder',
        instruction: '看看这里',
      }),
    ).rejects.toMatchObject({ errorCode: 'ASSET_FOLDER_NOT_FOUND' })

    expect(mockGenerationFindMany).not.toHaveBeenCalled()
    expect(mockCompleteVisionStructured).not.toHaveBeenCalled()
  })

  it('rejects incomplete visual output instead of pretending every image was seen', async () => {
    mockGenerationFindMany.mockResolvedValue(generationRows(3))
    mockCompleteVisionStructured.mockImplementation(
      async (params: { schema: { safeParse(value: unknown): unknown } }) => {
        const incomplete = {
          items: [
            {
              imageIndex: 0,
              observation: 'only one image described',
              relevance: 'high',
              reason: 'visible',
              tags: [],
            },
          ],
          summary: 'incomplete',
          uncertainties: [],
        }
        const parsed = params.schema.safeParse(incomplete) as {
          success: boolean
          error?: unknown
        }
        if (!parsed.success) throw parsed.error
        return incomplete
      },
    )

    await expect(
      inspectAssistantAssetFolder({
        userId: USER_ID,
        folderId: 'hero-child',
        instruction: '逐张看',
      }),
    ).rejects.toBeDefined()
  })
})
