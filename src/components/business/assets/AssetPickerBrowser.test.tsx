import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSET_BROWSER_PAGE_SIZE } from '@/constants/assets-grid'
import { useGallery } from '@/hooks/use-gallery'
import { AssetPickerBrowser } from './AssetPickerBrowser'

/**
 * `pageSize` 是**页大小**，不是上限 —— 助手那颗弹层（切片 #7c）传 10，整页素材库
 * 仍是 24。⚠ 这条闸盯的是「传下去了没有」：漏传的表现是助手弹层首屏照旧拉 24 条，
 * 而界面上什么都不会报错。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}))

vi.mock('@/hooks/use-gallery', () => ({
  useGallery: vi.fn(() => ({
    generations: [],
    isLoading: false,
    hasLoaded: true,
    hasMore: false,
    sentinelRef: { current: null },
    filters: { search: '' },
    setFilters: vi.fn(),
    prependGeneration: vi.fn(),
  })),
}))

vi.mock('@/hooks/use-asset-picker-navigation', () => ({
  useAssetPickerNavigation: () => ({
    projects: [],
    counts: null,
    refreshCounts: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-justified-grid', () => ({
  useAssetGridViewport: () => 'desktop',
  useJustifiedGrid: () => ({ containerRef: { current: null }, rows: [] }),
}))

vi.mock('@/components/business/assets/AssetPickerFolderNav', () => ({
  AssetPickerFolderNav: () => null,
}))

const mockUseGallery = vi.mocked(useGallery)

function renderPicker(pageSize?: number) {
  render(
    <AssetPickerBrowser
      mode="multi"
      mediaType="image"
      title="Pick asset"
      onCancel={vi.fn()}
      {...(pageSize != null ? { pageSize } : {})}
    />,
  )
  return mockUseGallery.mock.calls.at(-1)?.[0]
}

describe('AssetPickerBrowser 的页大小', () => {
  it('默认仍是整页素材库那一档', () => {
    expect(renderPicker()?.limit).toBe(ASSET_BROWSER_PAGE_SIZE)
  })

  it('调用方给了就透传给 useGallery', () => {
    expect(renderPicker(10)?.limit).toBe(10)
  })
})
