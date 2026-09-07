// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantOperatorWebImage } from '@/types/assistant-operator'

import { StudioOperatorWebCandidateGrid } from './StudioOperatorWebCandidateGrid'

/**
 * 候选网格的三字段闸（切片 3b）。
 *
 * 钉三件事：
 *  ① **域名可点开原页**，且点它**不算选用**（与点缩略图开灯箱同一条纪律：
 *     浏览不是采购，拍板 21）；
 *  ② 发布者缺席时写「未知」，⛔ 不拿域名冒充（那两行答的不是同一个问题）；
 *  ③ `usableAsInput=false` 的那格「选用」**禁用并就地说明**——⛔ 不是把格子藏起来，
 *     用户仍然要能点开原页去看。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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

/** 发布者缺席的那一张 —— 第二行该写「未知」。 */
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

function renderGrid(images: readonly AssistantOperatorWebImage[]) {
  const onToggle = vi.fn()
  render(
    <StudioOperatorWebCandidateGrid
      entryId="run-1:step-1"
      images={images}
      webImport={undefined}
      limit={4}
      onToggle={onToggle}
    />,
  )
  return { onToggle }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('候选网格 · 来源三字段（切片 3b）', () => {
  it('域名一行可点开原页（新窗），⛔ 点它不算选用', () => {
    const { onToggle } = renderGrid([USABLE])
    const link = screen.getByTestId('operator-web-candidate-source')

    expect(link.getAttribute('href')).toBe('https://example.com/post/a')
    expect(link.getAttribute('target')).toBe('_blank')
    // ⛔ `noopener` 少一个字都不行：目标是任意第三方站。
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toContain('example.com')

    fireEvent.click(link)
    expect(onToggle).not.toHaveBeenCalled()
    expect(openOperatorLightbox).not.toHaveBeenCalled()
  })

  it('发布者缺席时写「未知」，⛔ 不拿域名冒充', () => {
    renderGrid([USABLE, NO_PUBLISHER])
    const publishers = screen
      .getAllByTestId('operator-web-candidate-publisher')
      .map((node) => node.textContent)
    expect(publishers).toEqual(['Example Blog', 'web.publisherUnknown'])
  })

  it('⛔ 不可作输入：格子还在、原页还点得开，只有「选用」禁用并就地说明', () => {
    const { onToggle } = renderGrid([BLOCKED])

    // 格子没消失 —— 用户仍然要能看、要能点开出处。
    expect(screen.getAllByTestId('operator-web-candidate')).toHaveLength(1)
    expect(screen.getByTestId('operator-web-candidate-source')).toBeTruthy()

    const use = screen.getByTestId('operator-web-candidate-use')
    expect((use as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(use)
    expect(onToggle).not.toHaveBeenCalled()

    // 理由**就地**写着，⛔ 不让用户去别处找「为什么这张点不了」。
    expect(screen.getByTestId('operator-web-candidate-blocked')).toBeTruthy()
    expect(
      screen.getByTestId('operator-web-candidate-usable').textContent,
    ).toBe('web.referenceOnly')
  })
})

/**
 * 🔬 2026-09-07 真机：一行里同时有「403 拒了」和「不是图片格式」两种失败，而
 * 界面上只写第一条 —— 用户读到的原因与他正看的那一格对不上。
 */
describe('候选网格 · 失败原因写在那一格下面（2026-09-07）', () => {
  it('每个失败格各写各的原因，⛔ 不是整行共用一句', () => {
    render(
      <StudioOperatorWebCandidateGrid
        entryId="run-1:step-1"
        images={[USABLE, NO_PUBLISHER]}
        webImport={{
          picks: [
            {
              imageUrl: USABLE.imageUrl,
              status: 'error',
              error: '这张图所在的站点拒绝了我们的下载',
            },
            {
              imageUrl: NO_PUBLISHER.imageUrl,
              status: 'error',
              error: '这个链接不是能收下的图片格式',
            },
          ],
        }}
        limit={4}
        onToggle={vi.fn()}
      />,
    )
    const reasons = screen
      .getAllByTestId('operator-web-candidate-error')
      .map((node) => node.textContent)
    expect(reasons).toEqual([
      '这张图所在的站点拒绝了我们的下载',
      '这个链接不是能收下的图片格式',
    ])
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
    ])
    const use = screen.getByTestId('operator-web-candidate-use')
    expect((use as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByTestId('operator-web-candidate-blocked').textContent,
    ).toBe('web.notUsableHotlink')
  })
})

describe('候选网格 · 「把能用的都挂上」（2026-09-06）', () => {
  function renderWith(
    images: readonly AssistantOperatorWebImage[],
    webImport?: Parameters<
      typeof StudioOperatorWebCandidateGrid
    >[0]['webImport'],
    limit = 4,
  ) {
    const onToggle = vi.fn()
    render(
      <StudioOperatorWebCandidateGrid
        entryId="run-1:step-1"
        images={images}
        webImport={webImport}
        limit={limit}
        onToggle={onToggle}
      />,
    )
    return { onToggle }
  }

  it('⭐ 一下挂上所有**可用**的候选，⛔ 不碰 blocked 那张', () => {
    const { onToggle } = renderWith([USABLE, NO_PUBLISHER, BLOCKED])

    fireEvent.click(screen.getByTestId('operator-web-use-all'))

    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(onToggle.mock.calls.map((call) => call[1])).toEqual([
      USABLE,
      NO_PUBLISHER,
    ])
  })

  it('⭐ 受参考位上限约束：剩几个名额就挂几张', () => {
    const { onToggle } = renderWith([USABLE, NO_PUBLISHER], undefined, 1)

    fireEvent.click(screen.getByTestId('operator-web-use-all'))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[1]).toEqual(USABLE)
  })

  it('⚠ 名额满了 = 按钮禁用，⛔ 不挤掉用户已经挑好的那张', () => {
    const { onToggle } = renderWith(
      [USABLE, NO_PUBLISHER],
      {
        picks: [
          {
            imageUrl: NO_PUBLISHER.imageUrl,
            status: 'imported',
            generationId: 'gen-1',
          },
        ],
      },
      1,
    )

    const button = screen.getByTestId('operator-web-use-all')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('已经选过的那张不会被再点一次（⛔ 那会变成取消选用）', () => {
    const { onToggle } = renderWith([USABLE, NO_PUBLISHER], {
      picks: [
        {
          imageUrl: USABLE.imageUrl,
          status: 'imported',
          generationId: 'gen-1',
        },
      ],
    })

    fireEvent.click(screen.getByTestId('operator-web-use-all'))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]?.[1]).toEqual(NO_PUBLISHER)
  })

  it('一张可用的都没有时禁用', () => {
    renderWith([BLOCKED])
    expect(screen.getByTestId('operator-web-use-all')).toBeDisabled()
  })
})
