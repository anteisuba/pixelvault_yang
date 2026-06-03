import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listCivitaiLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import type { CivitaiLoraLibraryItem, CivitaiLoraLibraryResult } from '@/types'

import {
  __resetCivitaiLibraryCacheForTests,
  useCivitaiLoraLibrary,
} from './use-civitai-lora-library'

vi.mock('@/lib/api-client/lora-assets', () => ({
  listCivitaiLoraAssetsAPI: vi.fn(),
}))

vi.mock('next-intl', () => {
  const t = (key: string) => key

  return {
    useTranslations: () => t,
  }
})

const mockListCivitaiLoraAssetsAPI = vi.mocked(listCivitaiLoraAssetsAPI)

function makeItem(
  id: string,
  baseModelFamily = 'Anima',
): CivitaiLoraLibraryItem {
  const numericId = Number(id.replace(/\D/g, '')) || 1

  return {
    id: `civitai:${numericId}:${numericId + 100}`,
    styleCode: `civitai-${numericId + 100}`,
    name: `LoRA ${id}`,
    source: 'imported',
    type: 'style',
    baseModelFamily,
    provider: 'civitai',
    triggerWord: `trigger-${id}`,
    triggerAlternates: [],
    recommendedPrompt: null,
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: null,
    loraUrl: `https://example.com/lora/${id}.safetensors`,
    coverImageUrl: null,
    coverImageUrlOriginal: null,
    thumbImageUrl: null,
    previewImageUrls: [],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: '2026-05-20T00:00:00.000Z',
    modelId: numericId,
    modelVersionId: numericId + 100,
    versionName: 'v1',
    creatorName: null,
    creatorAvatarUrl: null,
    modelPageUrl: `https://civitai.com/models/${numericId}`,
    tags: [],
    downloadCount: 0,
    thumbsUpCount: 0,
    allowCommercialUse: [],
    allowDerivatives: false,
  }
}

function makeResult(
  items: CivitaiLoraLibraryItem[],
  page: number,
  nextCursor: string | null,
): CivitaiLoraLibraryResult {
  return {
    items,
    page,
    pageSize: 10,
    total: null,
    hasNextPage: nextCursor !== null,
    nextCursor,
  }
}

describe('useCivitaiLoraLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetCivitaiLibraryCacheForTests()
  })

  it('uses Civitai cursors when paginating a selected base model', async () => {
    mockListCivitaiLoraAssetsAPI
      .mockResolvedValueOnce({
        success: true,
        data: makeResult([makeItem('all-1', 'SDXL 1.0')], 1, 'all-cursor'),
      })
      .mockResolvedValueOnce({
        success: true,
        data: makeResult([makeItem('anima-1')], 1, 'anima-cursor'),
      })
      .mockResolvedValueOnce({
        success: true,
        data: makeResult([makeItem('anima-2')], 2, null),
      })

    const { result } = renderHook(() => useCivitaiLoraLibrary())

    await waitFor(() => {
      expect(result.current.items[0]?.name).toBe('LoRA all-1')
    })

    act(() => {
      result.current.setBaseModel('Anima')
    })

    await waitFor(() => {
      expect(result.current.items[0]?.name).toBe('LoRA anima-1')
    })

    expect(mockListCivitaiLoraAssetsAPI.mock.calls[1]?.[0]).toMatchObject({
      page: 1,
      cursor: null,
      baseModel: 'Anima',
    })

    act(() => {
      result.current.nextPage()
    })

    await waitFor(() => {
      expect(result.current.items[0]?.name).toBe('LoRA anima-2')
    })

    expect(mockListCivitaiLoraAssetsAPI.mock.calls[2]?.[0]).toMatchObject({
      page: 2,
      cursor: 'anima-cursor',
      baseModel: 'Anima',
    })
  })
})
