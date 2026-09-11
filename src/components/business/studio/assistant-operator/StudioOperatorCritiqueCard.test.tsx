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

const IMAGE_PAYLOAD = {
  imageUrl: 'https://cdn.example.com/result.png',
  thumbnailUrl: 'https://cdn.example.com/result.thumbnail.webp',
  modelLabel: 'Seedream 4',
  goal: 'a girl under a red umbrella',
} as const

const STEP: DoneCritiqueStep = {
  id: 'step-1',
  title: '看看刚出的那张',
  status: 'done',
  tool: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
  verb: 'look',
  payload: IMAGE_PAYLOAD,
  result: {
    findings: [
      { severity: 'pass', text: '红伞是画面唯一的暖色' },
      { severity: 'fail', text: '雨丝糊成一片' },
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
    expect(img).toHaveAttribute('src', IMAGE_PAYLOAD.thumbnailUrl)

    fireEvent.click(screen.getByTestId('operator-critique-evidence'))
    expect(openLightbox).toHaveBeenCalledWith(
      IMAGE_PAYLOAD.imageUrl,
      expect.any(String),
    )
  })

  it('没有缩略图时回落到原图（⛔ 不留一个空框）', () => {
    renderCard({
      step: {
        ...STEP,
        payload: { ...IMAGE_PAYLOAD, thumbnailUrl: undefined },
      },
    })
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      IMAGE_PAYLOAD.imageUrl,
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

/**
 * ── 视频形态（第二期）─────────────────────────────────────────────
 *
 * 钉四件事：
 *  ① 三帧真的并排画出来，各带位置词 + 时间码；
 *  ② 点任一帧开的是**那一帧**的原图（不是结果视频本身）；
 *  ③ 三帧在场时单图那颗嵌图**让位** —— 证据已经在上面了，画两次是两个真相源；
 *  ④ 严重度分三段（否定 / 异常 / 达成），⛔ 不与达成项混在一起排。
 */
describe('评价卡 · 三段（否定 / 异常 / 达成）', () => {
  it('三档各走各的记号与颜色，顺序固定「否定 → 异常 → 达成」', () => {
    renderCard({
      step: {
        ...STEP,
        result: {
          ...STEP.result,
          findings: [
            { severity: 'pass', text: '红伞是画面唯一的暖色' },
            { severity: 'fail', text: '雨丝糊成一片' },
            { severity: 'warn', text: '构图对了，但左下角有一块噪点' },
          ],
        },
      } as DoneCritiqueStep,
    })

    const items = screen.getAllByTestId('operator-critique-verdict')
    expect(items.map((el) => el.dataset.severity)).toEqual([
      'fail',
      'warn',
      'pass',
    ])
    expect(items[0]?.querySelector('.text-status-risk')).not.toBeNull()
    expect(items[1]?.querySelector('.text-status-warning')).not.toBeNull()
    expect(items[2]?.querySelector('.text-status-applied')).not.toBeNull()
  })

  it('⛔ 一条 warn 都没有时不摆空段（空标题读起来像「还没检查」）', () => {
    renderCard()

    const items = screen.getAllByTestId('operator-critique-verdict')
    expect(items.map((el) => el.dataset.severity)).toEqual(['fail', 'pass'])
    expect(items.some((el) => el.querySelector('.text-status-warning'))).toBe(
      false,
    )
  })
})

describe('评价卡 · 视频形态', () => {
  const VIDEO_STEP: DoneCritiqueStep = {
    ...STEP,
    result: {
      ...STEP.result,
      frames: [
        { t: 0, url: 'https://cdn.example.com/f0.jpg', label: 'start' },
        { t: 3, url: 'https://cdn.example.com/f1.jpg', label: 'mid' },
        { t: 6.4, url: 'https://cdn.example.com/f2.jpg', label: 'end' },
      ],
      verdicts: [
        { severity: 'fail', text: '第二帧人物换了张脸' },
        { severity: 'pass', text: '镜头推进是连贯的' },
      ],
      // ⚠ 故意同时留着 `findings` —— 服务端统一两边命名之前，一条真事件上两个键
      //   都可能在。卡必须优先读 `verdicts`，⛔ 不能把图片域那份也一起画出来。
    } as unknown as DoneCritiqueStep['result'],
  }

  it('三帧并排 —— 位置词 + 时间码都在', () => {
    renderCard({ step: VIDEO_STEP })

    const frames = screen.getAllByTestId('operator-critique-frame')
    expect(frames).toHaveLength(3)
    expect(frames.map((el) => el.dataset.frameLabel)).toEqual([
      'start',
      'mid',
      'end',
    ])
    expect(frames[2]?.textContent).toContain('00:06')
  })

  it('点任一帧开的是那一帧的原图', () => {
    renderCard({ step: VIDEO_STEP })

    fireEvent.click(
      screen.getAllByTestId('operator-critique-frame')[1] as HTMLElement,
    )
    expect(openLightbox).toHaveBeenCalledWith(
      'https://cdn.example.com/f1.jpg',
      expect.any(String),
    )
  })

  it('三帧在场时单图那颗嵌图让位（⛔ 不画两份证据）', () => {
    renderCard({ step: VIDEO_STEP })
    expect(
      screen.queryByTestId('operator-critique-evidence'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('operator-critique-card').dataset.form).toBe(
      'video',
    )
  })

  it('读的是 verdicts 而不是 findings —— 否定项排在前面且走 status-risk', () => {
    renderCard({ step: VIDEO_STEP })

    const verdicts = screen.getAllByTestId('operator-critique-verdict')
    expect(verdicts).toHaveLength(2)
    expect(verdicts[0]?.dataset.severity).toBe('fail')
    expect(verdicts[0]?.textContent).toContain('第二帧人物换了张脸')
    expect(verdicts[0]?.querySelector('.text-status-risk')).not.toBeNull()
    // 图片域那份 findings 不该同时被画出来
    expect(screen.queryByText('雨丝糊成一片')).not.toBeInTheDocument()
  })

  it('「按这条建议改提示词」把 advice 交回宿主；宿主没有这只手时不渲染', () => {
    const onApplyAdvice = vi.fn()
    renderCard({ step: VIDEO_STEP, onApplyAdvice })
    fireEvent.click(screen.getByTestId('operator-critique-apply-advice'))
    expect(onApplyAdvice).toHaveBeenCalledWith('把雨的方向写进提示词')
    expect(screen.getByTestId('operator-critique-apply-advice')).toBeDisabled()
    expect(
      screen.getByTestId('operator-critique-apply-advice'),
    ).toHaveTextContent('critique.adviceApplied')
    fireEvent.click(screen.getByTestId('operator-critique-apply-advice'))
    expect(onApplyAdvice).toHaveBeenCalledTimes(1)
  })

  it('宿主没有写提示词那只手时，那颗按钮不渲染（⛔ 不摆点了没反应的钮）', () => {
    renderCard({ step: VIDEO_STEP })
    expect(
      screen.queryByTestId('operator-critique-apply-advice'),
    ).not.toBeInTheDocument()
  })
})
