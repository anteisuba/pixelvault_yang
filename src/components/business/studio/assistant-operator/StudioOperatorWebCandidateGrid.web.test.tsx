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
 *  ③ 点「选用」才把那张交出去，已选的再点 = 取消；每格各算各的态；
 *  ④ 「打开来源」新窗打开原页，⛔ 点它不算选用；
 *  ⑤ `usableAsInput=false` 的那格「选用」**禁用并说明理由**——⛔ 不是把格子藏起来；
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

  it('格子里画缩略图（没有才回落原图），⛔ 不带 Referer；左下域名、右上能否当参考', () => {
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
    expect(
      screen
        .getAllByTestId('operator-web-candidate-domain')
        .map((chip) => chip.textContent),
    ).toEqual(['example.com', 'other.com', 'pinterest.com'])
    expect(
      screen
        .getAllByTestId('operator-web-candidate-usable')
        .map((dot) => [dot.dataset.usable, dot.textContent]),
    ).toEqual([
      ['true', 'web.usableUnknownLicense'],
      ['true', 'web.usable'],
      ['false', 'web.referenceOnly'],
    ])
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

  it('「打开来源」新窗打开原页，⛔ 点它不算选用', () => {
    const { onToggle } = renderGrid([USABLE])
    const link = screen.getByTestId('operator-web-candidate-source')
    expect(link.getAttribute('href')).toBe('https://example.com/post/a')
    expect(link.getAttribute('target')).toBe('_blank')
    // ⛔ `noopener` 少一个字都不行：目标是任意第三方站。
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('aria-label')).toBe('web.openPage')
    fireEvent.click(link)
    expect(onToggle).not.toHaveBeenCalled()
    expect(openOperatorLightbox).not.toHaveBeenCalled()
  })

  it('点「选用」才把那张候选交出去（转存由宿主的 hook 发起）', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER])
    fireEvent.click(screen.getAllByTestId('operator-web-candidate-use')[1]!)
    expect(onToggle).toHaveBeenCalledWith('run-1:step-1', NO_PUBLISHER)
    expect(openOperatorLightbox).not.toHaveBeenCalled()
  })

  it('⭐ 多选：已选一张时另一张照样可选；已选那张按下态，再点 = 取消选用', () => {
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
    const buttons = screen.getAllByTestId('operator-web-candidate-use')
    expect(
      buttons.map((button) => button.getAttribute('aria-pressed')),
    ).toEqual(['true', 'false'])
    fireEvent.click(buttons[1]!)
    fireEvent.click(buttons[0]!)
    expect(onToggle.mock.calls.map((call) => call[1])).toEqual([
      NO_PUBLISHER,
      USABLE,
    ])
  })

  it('在飞时那一格转圈（导入中大声说出来）', () => {
    renderGrid([USABLE], {
      webImport: {
        picks: [{ imageUrl: USABLE.imageUrl, status: 'importing' }],
      },
    })
    expect(screen.getByTestId('spinner')).toBeTruthy()
  })

  it('⛔ 不可作输入：格子还在、原页还点得开，「选用」禁用并说明理由', () => {
    const { onToggle } = renderGrid([USABLE, BLOCKED])
    expect(screen.getAllByTestId('operator-web-candidate')).toHaveLength(2)
    expect(screen.getAllByTestId('operator-web-candidate-source')).toHaveLength(
      2,
    )

    const use = screen.getAllByTestId('operator-web-candidate-use')[1]!
    expect((use as HTMLButtonElement).disabled).toBe(true)
    expect(use.textContent).toBe('web.cannotUse')
    expect(use.getAttribute('title')).toBe('web.notUsable')
    fireEvent.click(use)
    expect(onToggle).not.toHaveBeenCalled()

    // 理由写在网格底下，说的是哪个站。
    expect(
      screen.getByTestId('operator-web-candidate-blocked').textContent,
    ).toBe(
      'web.blockedNote {"domains":"pinterest.com","reason":"web.notUsable"}',
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

describe('找到的图 · 「把能用的都挂上」（2026-09-06）', () => {
  it('⭐ 一下挂上所有**可用**的候选，⛔ 不碰 blocked 那张', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER, BLOCKED])
    fireEvent.click(screen.getByTestId('operator-web-use-all'))
    expect(onToggle.mock.calls.map((call) => call[1])).toEqual([
      USABLE,
      NO_PUBLISHER,
    ])
  })

  it('⭐ 受参考位上限约束：剩几个名额就挂几张', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER], { limit: 1 })
    fireEvent.click(screen.getByTestId('operator-web-use-all'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[1]).toEqual(USABLE)
  })

  it('⚠ 名额满了 = 按钮禁用，⛔ 不挤掉用户已经挑好的那张', () => {
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
    const button = screen.getByTestId('operator-web-use-all')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('已经选过的那张不会被再点一次（⛔ 那会变成取消选用）', () => {
    const { onToggle } = renderGrid([USABLE, NO_PUBLISHER], {
      webImport: {
        picks: [
          { imageUrl: USABLE.imageUrl, status: 'imported', generationId: 'g' },
        ],
      },
    })
    fireEvent.click(screen.getByTestId('operator-web-use-all'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[1]).toEqual(NO_PUBLISHER)
  })

  it('一张可用的都没有时禁用', () => {
    renderGrid([BLOCKED])
    expect(screen.getByTestId('operator-web-use-all')).toBeDisabled()
  })
})

describe('宿主没有参考位（角色页，卡片助手 C3）', () => {
  it('候选只能看不能选：没有「选用」也没有「都挂上」，点缩略图照样开灯箱', () => {
    renderGrid([USABLE, BLOCKED], { limit: 0 })
    expect(screen.queryByTestId('operator-web-candidate-use')).toBeNull()
    expect(screen.queryByTestId('operator-web-use-all')).toBeNull()
    expect(screen.queryByTestId('operator-web-candidate-blocked')).toBeNull()
    // 打开来源照样在。
    expect(screen.getAllByTestId('operator-web-candidate-source')).toHaveLength(
      2,
    )
    fireEvent.click(screen.getAllByTestId('operator-web-candidate')[0]!)
    expect(openOperatorLightbox).toHaveBeenCalled()
  })
})
