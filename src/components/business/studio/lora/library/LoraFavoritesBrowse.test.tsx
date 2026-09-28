import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CivitaiLoraLibraryItem, LoraAssetRecord } from '@/types'

import { LoraFavoritesBrowse } from './LoraFavoritesBrowse'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}:${key}:${JSON.stringify(values)}` : `${ns}:${key}`,
  useFormatter: () => ({
    number: (value: number) => String(value),
    relativeTime: () => 'now',
    dateTime: () => 'Aug 14',
  }),
}))

vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

const mockPush = vi.fn()
let mockStackItems: {
  asset: { id: string; loraUrl: string; modelVersionId?: number }
}[] = []
vi.mock('@/hooks/use-active-lora-stack', () => ({
  useActiveLoraStack: () => ({ items: mockStackItems, push: mockPush }),
}))
vi.mock('@/hooks/use-civitai-download-gate', () => ({
  useCivitaiDownloadGate: () => ({ ensureMountable: async () => true }),
}))
vi.mock('@/hooks/use-local-preference', () => ({
  useLocalPreference: () => ['safe', vi.fn()],
}))

// 详情页取回的那一版：链接写法与收藏记录不同，版本号相同。
let mockVersions: CivitaiLoraLibraryItem[] = []
vi.mock('@/hooks/prompts/use-civitai-model-description', () => ({
  useCivitaiModelDetail: () => ({
    descriptionText: null,
    versions: mockVersions,
    isLoading: false,
  }),
}))
vi.mock('@/hooks/prompts/use-civitai-mined-prompts', () => ({
  useCivitaiMinedPrompts: () => ({
    recipes: [],
    previewImages: [],
    isLoading: false,
  }),
}))

function makeAsset(
  id: string,
  name: string,
  overrides: Partial<LoraAssetRecord> = {},
): LoraAssetRecord {
  return {
    id,
    styleCode: `pv-${id}`,
    name,
    source: 'imported',
    type: 'subject',
    baseModelFamily: 'Anima',
    provider: 'civitai',
    triggerWord: `${name.toLowerCase()} (wuwa)`,
    loraUrl: `https://civitai.com/api/download/models/${id}`,
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: false,
    isOwn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

const roccia = makeAsset('3001', 'Roccia', {
  modelId: 30,
  modelVersionId: 3001,
})
const qingxiao = makeAsset('3002', 'Qingxiao', {
  modelId: 31,
  modelVersionId: 3002,
  baseModelFamily: 'Illustrious',
  createdAt: '2026-09-10T00:00:00.000Z',
})

function renderFavorites(overrides: Record<string, unknown> = {}) {
  const props = {
    trained: [],
    favorites: [roccia, qingxiao],
    isLoading: false,
    error: null,
    onRefresh: vi.fn(),
    onUnfavoriteByUrl: vi.fn().mockResolvedValue(true),
    onFavoriteCivitai: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(true),
    onVisibilityChange: vi.fn(),
    isFavorited: (url: string) =>
      [roccia.loraUrl, qingxiao.loraUrl].includes(url),
    onGoLibrary: vi.fn(),
    onGoTrain: vi.fn(),
    ...overrides,
  }
  render(<LoraFavoritesBrowse {...props} />)
  return props
}

describe('LoraFavoritesBrowse（库 B · 收藏）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStackItems = []
    mockVersions = []
  })

  it('lists favorites newest first with the trigger word under each name', () => {
    renderFavorites()

    const names = screen
      .getAllByRole('button', { name: /^(Roccia|Qingxiao)$/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(['Qingxiao', 'Roccia'])
    expect(screen.getByText('roccia (wuwa)')).toBeInTheDocument()
  })

  it('filters on this machine by name or trigger word', () => {
    renderFavorites()

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'LoraWorkbench:myLorasSearchPlaceholder',
      }),
      { target: { value: 'qing' } },
    )
    expect(screen.queryByRole('button', { name: 'Roccia' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Qingxiao' })).toBeInTheDocument()
  })

  it('mounts the favorite record itself, in place', () => {
    renderFavorites()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench.browse:mountLabel:{"name":"Roccia"}',
      }),
    )
    expect(mockPush).toHaveBeenCalledWith(roccia)
  })

  it('knows the fetched version is the favorite — unfavorites by the record’s own link', async () => {
    mockVersions = [
      {
        ...roccia,
        id: 'civitai:30:3001',
        loraUrl:
          'https://civitai.com/api/download/models/3001?type=Model&format=SafeTensor',
        modelId: 30,
        modelVersionId: 3001,
        versionName: 'v1.0',
        creatorName: null,
        creatorAvatarUrl: null,
        modelPageUrl: 'https://civitai.com/models/30?modelVersionId=3001',
        tags: [],
        downloadCount: 175,
        thumbsUpCount: 17,
        allowCommercialUse: [],
        allowDerivatives: false,
        thumbImageUrl: null,
        coverImageUrlOriginal: null,
        triggerAlternates: [],
        recommendedPrompt: null,
        recommendedPromptAlternates: [],
        triggerSource: 'official',
        fileHashAutoV3: null,
      },
    ]
    const props = renderFavorites()

    fireEvent.click(screen.getByRole('button', { name: 'Roccia' }))
    const favorite = await screen.findByRole('button', {
      name: 'LoraWorkbench:favorited',
    })
    fireEvent.click(favorite)

    await waitFor(() =>
      expect(props.onUnfavoriteByUrl).toHaveBeenCalledWith(roccia.loraUrl),
    )
    expect(props.onFavoriteCivitai).not.toHaveBeenCalled()
  })

  it('offers training when there is nothing trained yet', () => {
    const props = renderFavorites()

    fireEvent.click(
      screen.getByRole('button', {
        name: /LoraWorkbench:myLorasTrainedSection/,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'LoraWorkbench:myLorasEmptyCtaTrain',
      }),
    )
    expect(props.onGoTrain).toHaveBeenCalled()
  })
})
