import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HuggingFaceLoraSearchItem } from '@/types'

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
  mockFavoriteExternalLora.mockResolvedValue({
    id: 'asset_1',
    name: HF_ITEM.name,
    loraUrl: HF_ITEM.files[0]?.downloadUrl,
  })
  mockUseCivitaiLoraLibrary.mockReturnValue(
    libraryShell({
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
