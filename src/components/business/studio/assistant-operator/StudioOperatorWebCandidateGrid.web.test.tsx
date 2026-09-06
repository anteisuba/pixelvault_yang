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
