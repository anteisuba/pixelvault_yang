// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_TOOL_IDS } from '@/constants/assistant-operator'
import type { AssistantOperatorCritiqueStep } from '@/types/assistant-operator'

import { StudioOperatorCritiqueCard } from './StudioOperatorCritiqueCard'

/**
 * 评价卡（P3-C，拍板 6「评价卡内嵌它评的那张图」）。
 *
 * 钉四件事：
 *  ① **证据长在结论里** —— 卡上真的画着它评的那张（画的是缩略图，灯箱开原图）；
 *  ② ✓ / ✗ 分得开 —— 一张全是勾的卡等于没评；
 *  ③ 借路要**说出来** —— 不说的话用户会以为自己选的模型有视觉能力；
 *  ④ 「还原这轮」在**没有可还原的东西时不渲染** —— 一颗点了什么都不会发生的
 *    按钮比没有按钮糟：用户会以为自己已经撤过了。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
    return t
  },
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const openLightbox = vi.hoisted(() => vi.fn())
vi.mock(
  '@/components/business/studio/assistant-operator/StudioOperatorLightbox',
  () => ({ openOperatorLightbox: openLightbox }),
)

type DoneCritiqueStep = AssistantOperatorCritiqueStep & {
  result: NonNullable<AssistantOperatorCritiqueStep['result']>
}

const STEP: DoneCritiqueStep = {
  id: 'step-1',
  title: '看看刚出的那张',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  payload: {
    imageUrl: 'https://cdn.example.com/result.png',
    thumbnailUrl: 'https://cdn.example.com/result.thumbnail.webp',
    modelLabel: 'Seedream 4',
    goal: 'a girl under a red umbrella',
  },
  result: {
    findings: [
      { ok: true, text: '红伞是画面唯一的暖色' },
      { ok: false, text: '雨丝糊成一片' },
    ],
    advice: '把雨的方向写进提示词',
    borrowedVisionRoute: false,
  },
}

function renderCard(
  overrides: Partial<
    React.ComponentProps<typeof StudioOperatorCritiqueCard>
  > = {},
) {
  const onRevertRound = vi.fn()
  render(
    <StudioOperatorCritiqueCard
      step={STEP}
      runKey="run-1"
      roundChangeCount={3}
      onRevertRound={onRevertRound}
      {...overrides}
    />,
  )
  return { onRevertRound }
}

describe('评价卡', () => {
  it('内嵌它评的那张 —— 画缩略图，点开灯箱开原图', () => {
    renderCard()

    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', STEP.payload.thumbnailUrl)

    fireEvent.click(screen.getByTestId('operator-critique-evidence'))
    expect(openLightbox).toHaveBeenCalledWith(
      STEP.payload.imageUrl,
      expect.any(String),
    )
  })

  it('没有缩略图时回落到原图（⛔ 不留一个空框）', () => {
    renderCard({
      step: {
        ...STEP,
        payload: { ...STEP.payload, thumbnailUrl: undefined },
      },
    })
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      STEP.payload.imageUrl,
    )
  })

  it('达成的与没达成的都摆出来', () => {
    renderCard()
    expect(screen.getByText('红伞是画面唯一的暖色')).toBeInTheDocument()
    expect(screen.getByText('雨丝糊成一片')).toBeInTheDocument()
  })

  it('借路时如实说出来，没借时不说', () => {
    renderCard({
      step: {
        ...STEP,
        result: { ...STEP.result, borrowedVisionRoute: true },
      },
    })
    expect(screen.getByTestId('operator-critique-borrowed')).toBeInTheDocument()
  })

  it('没借路就不摆那行字', () => {
    renderCard()
    expect(
      screen.queryByTestId('operator-critique-borrowed'),
    ).not.toBeInTheDocument()
  })

  it('「还原这轮」带着数，点一下把这一轮的 token 交回去', () => {
    const { onRevertRound } = renderCard()

    const button = screen.getByTestId('operator-critique-revert-round')
    expect(button.textContent).toContain('"count":3')
    fireEvent.click(button)
    expect(onRevertRound).toHaveBeenCalledWith('run-1')
  })

  it('这一轮没有可还原的东西时不渲染那颗按钮', () => {
    renderCard({ roundChangeCount: 0 })
    expect(
      screen.queryByTestId('operator-critique-revert-round'),
    ).not.toBeInTheDocument()
  })
})
