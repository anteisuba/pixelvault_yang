/**
 * L2b：素材选择器连真 `useGallery` / 真文件夹导航，只假网络。
 *
 * `pageSize` 是**页大小**，不是上限 —— 助手那颗弹层（切片 #7c）传 10，整页素材库
 * 仍是 24。⚠ 漏传的表现是助手弹层首屏照旧拉 24 条，而界面上什么都不会报错，
 * 所以这里看发出去的那条 `/api/images` 请求带的 limit。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_BROWSER_PAGE_SIZE } from '@/constants/assets-grid'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import { AssetPickerBrowser } from './AssetPickerBrowser'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-1', isSignedIn: true, isLoaded: true }),
}))

let imageLimits: string[]

beforeEach(() => {
  imageLimits = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  fakeServer()
    .on('GET', '/api/images', (request) => {
      imageLimits.push(request.nextUrl.searchParams.get('limit') ?? '')
      return Response.json({
        success: true,
        data: {
          generations: [],
          page: 1,
          limit: Number(request.nextUrl.searchParams.get('limit')),
          total: 0,
          hasMore: false,
          nextCursor: null,
        },
      })
    })
    .on('GET', '/api/projects', () =>
      Response.json({ success: true, data: [] }),
    )
    .on('GET', '/api/assets/section-counts', () =>
      Response.json({
        success: true,
        data: {
          all: 0,
          favorites: 0,
          published: 0,
          image: 0,
          video: 0,
          audio: 0,
          unassigned: 0,
          byProject: {},
          byModel: {},
        },
      }),
    )
})

afterEach(() => vi.unstubAllGlobals())

describe('AssetPickerBrowser 的页大小', () => {
  it('默认仍是整页素材库那一档', async () => {
    renderWithApp(
      <AssetPickerBrowser
        mode="multi"
        mediaType="image"
        title="Pick asset"
        onCancel={vi.fn()}
      />,
    )
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
    expect(new Set(imageLimits)).toEqual(
      new Set([String(ASSET_BROWSER_PAGE_SIZE)]),
    )
  })

  it('调用方给了就照它拉', async () => {
    renderWithApp(
      <AssetPickerBrowser
        mode="multi"
        mediaType="image"
        title="Pick asset"
        onCancel={vi.fn()}
        pageSize={10}
      />,
    )
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
    expect(new Set(imageLimits)).toEqual(new Set(['10']))
  })
})

describe('AssetPickerBrowser 的标题栏', () => {
  it('关闭钮与锁徽标同排（不是盖在标题栏上的浮层），点了走 onCancel', async () => {
    const onCancel = vi.fn()
    renderWithApp(
      <AssetPickerBrowser
        mode="single"
        mediaType="video"
        title="Pick asset"
        onCancel={onCancel}
      />,
    )

    const header = screen.getByRole('banner')
    const badge = within(header).getByText(
      message('AssetsPage.pickerLocked').replace(
        '{type}',
        message('AssetsPage.sidebarVideos'),
      ),
    )
    const close = within(header).getByRole('button', {
      name: message('Common.close'),
    })
    expect(close.parentElement).toBe(badge.parentElement)

    fireEvent.click(close)
    expect(onCancel).toHaveBeenCalledOnce()
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
  })
})
