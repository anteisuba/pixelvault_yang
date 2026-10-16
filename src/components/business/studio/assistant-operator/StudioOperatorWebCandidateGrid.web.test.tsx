// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantOperatorWebImage } from '@/types/assistant-operator'

import { StudioOperatorWebCandidateGrid } from './StudioOperatorWebCandidateGrid'

/**
 * **找到的图**那一格的回归闸（搜索期 → P4 第 12 项，owner 2026-10-16）。
 *
 *  ① 格子里画**缩略图**，⛔ 不带我们的 Referer；
 *  ② 点图 = 开灯箱看原图，一次保存都不发（拍板 21：浏览不是采购）；
 *  ③ 点圈只是选上，选了才浮出「选了 N 张 · #n / 清空 / 保存」，按「保存」才交出去；
 *     存好的圈变 ✓ 且点不动；
 *  ④ 电脑上按原比例铺行、先两行、多了「还有 N 张」；手机是胶片条；
 *  ⑤ 不可作输入的那格没有圈，底下写理由；回复点名的那格黑框、⛔ 没有「回复提到」字样。
 */

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

const openOperatorLightbox = vi.hoisted(() => vi.fn())
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorLightbox',
  () => ({ openOperatorLightbox }),
)

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }))

const USABLE: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.example.com/a.jpg',
  thumbnailUrl: 'https://tbn.example.com/a.jpg',
  pageUrl: 'https://example.com/post/a',
  domain: 'example.com',
  publisher: 'Example Blog',
  usableAsInput: true,
  sourceVerdict: 'unknownLicense',
  title: 'candidate A',
}

const BLOCKED: AssistantOperatorWebImage = {
  imageUrl: 'https://i.pinimg.com/c.jpg',
  pageUrl: 'https://www.pinterest.com/pin/1',
  domain: 'pinterest.com',
  publisher: 'Pinterest',
  usableAsInput: false,
  sourceVerdict: 'blocked',
}

type GridProps = Parameters<typeof StudioOperatorWebCandidateGrid>[0]

function renderGrid(
  images: GridProps['images'],
  overrides: Partial<GridProps> = {},
) {
  const onSave = vi.fn()
  const view = render(
    <StudioOperatorWebCandidateGrid
      entryId="run-1:step-1"
      query="初音未来 官方立绘"
      images={images}
      webImport={undefined}
      onSave={onSave}
      {...overrides}
    />,
  )
  return { onSave, view }
}

function many(count: number): AssistantOperatorWebImage[] {
  return Array.from({ length: count }, (_, index) => ({
    ...USABLE,
    imageUrl: `https://cdn.example.com/${index}.jpg`,
    width: 1200,
    height: 800,
    n: index + 1,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mobile.value = false
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
})

describe('找到的图 · 网格', () => {
  it('还在搜 = 灰块（按要的张数，最多 8 格），⛔ 没有按钮', () => {
    renderGrid(null, { placeholderCount: 6 })
    const grid = screen.getByTestId('operator-web-candidates')
    expect(grid.getAttribute('data-state')).toBe('loading')
    expect(
      screen.getAllByTestId('operator-web-candidate-skeleton'),
    ).toHaveLength(6)
    expect(screen.queryByTestId('operator-web-candidate')).toBeNull()
    expect(screen.queryByTestId('operator-web-bar')).toBeNull()
  })

  it('头上一行写搜了什么、找到几张；⭐ 先给 8 张', () => {
    renderGrid(many(10))
    expect(
      screen.getByTestId('operator-web-candidates-caption').textContent,
    ).toContain('"count":8')
    expect(screen.getAllByTestId('operator-web-candidate-tile')).toHaveLength(8)
  })

  it('格子里画缩略图，⛔ 不带 Referer；点图开灯箱、⛔ 不保存', () => {
    const { onSave } = renderGrid([USABLE])
    const img = screen
      .getByTestId('operator-web-candidate')
      .querySelector('img')!
    expect(img.getAttribute('src')).toBe(USABLE.thumbnailUrl)
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    fireEvent.click(screen.getByTestId('operator-web-candidate'))
    expect(openOperatorLightbox).toHaveBeenCalledWith(
      USABLE.imageUrl,
      expect.any(String),
      expect.objectContaining({ thirdParty: true }),
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('⭐ 电脑：按原比例铺行，先露两行，「还有 N 张」放出来', () => {
    // 面板宽 ≈ 400：3:2 的图一行放两张，8 张排四行。
    const width = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(400)
    renderGrid(many(8))
    width.mockRestore()
    const grid = screen.getByTestId('operator-web-candidates')
    expect(grid.getAttribute('data-layout')).toBe('rows')
    const rows = screen
      .getByTestId('operator-web-candidate-rows')
      .querySelectorAll('ul')
    expect(rows.length).toBeGreaterThan(2)
    const hidden = [...rows].filter((row) => row.hidden)
    const hiddenTiles = hidden.reduce(
      (sum, row) => sum + row.querySelectorAll('li').length,
      0,
    )
    const more = screen.getByTestId('operator-web-more')
    expect(more.textContent).toContain(`"count":${hiddenTiles}`)
    fireEvent.click(more)
    expect(
      [
        ...screen
          .getByTestId('operator-web-candidate-rows')
          .querySelectorAll('ul'),
      ].some((row) => row.hidden),
    ).toBe(false)
    expect(screen.queryByTestId('operator-web-more')).toBeNull()
  })

  it('手机：仍是胶片条，站名写在格子下面', () => {
    mobile.value = true
    renderGrid([USABLE])
    expect(
      screen.getByTestId('operator-web-candidates').getAttribute('data-layout'),
    ).toBe('strip')
    expect(screen.getByTestId('operator-web-candidate-strip')).toBeTruthy()
    const source = screen.getByTestId('operator-web-candidate-source')
    expect(source.textContent).toBe('Example Blog')
    expect(source.getAttribute('href')).toBe(USABLE.pageUrl)
  })

  it('⭐ 点圈只是选上（⛔ 不保存）；选了才出那一条，「保存」交出去并清掉选择', () => {
    const images = many(3)
    const { onSave } = renderGrid(images)
    expect(screen.queryByTestId('operator-web-bar')).toBeNull()
    const circles = screen.getAllByTestId('operator-web-candidate-use')
    fireEvent.click(circles[2]!)
    fireEvent.click(circles[0]!)
    expect(onSave).not.toHaveBeenCalled()
    const title = screen.getByTestId('operator-web-bar-title').textContent
    expect(title).toContain('"count":2')
    expect(title).toContain('#3')
    expect(title).toContain('#1')
    fireEvent.click(screen.getByTestId('operator-web-save'))
    expect(onSave).toHaveBeenCalledWith('run-1:step-1', [images[2], images[0]])
    expect(screen.queryByTestId('operator-web-save')).toBeNull()
  })

  it('选上的再点 = 取消；「清空」一次全清', () => {
    renderGrid(many(3))
    const circles = screen.getAllByTestId('operator-web-candidate-use')
    fireEvent.click(circles[0]!)
    fireEvent.click(circles[0]!)
    expect(screen.queryByTestId('operator-web-bar')).toBeNull()
    fireEvent.click(circles[0]!)
    fireEvent.click(circles[1]!)
    fireEvent.click(screen.getByTestId('operator-web-clear'))
    expect(screen.queryByTestId('operator-web-bar')).toBeNull()
  })

  it('存好的那张圈变 ✓、点不动；在存的转圈，底下那条写正在存几张', () => {
    const images = many(2)
    renderGrid(images, {
      webImport: {
        picks: [
          {
            imageUrl: images[0]!.imageUrl,
            status: 'saved',
            generationId: 'g1',
          },
          { imageUrl: images[1]!.imageUrl, status: 'saving' },
        ],
      },
    })
    const circles = screen.getAllByTestId('operator-web-candidate-use')
    expect(circles[0]!.getAttribute('data-state')).toBe('saved')
    expect(circles[0]).toBeDisabled()
    expect(circles[1]).toBeDisabled()
    expect(screen.getByTestId('operator-web-bar-title').textContent).toContain(
      'web.barSaving',
    )
  })

  it('失败写在底下（哪一张 + 原因），那一格还能再选上重试', () => {
    const images = many(2)
    renderGrid(images, {
      webImport: {
        picks: [
          { imageUrl: images[1]!.imageUrl, status: 'error', error: '403' },
        ],
      },
    })
    const error = screen.getByTestId('operator-web-candidate-error')
    expect(error.textContent).toContain('#2')
    expect(error.textContent).toContain('403')
    const circle = screen.getAllByTestId('operator-web-candidate-use')[1]!
    expect(circle).toBeEnabled()
  })

  it('⛔ 不可作输入：格子还在，没有圈，底下说明理由', () => {
    renderGrid([USABLE, BLOCKED])
    expect(screen.getAllByTestId('operator-web-candidate-tile')).toHaveLength(2)
    expect(screen.getAllByTestId('operator-web-candidate-use')).toHaveLength(1)
    expect(
      screen.getByTestId('operator-web-candidate-blocked').textContent,
    ).toContain('pinterest.com')
  })

  it('回复点名的那张：常驻黑框，⛔ 没有「回复提到」字样', () => {
    const images = many(2)
    renderGrid(images, { namedFinds: new Set(['run-1:step-1#2']) })
    const tiles = screen.getAllByTestId('operator-web-candidate-tile')
    expect(tiles[1]!.getAttribute('data-find-named')).toBe('true')
    expect(screen.queryByText('web.namedBadge')).toBeNull()
  })

  it('没有 onSave = 只能看：⛔ 不画圈', () => {
    renderGrid(many(2), { onSave: undefined })
    expect(screen.queryByTestId('operator-web-candidate-use')).toBeNull()
  })
})
