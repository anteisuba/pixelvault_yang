// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorQuestionBlock } from './StudioOperatorQuestionBlock'
import type { StudioOperatorQuestionPrompt } from '@/types/studio-assistant-operator'

/**
 * **问题块**的回归闸（D12 A 定稿 · S3 / S4）。
 *
 *  ① 选项编号、推荐只用标签排第一、⛔ 不预选；多题才写「1 / 2」；
 *  ② 已答的留一行「问题 · 答案」，最近那一行可「改」；
 *  ③ 点任一行即提交 —— ⛔ 没有「确定」，⛔ 没有就地「其他」输入框（Q6：打字即其他）；
 *  键盘：`1`–`4` 直选 · `↑↓` + `Enter` · `Esc` 收起。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
}))

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 测试替身
    <img alt={alt} src={src} />
  ),
}))

const PROMPT: StudioOperatorQuestionPrompt = {
  id: 'ask-1',
  answers: [],
  questions: [
    {
      id: 'q1',
      header: '镜头数量',
      question: '这段剧本拆成几镜？',
      multiSelect: false,
      allowOther: true,
      options: [
        { id: 'nine', label: '9 镜', description: '每幕多一个特写' },
        {
          id: 'six',
          label: '6 镜',
          description: '三幕各两镜，节奏最稳',
          recommended: true,
        },
        { id: 'twelve', label: '12 镜', description: '短视频节奏' },
      ],
    },
    {
      id: 'q2',
      header: '时长风格',
      question: '镜头节奏偏哪种？',
      multiSelect: false,
      allowOther: true,
      options: [
        { id: 'fast', label: '短促快切', description: '单镜 2–4 秒' },
        { id: 'slow', label: '长镜头为主', description: '单镜 6 秒以上' },
      ],
    },
  ],
}

function renderBlock(prompt: StudioOperatorQuestionPrompt = PROMPT) {
  const onAnswer = vi.fn()
  const onBack = vi.fn()
  const onDismiss = vi.fn()
  render(
    <StudioOperatorQuestionBlock
      prompt={prompt}
      onAnswer={onAnswer}
      onBack={onBack}
      onDismiss={onDismiss}
    />,
  )
  return { onAnswer, onBack, onDismiss }
}

describe('StudioOperatorQuestionBlock', () => {
  it('① 编号选项、推荐排第一只打标签、⛔ 不预选；多题写进度', () => {
    renderBlock()
    const block = screen.getByTestId('operator-question-block')
    expect(block.dataset.step).toBe('1')
    expect(block.dataset.total).toBe('2')
    expect(screen.getByTestId('operator-question-step').textContent).toBe(
      'question.step:1/2',
    )
    const options = screen.getAllByTestId('operator-question-option')
    expect(options.map((node) => node.dataset.optionId)).toEqual([
      'six',
      'nine',
      'twelve',
    ])
    expect(options.map((node) => node.textContent?.slice(0, 1))).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(screen.getAllByTestId('operator-question-recommended')).toHaveLength(
      1,
    )
    // ⛔ 不预选：还没动键盘时没有任何一行是高亮的。
    expect(options.every((node) => node.dataset.cursor === 'false')).toBe(true)
    expect(screen.queryByTestId('operator-question-back')).toBeNull()
    // ⛔ 就地「其他」输入框已删 —— 下面那一行输入框就是「其他」。
    expect(screen.queryByTestId('operator-question-other')).toBeNull()
  })

  it('只有一题时不写「1 / 1」', () => {
    renderBlock({ ...PROMPT, questions: [PROMPT.questions[0]!] })
    expect(screen.queryByTestId('operator-question-step')).toBeNull()
  })

  it('④ 点任一行即提交 —— ⛔ 没有「确定」按钮', () => {
    const { onAnswer } = renderBlock()
    expect(screen.queryByText('question.confirm')).toBeNull()
    fireEvent.click(screen.getAllByTestId('operator-question-option')[1]!)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer.mock.calls[0]?.[0]).toEqual({
      questionId: 'q1',
      optionIds: ['nine'],
    })
    expect(onAnswer.mock.calls[0]?.[1]).toMatchObject({ label: '9 镜' })
  })

  it('⛔ 连点两下只发一次（第二下落在还没换掉的那一题上）', () => {
    const { onAnswer } = renderBlock()
    const first = screen.getAllByTestId('operator-question-option')[0]!
    fireEvent.click(first)
    fireEvent.click(first)
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it('② 第 2 题：已答的留一行「问题 · 答案」，点「改」回去', () => {
    const { onBack } = renderBlock({
      ...PROMPT,
      answers: [
        {
          header: '镜头数量',
          label: '6 镜',
          answer: { questionId: 'q1', optionIds: ['six'] },
        },
      ],
    })
    const block = screen.getByTestId('operator-question-block')
    expect(block.dataset.step).toBe('2')
    expect(
      screen.getByTestId('operator-question-answer-tag').textContent,
    ).toContain('镜头数量·6 镜')
    fireEvent.click(screen.getByTestId('operator-question-back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('键盘：`1`–`4` 直选', () => {
    const { onAnswer } = renderBlock()
    fireEvent.keyDown(screen.getByTestId('operator-question-block'), {
      key: '2',
    })
    expect(onAnswer.mock.calls[0]?.[0]).toMatchObject({ optionIds: ['nine'] })
  })

  it('键盘：`↓` 移动 + `Enter` 选中；⛔ 还没动过键盘时 Enter 什么都不做', () => {
    const { onAnswer } = renderBlock()
    const block = screen.getByTestId('operator-question-block')
    fireEvent.keyDown(block, { key: 'Enter' })
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.keyDown(block, { key: 'ArrowDown' })
    fireEvent.keyDown(block, { key: 'Enter' })
    expect(onAnswer.mock.calls[0]?.[0]).toMatchObject({ optionIds: ['six'] })
  })

  it('键盘：`Esc` 收起问题块只打字', () => {
    const { onDismiss } = renderBlock()
    fireEvent.keyDown(screen.getByTestId('operator-question-block'), {
      key: 'Escape',
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
