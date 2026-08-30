import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import type { CivitaiLoraLibraryItem, HuggingFaceLoraSearchItem } from '@/types'

import { LoraLibraryModal } from './LoraLibraryModal'

/**
 * 库 modal 的 HF「使用」这条**老路**至今不带来源快照（服务端日志上的
 * `hasSourceSnapshot` 就是为标记这个缺口加的）。这个文件盯的就是那一格：
 * 收藏请求里必须带 `sourceSnapshot`，且作者 / 许可 / **commit sha** 逐项对得上。
 *
 * ⚠ 这是「可选 prop 漏传 = 三绿而功能全失效」那一类：`sourceSnapshot` 在
 * `FavoriteLoraRequestSchema` 上是 optional，漏了编译器一声不吭、全量测试照过，
 * 唯一的表现是库里的 HF 行看不出是谁做的。所以断言必须**看请求体**。
 */

const mockUseCivitaiLoraLibrary = vi.hoisted(() => vi.fn())
const mockUseHuggingFaceLoraLibrary = vi.hoisted(() => vi.fn())
const mockFavoriteExternalLora = vi.hoisted(() => vi.fn())
const mockStackPush = vi.hoisted(() => vi.fn())
const mockFetchDownloadPolicy = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/hooks/use-huggingface-showcase-cover', () => ({
  useHuggingFaceShowcaseCover: () => ({
    coverUrl: null,
    isPending: false,
    setObservedElement: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({
    items: [],
    push: mockStackPush,
    setScale: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-lora-assets', () => ({
  useLoraAssets: () => ({
    favoriteExternalLora: mockFavoriteExternalLora,
    favoriteAssets: [],
    trainedAssets: [],
    isLoadingMine: false,
  }),
}))

vi.mock('@/hooks/use-civitai-lora-library', () => ({
  useCivitaiLoraLibrary: mockUseCivitaiLoraLibrary,
}))

vi.mock('@/hooks/use-huggingface-lora-library', () => ({
  useHuggingFaceLoraLibrary: mockUseHuggingFaceLoraLibrary,
}))

vi.mock('@/lib/api-client', () => ({
  fetchCivitaiLoraDownloadPolicyAPI: mockFetchDownloadPolicy,
}))

const HF_ITEM: HuggingFaceLoraSearchItem = {
  repoId: 'ostris/ikea-instructions-lora-sdxl',
  name: 'IKEA Instructions',
  modelPageUrl: 'https://huggingface.co/ostris/ikea-instructions-lora-sdxl',
  revision: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  files: [
    {
      filename: 'ikea.safetensors',
      downloadUrl:
        'https://huggingface.co/ostris/resolve/main/ikea.safetensors',
      sizeBytes: 171_000_000,
      baseModelFamily: 'SDXL',
    },
  ],
  triggerWord: 'ikea instructions, manual style',
  type: 'style',
  baseModelFamily: 'SDXL',
  coverImageUrl: 'https://huggingface.co/cover.png',
  tags: ['lora'],
  downloads: 1200,
  likes: 340,
  license: 'creativeml-openrail-m',
  gated: false,
  private: false,
}

// 2026-08-29 真机根因那把：作者在 Civitai 关掉了下载（`usageControl` 是
// `Generation`）。version id 照抄真实的那把，方便日后对回证据。
const CIVITAI_ITEM: CivitaiLoraLibraryItem = {
  id: 'civitai_2266398',
  styleCode: 'ananta',
  name: 'Ananta',
  source: 'imported',
  type: 'style',
  baseModelFamily: 'Illustrious',
  provider: 'civitai',
  triggerWord: 'ananta',
  loraUrl: 'https://civitai.com/api/download/models/2266398',
  coverImageUrl: 'https://example.com/cover.png',
  previewImageUrls: [],
  defaultScale: 1,
  isPublic: true,
  isOwn: false,
  createdAt: '2026-08-29T00:00:00.000Z',
  modelId: 2002323,
  modelVersionId: 2266398,
  versionName: 'v1.0',
  creatorName: 'creator',
  creatorAvatarUrl: null,
  modelPageUrl: 'https://civitai.com/models/2002323',
  tags: [],
  downloadCount: 0,
  thumbsUpCount: 24,
  allowCommercialUse: ['RentCivit'],
  allowDerivatives: false,
  thumbImageUrl: 'https://example.com/thumb.png',
  coverImageUrlOriginal: 'https://example.com/cover-original.png',
  triggerAlternates: [],
  recommendedPrompt: null,
  recommendedPromptAlternates: [],
  triggerSource: 'official',
  fileHashAutoV3: null,
}

function libraryShell(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    search: '',
    debouncedSearch: '',
    contentType: 'all',
    sort: 'downloads',
    total: null,
    page: 1,
    hasNextPage: false,
    isLoading: false,
    isRevalidating: false,
    error: null,
    setSearch: vi.fn(),
    setContentType: vi.fn(),
    setSort: vi.fn(),
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchDownloadPolicy.mockResolvedValue({
    success: true,
    data: {
      modelVersionId: CIVITAI_ITEM.modelVersionId,
      downloadDisabled: false,
      usageControl: 'Download',
      name: CIVITAI_ITEM.name,
    },
  })
  mockFavoriteExternalLora.mockResolvedValue({
    id: 'asset_1',
    name: HF_ITEM.name,
    loraUrl: HF_ITEM.files[0]?.downloadUrl,
  })
  mockUseCivitaiLoraLibrary.mockReturnValue(
    libraryShell({
      items: [CIVITAI_ITEM],
      baseModel: 'all',
      setBaseModel: vi.fn(),
      nsfwFilter: 'safe',
      setNsfwFilter: vi.fn(),
    }),
  )
  mockUseHuggingFaceLoraLibrary.mockReturnValue(
    libraryShell({
      items: [HF_ITEM],
      baseModelFamily: 'all',
      setBaseModelFamily: vi.fn(),
      // 抓取时刻由 hook 记 —— 快照里的 retrievedAt 直接用它。
      retrievedAt: '2026-08-21T09:30:00.000Z',
    }),
  )
})

async function openHuggingFaceTabAndUse() {
  render(<LoraLibraryModal open onOpenChange={vi.fn()} />)
  fireEvent.click(
    screen.getByRole('button', {
      name: 'LoraWorkbench:librarySourceHuggingFace',
    }),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: 'LoraWorkbench:library.use' }),
  )
  await waitFor(() => {
    expect(mockFavoriteExternalLora).toHaveBeenCalledTimes(1)
  })
  return mockFavoriteExternalLora.mock.calls[0]?.[0] as Record<string, unknown>
}

describe('LoraLibraryModal · HF「使用」带来源快照', () => {
  it('收藏请求里有 sourceSnapshot，且逐项对得上上游说的事实', async () => {
    const payload = await openHuggingFaceTabAndUse()

    expect(payload.sourceSnapshot).toEqual({
      source: 'huggingface',
      // 作者 = repoId 的命名空间段。
      author: 'ostris',
      license: {
        label: 'creativeml-openrail-m',
        // HF 没有 Civitai 那套逐项权限位 —— null ≠ 「不允许」。
        commercialUse: null,
        allowDerivatives: null,
        allowNoCredit: null,
        known: true,
      },
      pageUrl: HF_ITEM.modelPageUrl,
      // ⭐ 锁的哪个 commit —— 这一格此前恒空。
      revision: HF_ITEM.revision,
      // ⚠ 是**列表回来的那一刻**（hook 记的），不是点击时刻。
      retrievedAt: '2026-08-21T09:30:00.000Z',
      fileSizeBytes: 171_000_000,
      metadataCompleteness: 'complete',
    })
    // 快照没有把老字段挤掉。
    expect(payload.loraUrl).toBe(HF_ITEM.files[0]?.downloadUrl)
    expect(payload.provider).toBe('huggingface')
    expect(mockStackPush).toHaveBeenCalledTimes(1)
  })

  it('retrievedAt 是可解析的 ISO 时间戳（不是占位串）', async () => {
    const payload = await openHuggingFaceTabAndUse()
    const snapshot = payload.sourceSnapshot as { retrievedAt: string }

    expect(Number.isNaN(Date.parse(snapshot.retrievedAt))).toBe(false)
  })
})

// ── 挂载前的下载闸 ──────────────────────────────────────────────────────
//
// 2026-08-29 owner 真机：挂了一把作者在 Civitai 关掉下载的 LoRA，Runner 线和
// 云端 API 线都在几十秒后以 401 收场，而 401 一路被翻成「你的 API Key 无效或
// 已过期」。服务端已经在派发前拦下，这里是更早的一道：挂都不让挂。
//
// ⚠ 判不了时必须放行 —— 上游抽风不能变成「这把 LoRA 不能用」。
describe('LoraLibraryModal · 挂载前的 Civitai 下载闸', () => {
  async function clickUseOnCivitaiCard() {
    render(<LoraLibraryModal open onOpenChange={vi.fn()} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'LoraWorkbench:library.use' }),
    )
  }

  it('作者关掉下载时不挂载，并说出真实原因', async () => {
    mockFetchDownloadPolicy.mockResolvedValue({
      success: true,
      data: {
        modelVersionId: 2266398,
        downloadDisabled: true,
        usageControl: 'Generation',
        name: 'Ananta',
      },
    })

    await clickUseOnCivitaiCard()

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'LoraWorkbench:library.mountBlockedDownloadDisabled',
        expect.anything(),
      )
    })
    expect(mockStackPush).not.toHaveBeenCalled()
    // ⛔ 绝不能退回那句假话。
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining('invalid_api_key'),
      expect.anything(),
    )
  })

  it('可下载时照常挂载', async () => {
    await clickUseOnCivitaiCard()

    await waitFor(() => {
      expect(mockStackPush).toHaveBeenCalledWith(CIVITAI_ITEM)
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('判不了（上游没给判据）时放行，不把 Civitai 抽风变成挡路', async () => {
    mockFetchDownloadPolicy.mockResolvedValue({
      success: false,
      error: 'Failed with status 502',
    })

    await clickUseOnCivitaiCard()

    await waitFor(() => {
      expect(mockStackPush).toHaveBeenCalledWith(CIVITAI_ITEM)
    })
  })

  it('只问一次 —— 闸在飞时连点不会挂两把', async () => {
    let resolvePolicy: (value: unknown) => void = () => {}
    mockFetchDownloadPolicy.mockReturnValue(
      new Promise((resolve) => {
        resolvePolicy = resolve
      }),
    )

    render(<LoraLibraryModal open onOpenChange={vi.fn()} />)
    const useButton = await screen.findByRole('button', {
      name: 'LoraWorkbench:library.use',
    })
    fireEvent.click(useButton)
    fireEvent.click(useButton)

    resolvePolicy({
      success: true,
      data: {
        modelVersionId: 2266398,
        downloadDisabled: false,
        usageControl: 'Download',
        name: 'Ananta',
      },
    })

    await waitFor(() => {
      expect(mockStackPush).toHaveBeenCalledTimes(1)
    })
    expect(mockFetchDownloadPolicy).toHaveBeenCalledTimes(1)
  })
})
