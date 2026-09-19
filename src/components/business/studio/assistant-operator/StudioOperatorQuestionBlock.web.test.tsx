// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  StudioOperatorQuestionAnswers,
  StudioOperatorQuestionBlock,
} from './StudioOperatorQuestionBlock'
import type { StudioOperatorQuestionPrompt } from '@/types/studio-assistant-operator'

/**
 * **问题块**的回归闸（56b 切片 4 · 画板 D56bUI「反问」四态）。
 *
 * 钉的就是画板那四态 + 三条键盘路径：
 *  ① 第 1 题：题头 + 「1 / 3」进度 · 选项竖排 · 推荐项排第一并打标 · 最后一行
 *     「其他，自己写」；第一题上⛔ 没有「上一题」；
 *  ② 点了「其他」：那一行**就地**变输入框，回车提交（⛔ 不跳到下面的输入框）；
 *  ③ 第 2 题：右上角有「← 上一题」；已答的收成小标签；
 *  ④ 点任一行即提交 —— ⛔ 没有「确定」按钮；
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
  it('① 第 1 题：进度「1 / 2」· 推荐项排第一并打标 · ⛔ 第一题没有「上一题」', () => {
    renderBlock()
    const block = screen.getByTestId('operator-question-block')
    expect(block.dataset.step).toBe('1')
    expect(block.dataset.total).toBe('2')
    expect(screen.getByTestId('operator-question-header').textContent).toBe(
      '镜头数量',
    )
    const options = screen.getAllByTestId('operator-question-option')
    expect(options.map((node) => node.dataset.optionId)).toEqual([
      'six',
      'nine',
      'twelve',
    ])
    expect(screen.getAllByTestId('operator-question-recommended')).toHaveLength(
      1,
    )
    expect(screen.queryByTestId('operator-question-back')).toBeNull()
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

  it('② 点「其他」那一行就地变输入框，回车提交（⛔ 不跳到下面的输入框）', () => {
    const { onAnswer } = renderBlock()
    const row = screen.getByTestId('operator-question-other')
    expect(row.dataset.open).toBe('false')
    fireEvent.click(row)
    const input = screen.getByTestId('operator-question-other-input')
    expect(screen.getByTestId('operator-question-other').dataset.open).toBe(
      'true',
    )
    fireEvent.change(input, { target: { value: '8 镜，前 3 镜慢一点' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAnswer.mock.calls[0]?.[0]).toEqual({
      questionId: 'q1',
      optionIds: [],
      otherText: '8 镜，前 3 镜慢一点',
    })
  })

  it('⛔ 一个字都没写时提交不发（空的「其他」不是答案）', () => {
    const { onAnswer } = renderBlock()
    fireEvent.click(screen.getByTestId('operator-question-other'))
    fireEvent.keyDown(screen.getByTestId('operator-question-other-input'), {
      key: 'Enter',
    })
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('③ 第 2 题：右上角「← 上一题」可回改', () => {
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
    expect(screen.getByTestId('operator-question-header').textContent).toBe(
      '时长风格',
    )
    fireEvent.click(screen.getByTestId('operator-question-back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('键盘：`1`–`4` 直选', () => {
    const { onAnswer } = renderBlock()
    fireEvent.keyDown(screen.getByTestId('operator-question-block'), {
      key: '2',
    })
    // ⚠ 数字数的是**排完序之后**那一列（推荐项已经提到第一），⛔ 不是模型给的顺序。
    expect(onAnswer.mock.calls[0]?.[0].optionIds).toEqual(['nine'])
  })

  it('键盘：`↓` 移动 + `Enter` 选中；⛔ 还没动过键盘时 Enter 什么都不做', () => {
    const { onAnswer } = renderBlock()
    const block = screen.getByTestId('operator-question-block')
    fireEvent.keyDown(block, { key: 'Enter' })
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.keyDown(block, { key: 'ArrowDown' })
    fireEvent.keyDown(block, { key: 'ArrowDown' })
    fireEvent.keyDown(block, { key: 'Enter' })
    expect(onAnswer.mock.calls[0]?.[0].optionIds).toEqual(['nine'])
  })

  it('键盘：`↓` 走到最后一行就是「其他」，Enter 把它就地展开', () => {
    renderBlock()
    const block = screen.getByTestId('operator-question-block')
    for (let index = 0; index < 4; index += 1) {
      fireEvent.keyDown(block, { key: 'ArrowDown' })
    }
    fireEvent.keyDown(block, { key: 'Enter' })
    expect(screen.getByTestId('operator-question-other').dataset.open).toBe(
      'true',
    )
  })

  it('键盘：`Esc` 收起问题块只打字', () => {
    const { onDismiss } = renderBlock()
    fireEvent.keyDown(screen.getByTestId('operator-question-block'), {
      key: 'Escape',
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('⛔ 「其他」展开之后打「1」是在写字，不是在选', () => {
    const { onAnswer } = renderBlock()
    fireEvent.click(screen.getByTestId('operator-question-other'))
    fireEvent.keyDown(screen.getByTestId('operator-question-block'), {
      key: '1',
    })
    expect(onAnswer).not.toHaveBeenCalled()
  })
})

describe('StudioOperatorQuestionAnswers', () => {
  it('已答的收成小标签；⛔ 一道都没答就整块不渲染', () => {
    const { container } = render(<StudioOperatorQuestionAnswers answers={[]} />)
    expect(container.firstChild).toBeNull()

    render(
      <StudioOperatorQuestionAnswers
        answers={[
          {
            header: '镜头',
            label: '6 镜',
            answer: { questionId: 'q1', optionIds: ['six'] },
          },
        ]}
      />,
    )
    const tags = screen.getAllByTestId('operator-question-answer-tag')
    expect(tags).toHaveLength(1)
    expect(tags[0]?.textContent).toContain('6 镜')
  })
})
