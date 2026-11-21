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
import { clearGalleryCache } from '@/lib/gallery-cache'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import { AssetPickerBrowser } from './AssetPickerBrowser'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-1', isSignedIn: true, isLoaded: true }),
}))

let imageLimits: string[]
let imageSearches: string[]
let server: ReturnType<typeof fakeServer>

beforeEach(() => {
  imageLimits = []
  imageSearches = []
  // 素材网格的首屏快照是模块级缓存：上一例的「空」会被这一例秒读，错误路径就走不到。
  clearGalleryCache()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  server = fakeServer()
    .on('GET', '/api/images', (request) => {
      imageLimits.push(request.nextUrl.searchParams.get('limit') ?? '')
      imageSearches.push(request.nextUrl.searchParams.get('search') ?? '')
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

function renderPicker(props: { mediaType?: 'image' | 'video' } = {}) {
  return renderWithApp(
    <AssetPickerBrowser
      mode="single"
      mediaType={props.mediaType ?? 'image'}
      title="Pick asset"
      onCancel={vi.fn()}
    />,
  )
}

describe('AssetPickerBrowser 的三态', () => {
  it('库里还没有这类素材：说是哪一类，锁图片时首格上传格照旧在', async () => {
    renderPicker()
    expect(
      await screen.findByText(
        message('AssetsPage.pickerEmptyTypeTitle').replace(
          '{type}',
          message('AssetsPage.sidebarImages'),
        ),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(message('AssetsPage.uploadButton')).length,
    ).toBeGreaterThan(0)
  })

  it('这个范围是空的：写出范围名 + 换范围的提示，不是「库里还没有」', async () => {
    renderPicker({ mediaType: 'video' })
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
    const nav = screen.getByRole('navigation', {
      name: message('AssetsPage.sidebarFolders'),
    })
    fireEvent.click(
      within(nav).getByRole('button', {
        name: new RegExp(message('AssetsPage.sidebarFavorites')),
      }),
    )
    expect(
      await screen.findByText(
        message('AssetsPage.emptyFolderTitle').replace(
          '{folder}',
          message('AssetsPage.sidebarFavorites'),
        ),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(message('AssetsPage.pickerEmptyScopeHint')),
    ).toBeInTheDocument()
  })

  it('搜了没有：回显搜索词，「清除」把搜索词清掉', async () => {
    renderPicker()
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
    const input = screen.getByLabelText(message('AssetsPage.search'))
    fireEvent.change(input, { target: { value: '猫' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(
      await screen.findByText(message('AssetsPage.emptySearchTitle')),
    ).toBeInTheDocument()
    expect(screen.getByText('“猫”')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: message('AssetsPage.facetClearAll') }),
    )
    expect(input).toHaveValue('')
    await waitFor(() => expect(imageSearches.at(-1)).toBe(''))
  })

  it('首屏失败：一句话 + 重试，重试成功后错误块收掉', async () => {
    let fail = true
    server.on('GET', '/api/images', (request) => {
      if (fail) {
        return Response.json(
          { success: false, error: 'boom' },
          { status: 500 },
        )
      }
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
    renderPicker()

    const retry = await screen.findByRole('button', {
      name: message('Feedback.retry'),
    })
    expect(
      screen.queryByText(
        message('AssetsPage.pickerEmptyTypeTitle').replace(
          '{type}',
          message('AssetsPage.sidebarImages'),
        ),
      ),
    ).not.toBeInTheDocument()

    fail = false
    fireEvent.click(retry)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: message('Feedback.retry') }),
      ).not.toBeInTheDocument(),
    )
    expect(
      await screen.findByText(
        message('AssetsPage.pickerEmptyTypeTitle').replace(
          '{type}',
          message('AssetsPage.sidebarImages'),
        ),
      ),
    ).toBeInTheDocument()
  })
})

describe('AssetPickerBrowser 的搜索', () => {
  it('打字不立刻搜，停 300ms 才搜', async () => {
    renderPicker()
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
    const input = screen.getByLabelText(message('AssetsPage.search'))
    fireEvent.change(input, { target: { value: '狗' } })
    expect(imageSearches).not.toContain('狗')
    await waitFor(() => expect(imageSearches).toContain('狗'))
  })

  it('回车立即搜（不等防抖）', async () => {
    renderPicker()
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
    const input = screen.getByLabelText(message('AssetsPage.search'))
    fireEvent.change(input, { target: { value: '鸟' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // 200 < 300：只有回车那条路能在这之前发出去。
    await waitFor(() => expect(imageSearches).toContain('鸟'), {
      timeout: 200,
    })
  })
})

describe('AssetPickerBrowser 的排序', () => {
  it('默认「最新」，与整页同一颗药丸', async () => {
    renderPicker()
    await waitFor(() => expect(imageLimits).not.toHaveLength(0))
    expect(
      screen.getByRole('button', { name: message('AssetsPage.facetSort') }),
    ).toHaveTextContent(message('AssetsPage.facetSortNewest'))
  })
})
