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

/** LoRA 域的覆盖三选：同一张卡上多几行取材标注与负面增量（lora §7.2）。 */
const SOURCED_OVERWRITE_PROMPT: StudioOperatorQuestionPrompt = {
  ...OVERWRITE_PROMPT,
  id: 'ask-2b',
  overwrite: {
    ...OVERWRITE_PROMPT.overwrite!,
    sourceNotes: [
      '主体 — 来自《Ink Lines》的作者推荐',
      '画风 — 家族骨架（illustrious）',
    ],
    negativeDiff: ['worst quality', 'bad hands'],
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

  it('自己的看法框常驻，不必先点「其他」', () => {
    renderCard(TEXT_PROMPT)
    expect(screen.getByTestId('operator-question-own-view')).toBeTruthy()
    expect(screen.getByTestId('operator-question-other-input')).toBeVisible()
  })

  it('看法框的答复走 otherText 而不进 optionIds', () => {
    const { onAnswer } = renderCard(TEXT_PROMPT)
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

  it('看法框写了字再点选项，optionIds 与 otherText 一起带走', () => {
    const { onAnswer } = renderCard(TEXT_PROMPT)
    fireEvent.change(screen.getByTestId('operator-question-other-input'), {
      target: { value: '保持 3D' },
    })
    fireEvent.click(
      screen
        .getAllByTestId('operator-question-option')
        .find((node) => node.dataset.optionId === 'o2')!,
    )
    expect(onAnswer.mock.calls[0]?.[0]).toEqual({
      questionId: 'q1',
      optionIds: ['o2'],
      otherText: '保持 3D',
    })
    expect(onAnswer.mock.calls[0]?.[1]).toMatchObject({
      label: '全身 · 保持 3D',
    })
  })

  it('覆盖三选没有看法框', () => {
    renderCard(OVERWRITE_PROMPT)
    expect(screen.queryByTestId('operator-question-own-view')).toBeNull()
  })

  it('IME 选字回车不提交看法框', () => {
    const now = vi.spyOn(performance, 'now')
    const { onAnswer } = renderCard(TEXT_PROMPT)
    const input = screen.getByTestId('operator-question-other-input')
    fireEvent.change(input, { target: { value: '夜景但保持 3D' } })
    now.mockReturnValue(0)
    fireEvent.compositionStart(input)
    fireEvent.compositionEnd(input)
    now.mockReturnValue(10)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAnswer).not.toHaveBeenCalled()
    now.mockReturnValue(150)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAnswer.mock.calls[0]?.[0]).toEqual({
      questionId: 'q1',
      optionIds: [],
      otherText: '夜景但保持 3D',
    })
    now.mockRestore()
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

  it('取材标注与负面增量长在同一张卡上（⛔ 不新造卡型）', () => {
    renderCard(SOURCED_OVERWRITE_PROMPT)
    const block = screen.getByTestId('operator-question-overwrite')
    const notes = screen.getByTestId('operator-question-source-notes')
    // 两格都住在覆盖那一块里 —— 卡型、布局一个都没变。
    expect(block).toContainElement(notes)
    expect(notes).toHaveTextContent('主体 — 来自《Ink Lines》的作者推荐')
    expect(notes).toHaveTextContent('画风 — 家族骨架（illustrious）')
    expect(
      screen.getByTestId('operator-question-negative-diff'),
    ).toHaveTextContent('worst quality, bad hands')
  })

  it('两格缺席时一行都不画（图片 / 视频域的覆盖三选就是这一态）', () => {
    renderCard(OVERWRITE_PROMPT)
    expect(screen.getByTestId('operator-question-overwrite')).toBeVisible()
    expect(
      screen.queryByTestId('operator-question-source-notes'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('operator-question-negative-diff'),
    ).not.toBeInTheDocument()
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
