// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantOperatorWebImage } from '@/types/assistant-operator'

import { StudioOperatorWebCandidateGrid } from './StudioOperatorWebCandidateGrid'

/**
 * **找到的图**那一格的回归闸（切片 3b → 搜索期切片 1，2026-10-15）。
 *
 * 钉这几件事：
 *  ① 格子里画**缩略图**，⛔ 不带我们的 Referer（原图直链约三成 403）；
 *  ② **点图 = 开灯箱看原图（取不到退缩略图），一次导入都不发**（拍板 21：浏览不是采购）；
 *  ③ 点圈只是选上，「挂上 N 张」才把选上的交出去；已挂上的点圈 = 取下；每格各算各的态；
 *  ④ 来源网站那一行新窗打开原页，⛔ 点它不算选用；
 *  ⑤ `usableAsInput=false` 的那格没有圈、写「只能看原页」并说明理由——⛔ 不是把格子藏起来；
 *  ⑥ 还在搜 = 同形状灰块；先给 8 张；头上一行「搜索 Google 图片：… · N 张」。
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

/** 发布者 / 缩略图都缺席的那一张。 */
const NO_PUBLISHER: AssistantOperatorWebImage = {
  imageUrl: 'https://cdn.other.com/b.jpg',
  pageUrl: 'https://other.com/b',
  domain: 'other.com',
  usableAsInput: true,
  sourceVerdict: 'allowed',
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
  const onToggle = vi.fn()
  render(
    <StudioOperatorWebCandidateGrid
      entryId="run-1:step-1"
      query="初音未来 官方立绘"
      images={images}
      webImport={undefined}
      limit={4}
      onToggle={onToggle}
      {...overrides}
    />,
  )
  return { onToggle }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE', '')
})

describe('找到的图 · 网格（搜索期切片 1）', () => {
  it('还在搜 = 同形状的灰块（按要的张数，最多 8 格），⛔ 没有按钮', () => {
    renderGrid(null, { placeholderCount: 6 })
    const grid = screen.getByTestId('operator-web-candidates')
    expect(grid.getAttribute('data-state')).toBe('loading')
    expect(grid.getAttribute('aria-busy')).toBe('true')
    expect(
      screen.getAllByTestId('operator-web-candidate-skeleton'),
    ).toHaveLength(6)
    expect(screen.queryByTestId('operator-web-candidate')).toBeNull()
    expect(screen.queryByTestId('operator-web-use-all')).toBeNull()
  })

  it('头上一行写搜了什么、找到几张；⭐ 先给 8 张', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      ...USABLE,
      imageUrl: `https://cdn.example.com/${index}.jpg`,
    }))
    renderGrid(many)
    expect(
      screen.getByTestId('operator-web-candidates-caption').textContent,
    ).toBe('web.found {"query":"初音未来 官方立绘","count":8}')
    expect(screen.getAllByTestId('operator-web-candidate')).toHaveLength(8)
  })

  it('一张都没找到 = 整块不画', () => {
    renderGrid([])
    expect(screen.queryByTestId('operator-web-candidates')).toBeNull()
  })

  it('格子里画缩略图（没有才回落原图），⛔ 不带 Referer；卡下写来源网站与这一张能不能用', () => {
    renderGrid([USABLE, NO_PUBLISHER, BLOCKED])
    const tiles = screen.getAllByTestId('operator-web-candidate')
    const images = tiles.map((tile) => tile.querySelector('img'))
    expect(images.map((image) => image?.getAttribute('src'))).toEqual([
      'https://tbn.example.com/a.jpg',
      'https://cdn.other.com/b.jpg',
      'https://i.pinimg.com/c.jpg',
    ])
    for (const image of images) {
      expect(image?.getAttribute('referrerpolicy')).toBe('no-referrer')
    }
    // 来源网站：发布者优先，没有写域名。
    expect(
      screen
        .getAllByTestId('operator-web-candidate-domain')
        .map((chip) => chip.textContent),
    ).toEqual(['Example Blog', 'other.com', 'Pinterest'])
    expect(
      screen
        .getAllByTestId('operator-web-candidate-status')
        .map((line) => line.textContent),
    ).toEqual([
      'web.statusUsableUnknownLicense',
      'web.statusUsable',
      'web.statusViewOnly',
    ])
  })

  it('胶片条：一条横排、放不下左右滑；宽按原比例分三档', () => {
    renderGrid([
      { ...USABLE, width: 800, height: 1200 },
      { ...NO_PUBLISHER, width: 1000, height: 1000 },
      { ...BLOCKED, width: 1600, height: 900 },
    ])
    expect(
      screen.getByTestId('operator-web-candidate-strip').className,
    ).toContain('overflow-x-auto')
    expect(
      screen
        .getAllByTestId('operator-web-candidate-tile')
        .map((tile) => tile.className.match(/\bw-(32|44|64)\b/)?.[0]),
    ).toEqual(['w-32', 'w-44', 'w-64'])
  })

  it('缩略图取不到就试原图，都取不到画断图标，⛔ 破图标', () => {
    renderGrid([USABLE])
    const tile = screen.getByTestId('operator-web-candidate')
    fireEvent.error(tile.querySelector('img') as HTMLImageElement)
    expect(tile.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.example.com/a.jpg',
    )
    fireEvent.error(tile.querySelector('img') as HTMLImageElement)
    expect(tile.querySelector('img')).toBeNull()
    expect(
      screen.getByTestId('operator-web-candidate-unavailable'),
    ).toBeTruthy()
  })

  /**
   * ⭐ 拍板 21 的正面：**看不等于要**。owner 真机点一下缩略图就下载了一张，
   * 换个选择再下载一张，而换掉的还留着。
   */
  it('⭐ 点缩略图 = 开灯箱看**原图**（按第三方取、退路是缩略图），⛔ 一次导入都不发', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER])
    fireEvent.click(screen.getAllByTestId('operator-web-candidate')[0]!)
    expect(onToggle).not.toHaveBeenCalled()
    expect(openOperatorLightbox).toHaveBeenCalledWith(
      'https://cdn.example.com/a.jpg',
      'candidate A · Example Blog',
      { thirdParty: true, fallbackUrl: 'https://tbn.example.com/a.jpg' },
    )
    // 没有标题、没有发布者：说明退回域名 —— ⛔ 不编一个「发布者」出来。
    fireEvent.click(screen.getAllByTestId('operator-web-candidate')[1]!)
    expect(openOperatorLightbox).toHaveBeenLastCalledWith(
      'https://cdn.other.com/b.jpg',
      'other.com',
      { thirdParty: true },
    )
  })

  it('「打开来源」= 来源网站那一行，新窗打开原页，⛔ 点它不算选用', () => {
    const { onToggle } = renderGrid([USABLE])
    const link = screen.getByTestId('operator-web-candidate-source')
    expect(link.getAttribute('href')).toBe('https://example.com/post/a')
    expect(link.getAttribute('target')).toBe('_blank')
    // ⛔ `noopener` 少一个字都不行：目标是任意第三方站。
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('aria-label')).toBe(
      'web.openPageOf {"site":"Example Blog"}',
    )
    fireEvent.click(link)
    expect(onToggle).not.toHaveBeenCalled()
    expect(openOperatorLightbox).not.toHaveBeenCalled()
  })

  it('⭐ 点圈只是选上（⛔ 不发请求）；「挂上 N 张」才把选上的那几张交出去', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER])
    const circles = screen.getAllByTestId('operator-web-candidate-use')
    const commit = screen.getByTestId('operator-web-use-all')
    expect(commit).toBeDisabled()
    fireEvent.click(circles[1]!)
    fireEvent.click(circles[0]!)
    expect(onToggle).not.toHaveBeenCalled()
    expect(openOperatorLightbox).not.toHaveBeenCalled()
    expect(
      circles.map((circle) => circle.getAttribute('aria-pressed')),
    ).toEqual(['true', 'true'])
    expect(screen.getByTestId('operator-web-bar-title').textContent).toBe(
      'web.barStaged {"count":2}',
    )
    expect(commit.textContent).toBe('web.useAll {"count":2}')
    // 选的先后就是挂的先后。
    fireEvent.click(commit)
    expect(onToggle.mock.calls).toEqual([
      ['run-1:step-1', NO_PUBLISHER],
      ['run-1:step-1', USABLE],
    ])
  })

  it('选上的再点圈 = 取消选择；已挂上的点圈 = 取下（交给 hook）', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER], {
      webImport: {
        picks: [
          { imageUrl: USABLE.imageUrl, status: 'imported', generationId: 'g' },
        ],
      },
    })
    const tiles = screen.getAllByTestId('operator-web-candidate')
    expect(tiles.map((tile) => tile.dataset.state)).toEqual([
      'imported',
      'idle',
    ])
    const circles = screen.getAllByTestId('operator-web-candidate-use')
    expect(
      circles.map((circle) => circle.getAttribute('aria-pressed')),
    ).toEqual(['true', 'false'])
    fireEvent.click(circles[1]!)
    expect(circles[1]!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(circles[1]!)
    expect(circles[1]!.getAttribute('aria-pressed')).toBe('false')
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(circles[0]!)
    expect(onToggle).toHaveBeenCalledWith('run-1:step-1', USABLE)
  })

  it('在飞时那一格转圈、底下那条写正在收进几张（导入中大声说出来）', () => {
    renderGrid([USABLE], {
      webImport: {
        picks: [{ imageUrl: USABLE.imageUrl, status: 'importing' }],
      },
    })
    expect(screen.getAllByTestId('spinner').length).toBeGreaterThan(0)
    expect(screen.getByTestId('operator-web-candidate-use')).toBeDisabled()
    expect(screen.getByTestId('operator-web-bar-title').textContent).toBe(
      'web.barImporting {"count":1}',
    )
  })

  it('⛔ 不可作输入：格子还在、原页还点得开，没有选择圈，状态写「只能看原页」并说明理由', () => {
    renderGrid([USABLE, BLOCKED])
    expect(screen.getAllByTestId('operator-web-candidate')).toHaveLength(2)
    expect(screen.getAllByTestId('operator-web-candidate-source')).toHaveLength(
      2,
    )
    expect(screen.getAllByTestId('operator-web-candidate-use')).toHaveLength(1)
    expect(
      screen.getAllByTestId('operator-web-candidate-status')[1]!.textContent,
    ).toBe('web.statusViewOnly')

    // 理由写在胶片条底下，说的是哪个站。
    expect(
      screen.getByTestId('operator-web-candidate-blocked').textContent,
    ).toBe(
      'web.blockedNote {"domains":"pinterest.com","reason":"web.notUsable"}',
    )
  })

  it('回复点名的那张：左下写「回复提到」', () => {
    renderGrid(
      [
        { ...USABLE, n: 3 },
        { ...NO_PUBLISHER, n: 4 },
      ],
      {
        namedFinds: new Set(['run-1:step-1#3']),
      },
    )
    expect(
      screen
        .getAllByTestId('operator-web-candidate-number')
        .map((badge) => badge.textContent),
    ).toEqual(['#3', '#4'])
    expect(screen.getAllByTestId('operator-web-candidate-named')).toHaveLength(
      1,
    )
  })

  it('热链保护档：点之前就说明白「取不回来」，⛔ 不与版权那句混为一谈', () => {
    renderGrid([
      {
        imageUrl: 'https://i.pximg.net/x.jpg',
        pageUrl: 'https://www.pixiv.net/artworks/1',
        domain: 'pixiv.net',
        usableAsInput: false,
        sourceVerdict: 'hotlinkProtected',
      },
      BLOCKED,
    ])
    expect(
      screen
        .getAllByTestId('operator-web-candidate-blocked')
        .map((note) => note.textContent),
    ).toEqual([
      'web.blockedNote {"domains":"pixiv.net","reason":"web.notUsableHotlink"}',
      'web.blockedNote {"domains":"pinterest.com","reason":"web.notUsable"}',
    ])
  })
})

/**
 * 🔬 2026-09-07 真机：一行里同时有「403 拒了」和「不是图片格式」两种失败，而
 * 界面上只写第一条 —— 用户读到的原因与他正看的那一格对不上。
 */
describe('找到的图 · 失败写在那一格下面（2026-09-07）', () => {
  it('每个失败格各写各的原因，那一格不消失，别格不被弄脏', () => {
    renderGrid([USABLE, NO_PUBLISHER, BLOCKED], {
      webImport: {
        picks: [
          { imageUrl: USABLE.imageUrl, status: 'imported', generationId: 'g' },
          {
            imageUrl: NO_PUBLISHER.imageUrl,
            status: 'error',
            error: '这个链接不是能收下的图片格式',
          },
        ],
      },
    })
    const tiles = screen.getAllByTestId('operator-web-candidate')
    expect(tiles.map((tile) => tile.dataset.state)).toEqual([
      'imported',
      'error',
      'idle',
    ])
    expect(tiles[1]?.dataset.selected).toBe('true')
    expect(
      screen
        .getAllByTestId('operator-web-candidate-error')
        .map((node) => node.textContent),
    ).toEqual(['这个链接不是能收下的图片格式'])
  })

  it('⛔ 清理失败也不静默（拍板 21 的零残留有没有做到，要说出来）', () => {
    renderGrid([USABLE], {
      webImport: { picks: [], cleanupError: '换下来的那张没能删掉' },
    })
    expect(screen.getByTestId('operator-web-cleanup-error').textContent).toBe(
      '换下来的那张没能删掉',
    )
  })
})

describe('找到的图 · 「全选能用的」+「挂上 N 张」（2026-09-06 → 胶片条）', () => {
  it('⭐ 全选只选**可用**的候选，挂上时 ⛔ 不碰 blocked 那张', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER, BLOCKED])
    fireEvent.click(screen.getByTestId('operator-web-select-all'))
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('operator-web-use-all'))
    expect(onToggle.mock.calls.map((call) => call[1])).toEqual([
      USABLE,
      NO_PUBLISHER,
    ])
  })

  it('⭐ 受参考位上限约束：剩几个名额就选几张，多的照实说', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER], { limit: 1 })
    fireEvent.click(screen.getByTestId('operator-web-select-all'))
    expect(screen.getByTestId('operator-web-bar-sub').textContent).toBe(
      'web.barNoRoomStaged',
    )
    // 名额用完了，再点另一张的圈只提示，⛔ 不换掉已选的那张。
    fireEvent.click(screen.getAllByTestId('operator-web-candidate-use')[1]!)
    fireEvent.click(screen.getByTestId('operator-web-use-all'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[1]).toEqual(USABLE)
  })

  it('⚠ 参考位满了：挂上键禁用、没有全选，点圈只提示，⛔ 不挤掉已经挂上的那张', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER], {
      limit: 1,
      webImport: {
        picks: [
          {
            imageUrl: NO_PUBLISHER.imageUrl,
            status: 'imported',
            generationId: 'gen-1',
          },
        ],
      },
    })
    expect(screen.getByTestId('operator-web-use-all')).toBeDisabled()
    expect(screen.queryByTestId('operator-web-select-all')).toBeNull()
    expect(screen.getByTestId('operator-web-bar-title').textContent).toBe(
      'web.barFull {"limit":1}',
    )
    fireEvent.click(screen.getAllByTestId('operator-web-candidate-use')[0]!)
    expect(onToggle).not.toHaveBeenCalled()
    expect(
      screen
        .getAllByTestId('operator-web-candidate-use')[0]!
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('已经挂上的那张不会被全选再交一次（⛔ 那会变成取下）', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER], {
      webImport: {
        picks: [
          { imageUrl: USABLE.imageUrl, status: 'imported', generationId: 'g' },
        ],
      },
    })
    fireEvent.click(screen.getByTestId('operator-web-select-all'))
    fireEvent.click(screen.getByTestId('operator-web-use-all'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[1]).toEqual(NO_PUBLISHER)
  })

  it('上次没取回来的那张：再选上、再挂上 = 交给 hook 重试', () => {
    const { onToggle } = renderGrid([USABLE], {
      webImport: {
        picks: [{ imageUrl: USABLE.imageUrl, status: 'error', error: '403' }],
      },
    })
    fireEvent.click(screen.getByTestId('operator-web-candidate-use'))
    fireEvent.click(screen.getByTestId('operator-web-use-all'))
    expect(onToggle).toHaveBeenCalledWith('run-1:step-1', USABLE)
  })

  it('一张可用的都没有：没有全选，挂上键禁用', () => {
    renderGrid([BLOCKED])
    expect(screen.queryByTestId('operator-web-select-all')).toBeNull()
    expect(screen.getByTestId('operator-web-use-all')).toBeDisabled()
  })
})

describe('宿主没有参考位（角色页，卡片助手 C3）', () => {
  it('候选只能看不能选：没有选择圈也没有底下那条，点缩略图照样开灯箱', () => {
    renderGrid([USABLE, BLOCKED], { limit: 0 })
    expect(screen.queryByTestId('operator-web-candidate-use')).toBeNull()
    expect(screen.queryByTestId('operator-web-use-all')).toBeNull()
    expect(screen.queryByTestId('operator-web-bar')).toBeNull()
    expect(screen.queryByTestId('operator-web-candidate-blocked')).toBeNull()
    // 打开来源照样在。
    expect(screen.getAllByTestId('operator-web-candidate-source')).toHaveLength(
      2,
    )
    fireEvent.click(screen.getAllByTestId('operator-web-candidate')[0]!)
    expect(openOperatorLightbox).toHaveBeenCalled()
  })
})
