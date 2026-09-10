// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorQuestionCard } from './StudioOperatorQuestionCard'
import type { StudioOperatorQuestionPrompt } from '@/types/studio-assistant-operator'

/**
 * **问题卡**的回归闸（v2 §3.2 / §3.4 / 画板 BCards「问题」）。
 *
 * 钉六件事：
 *  ① 卡头是「X 想先确认」且带 `data-pinned` —— 它钉在输入框上方，不进时间线；
 *  ② 推荐项排第一并带「推荐」标 —— 服务端把它放第三位也一样；
 *  ③ 点一项即交（一次只问一个，§3.4），`label` 跟着答复一起出去（系统行按它写）；
 *  ④ 连点两下只交一次 —— 第二轮请求会把第一轮 abort 掉再从头跑；
 *  ⑤ 覆盖三选那一支：摆出「你写的 / 它建议的」，答复带 `choice` 回执；
 *  ⑥ 缩略图那一支（旧的候选单选卡）：四格网格，答复带 `assetOptionId`。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key
    return t
  },
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const TEXT_PROMPT: StudioOperatorQuestionPrompt = {
  id: 'ask-1',
  question: {
    id: 'q1',
    header: '取景',
    question: '这一张要取到多少身？',
    multiSelect: false,
    allowOther: true,
    options: [
      {
        id: 'o1',
        label: '半身',
        description: '腰以上，脸看得清',
        visual: 'comp.halfBody' as const,
      },
      { id: 'o2', label: '全身', description: '连鞋一起进画' },
      {
        id: 'o3',
        label: '特写',
        description: '只有脸，细节最足',
        recommended: true,
      },
    ],
  },
  why: '两种取景差得远',
}

const OVERWRITE_PROMPT: StudioOperatorQuestionPrompt = {
  id: 'ask-2',
  question: {
    id: 'overwrite-prompt',
    header: '提示词',
    question: '提示词你已经自己写过了，这一段怎么办？',
    multiSelect: false,
    allowOther: false,
    options: [
      { id: 'append', label: '追加在后', description: '你写的留着' },
      { id: 'overwrite', label: '覆盖', description: '换成它写的' },
      { id: 'keep', label: '保留', description: '什么都不改' },
    ],
  },
  overwrite: {
    field: 'prompt',
    have: '我自己写的那一段',
    proposed: '它建议的那一段',
  },
}

const ASSET_PROMPT: StudioOperatorQuestionPrompt = {
  id: 'ask-3',
  question: {
    id: 'q3',
    header: '候选',
    question: '你说的是哪一张？',
    multiSelect: false,
    allowOther: false,
    options: [
      { id: 'a1', label: '图 1', description: '', assetUrl: 'https://c/1.png' },
      { id: 'a2', label: '图 2', description: '', assetUrl: 'https://c/2.png' },
    ],
  },
}

function renderCard(prompt: StudioOperatorQuestionPrompt) {
  const onAnswer = vi.fn()
  render(
    <StudioOperatorQuestionCard
      prompt={prompt}
      assistantName="ANTI"
      onAnswer={onAnswer}
    />,
  )
  return { onAnswer }
}

describe('StudioOperatorQuestionCard', () => {
  it('钉在输入框上方那一态：卡头写「X 想先确认」，并带 data-pinned', () => {
    renderCard(TEXT_PROMPT)
    expect(screen.getByTestId('operator-question-card').dataset.pinned).toBe(
      'true',
    )
    expect(
      screen.getByTestId('operator-question-pinned-title'),
    ).toHaveTextContent('question.pinnedTitle:ANTI')
    // 「为什么问这一句」缺席就不画，在场就一行小字。
    expect(screen.getByTestId('operator-question-why')).toHaveTextContent(
      '两种取景差得远',
    )
  })

  it('推荐项排第一并带「推荐」标', () => {
    renderCard(TEXT_PROMPT)
    const options = screen.getAllByTestId('operator-question-option')
    expect(options[0]?.dataset.optionId).toBe('o3')
    expect(screen.getByTestId('operator-question-recommended')).toBeVisible()
  })

  it('点一项即交，label 跟着答复出去（系统行按它写）', () => {
    const { onAnswer } = renderCard(TEXT_PROMPT)
    fireEvent.click(
      screen
        .getAllByTestId('operator-question-option')
        .find((node) => node.dataset.optionId === 'o2')!,
    )
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer.mock.calls[0]?.[0]).toEqual({
      questionId: 'q1',
      optionIds: ['o2'],
    })
    expect(onAnswer.mock.calls[0]?.[1]).toMatchObject({ label: '全身' })
  })

  it('连点两下只交一次', () => {
    const { onAnswer } = renderCard(TEXT_PROMPT)
    const option = screen
      .getAllByTestId('operator-question-option')
      .find((node) => node.dataset.optionId === 'o2')!
    fireEvent.click(option)
    fireEvent.click(option)
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it('「其他」展开一行输入，答复走 otherText 而不进 optionIds', () => {
    const { onAnswer } = renderCard(TEXT_PROMPT)
    fireEvent.click(
      screen
        .getAllByTestId('operator-question-option')
        .find((node) => node.dataset.kind === 'other')!,
    )
    fireEvent.change(screen.getByTestId('operator-question-other-input'), {
      target: { value: '再远一点' },
    })
    fireEvent.click(screen.getByTestId('operator-question-other-submit'))
    expect(onAnswer.mock.calls[0]?.[0]).toEqual({
      questionId: 'q1',
      optionIds: [],
      otherText: '再远一点',
    })
  })

  it('覆盖三选：摆出「你写的 / 它建议的」，答复带 choice 回执', () => {
    const { onAnswer } = renderCard(OVERWRITE_PROMPT)
    const block = screen.getByTestId('operator-question-overwrite')
    expect(block).toHaveTextContent('我自己写的那一段')
    expect(block).toHaveTextContent('它建议的那一段')
    fireEvent.click(
      screen
        .getAllByTestId('operator-question-option')
        .find((node) => node.dataset.optionId === 'overwrite')!,
    )
    expect(onAnswer.mock.calls[0]?.[1]).toMatchObject({
      label: '覆盖',
      choice: 'overwrite',
    })
  })

  it('缩略图那一支：四格网格，答复带 assetOptionId', () => {
    const { onAnswer } = renderCard(ASSET_PROMPT)
    expect(screen.getByTestId('operator-question-card').dataset.mode).toBe(
      'asset',
    )
    expect(screen.getAllByRole('img')).toHaveLength(2)
    fireEvent.click(
      screen
        .getAllByTestId('operator-question-option')
        .find((node) => node.dataset.optionId === 'a2')!,
    )
    expect(onAnswer.mock.calls[0]?.[1]).toMatchObject({
      label: '图 2',
      assetOptionId: 'a2',
    })
    cleanup()
  })
})
