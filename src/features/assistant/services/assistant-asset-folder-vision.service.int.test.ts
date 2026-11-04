import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

/**
 * 看图那一跳只在模型边界上假（`llmTextCompletion`）：素材库的夹与图、助手那一家的 key
 * 都是真库里的行（L2a），路由与结构化输出的解析 / 校验都是真代码。
 */
const mockLlm = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...args: unknown[]) => mockLlm(...args),
}))

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  inspectAssistantAssetFolder,
  listAssistantAssetFolders,
} from '@/features/assistant/services/assistant-asset-folder-vision.service'
import { runWithTimers } from '@/test/fake-fetch'
import { plainKeyOf, seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { createTestFolder, createTestGeneration } from '@/test/int/generations'

let userId = ''
let folders: Record<'characters' | 'heroChild' | 'heroRoot', string>

/** 看图模型认真看了这一批里的每一张。 */
function describeEveryImage() {
  mockLlm.mockImplementation(async (params: { imageData: string[] }) =>
    JSON.stringify({
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
}

/** 往夹里放几张图：createdAt 依次往后，最新的是最后一张。 */
async function fillFolder(folderId: string, count: number, prefix: string) {
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const generation = await createTestGeneration(userId, {
      url: `https://cdn.example.com/${prefix}-${index + 1}.png`,
      createdAt: new Date(Date.UTC(2026, 7, 31, 0, index)),
    })
    ids.push(generation.id)
  }
  await db.projectItem.createMany({
    data: ids.map((generationId) => ({ projectId: folderId, generationId })),
  })
  return ids
}

const batchSizes = () =>
  mockLlm.mock.calls.map(
    ([params]) => (params as { imageData: string[] }).imageData.length,
  )

beforeEach(async () => {
  vi.clearAllMocks()
  await resetDatabase()
  userId = (await createTestUser()).id
  await seedAssistantKeys(userId, {
    keys: [{ adapterType: AI_ADAPTER_TYPES.GEMINI, id: 'key-1' }],
    routeModel: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
  })
  const characters = await createTestFolder(userId, 'Characters')
  const heroChild = await createTestFolder(userId, 'Hero', {
    parentId: characters.id,
  })
  const heroRoot = await createTestFolder(userId, 'Hero')
  folders = {
    characters: characters.id,
    heroChild: heroChild.id,
    heroRoot: heroRoot.id,
  }
  describeEveryImage()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('listAssistantAssetFolders（真库）', () => {
  it('returns real ids with disambiguating full paths and image counts', async () => {
    await fillFolder(folders.heroChild, 3, 'child')
    await fillFolder(folders.heroRoot, 2, 'root')
    // 两个夹里都放着的同一张只算一次。
    const [shared] = await fillFolder(folders.characters, 1, 'shared')
    await db.projectItem.create({
      data: { projectId: folders.heroChild, generationId: shared! },
    })
    // 别人同名的夹不出现。
    const stranger = await createTestUser()
    await createTestFolder(stranger.id, 'Hero')

    const result = await listAssistantAssetFolders({ userId, query: 'hero' })

    expect(result).toEqual([
      {
        folderId: folders.heroChild,
        name: 'Hero',
        path: 'Characters / Hero',
        imageCount: 4,
      },
      {
        folderId: folders.heroRoot,
        name: 'Hero',
        path: 'Hero',
        imageCount: 2,
      },
    ])
  })

  it('matches a parent/child path, not only the leaf name', async () => {
    const result = await listAssistantAssetFolders({
      userId,
      query: 'characters hero',
    })

    expect(result.map((folder) => folder.folderId)).toEqual([folders.heroChild])
  })
})

describe('inspectAssistantAssetFolder（真库）', () => {
  it('checks at most 24 images in deterministic batches of 8 and reports coverage honestly', async () => {
    const grandchild = await createTestFolder(userId, 'Pose', {
      parentId: folders.heroChild,
    })
    await fillFolder(folders.heroChild, 20, 'child')
    // 孙夹里的也算（与素材页同一个范围：这个夹连所有层的子孙夹）。
    await fillFolder(grandchild.id, 10, 'grand')
    // 别的夹里的不算。
    await fillFolder(folders.heroRoot, 5, 'root')

    const result = await inspectAssistantAssetFolder({
      userId,
      folderId: folders.heroChild,
      instruction: '挑出最适合做角色参考的三张',
      apiKeyId: 'key-1',
      modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
    })

    expect(result.totalImages).toBe(30)
    expect(result.inspectedImages).toBe(
      ASSISTANT_OPERATOR_LIMITS.maxFolderVisionImages,
    )
    expect(result.truncated).toBe(true)
    expect(result.batchCount).toBe(3)
    expect(result.findings).toHaveLength(24)
    expect(result.findings[0]).toMatchObject({
      observation: 'visible subject 1',
      relevance: 'high',
    })
    expect(batchSizes()).toEqual([8, 8, 8])
    // 「全跟助手」：看图用这一轮助手那把 key、那个型号，⛔ 不借别家。
    expect(mockLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.GEMINI,
        apiKey: plainKeyOf(AI_ADAPTER_TYPES.GEMINI),
        modelId: LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH,
      }),
    )
    const seen = mockLlm.mock.calls.flatMap(
      ([params]) => (params as { imageData: string[] }).imageData,
    )
    expect(seen.some((url) => url.includes('/root-'))).toBe(false)
  })

  it('uses 8 + 8 + 1 for seventeen images', async () => {
    await fillFolder(folders.heroChild, 17, 'child')

    const result = await inspectAssistantAssetFolder({
      userId,
      folderId: folders.heroChild,
      instruction: '比较这些角色图',
    })

    expect(result.inspectedImages).toBe(17)
    expect(result.truncated).toBe(false)
    expect(batchSizes()).toEqual([8, 8, 1])
  })

  it('does not borrow a visual route or call a model for an empty folder', async () => {
    const result = await inspectAssistantAssetFolder({
      userId,
      folderId: folders.heroChild,
      instruction: '看看这里',
    })

    expect(result.inspectedImages).toBe(0)
    expect(result.findings).toEqual([])
    expect(result.visionAdapter).toBeNull()
    expect(mockLlm).not.toHaveBeenCalled()
  })

  it('rejects a folder that does not belong to this user', async () => {
    const stranger = await createTestUser()
    const theirs = await createTestFolder(stranger.id, 'Secret')

    await expect(
      inspectAssistantAssetFolder({
        userId,
        folderId: theirs.id,
        instruction: '看看这里',
      }),
    ).rejects.toMatchObject({ errorCode: 'ASSET_FOLDER_NOT_FOUND' })
    expect(mockLlm).not.toHaveBeenCalled()
  })

  it('rejects incomplete visual output instead of pretending every image was seen', async () => {
    await fillFolder(folders.heroChild, 3, 'child')
    mockLlm.mockResolvedValue(
      JSON.stringify({
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
      }),
    )
    // 不合规会打回重试一次（退避是真 `setTimeout`）：用假时钟拨过去。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await expect(
      runWithTimers(
        inspectAssistantAssetFolder({
          userId,
          folderId: folders.heroChild,
          instruction: '逐张看',
        }),
      ),
    ).rejects.toBeDefined()
  })
})
