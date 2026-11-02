// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorQuestionBlock } from './StudioOperatorQuestionBlock'
import type { StudioOperatorQuestionPrompt } from '@/types/studio-assistant-operator'

/**
 * **问题块**的回归闸（D12 A 定稿 · S3 / S4；2026-10-14 多选与完整交互）。
 *
 *  ① 选项编号、推荐只用标签排第一、⛔ 不预选；多题才写「1 / 2」；
 *  ② 已答的留一行「问题 · 答案」（标签是数组），最近那一行可「改」；
 *  ③ 单选点任一行即提交（⛔ 没有「确定」）；多选勾选 +「确定（N）」；
 *  ④「其他…」只把焦点交给输入框，闭集题不画；「跳过」「全部用推荐」；
 *  键盘：`↑↓` 移动 · `1`–`9` 直选 / 勾 · 空格 · `Enter` · `Esc` 跳过。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join('/')}` : key,
  useFormatter: () => ({ list: (items: string[]) => items.join(' + ') }),
}))

/** 缺省按「减少动效」跑：点中即提交。停一拍的那一支单独开一条用例。 */
const motionPrefs = vi.hoisted(() => ({ reduce: true }))
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motionPrefs.reduce,
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

const MULTI: StudioOperatorQuestionPrompt = {
  id: 'ask-2',
  answers: [],
  questions: [
    {
      id: 'who',
      header: '出场',
      question: '这一镜谁出场？',
      multiSelect: true,
      allowOther: false,
      options: [
        { id: 'harry', label: '哈利', description: '主角' },
        { id: 'ron', label: '罗恩', description: '朋友' },
        { id: 'draco', label: '德拉科', description: '对手' },
      ],
    },
  ],
}

function renderBlock(
  initial: StudioOperatorQuestionPrompt = PROMPT,
  options: { hasDraft?: boolean } = {},
) {
  const handlers = {
    onAnswer: vi.fn(),
    onConfirm: vi.fn(),
    onCheckedChange: vi.fn(),
    onUseRecommended: vi.fn(),
    onBack: vi.fn(),
    onOther: vi.fn(),
  }
  /** 勾选住在 store —— 这里用一格 state 代替那一份，回写走同一个回调。 */
  function Harness() {
    const [prompt, setPrompt] = useState(initial)
    return (
      <StudioOperatorQuestionBlock
        prompt={prompt}
        hasDraft={options.hasDraft ?? false}
        {...handlers}
        onCheckedChange={(checked) => {
          handlers.onCheckedChange(checked)
          setPrompt((current) => ({ ...current, checked }))
        }}
      />
    )
  }
  render(<Harness />)
  return handlers
}

function focused(): Element {
  if (!document.activeElement) throw new Error('nothing focused')
  return document.activeElement
}

describe('StudioOperatorQuestionBlock', () => {
  it('① 编号选项、推荐排第一只打标签、⛔ 不预选；多题写进度；焦点落在第一项', () => {
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
    // ⛔ 不预选：一项都没被选中。
    expect(
      options.every((node) => node.getAttribute('aria-checked') === 'false'),
    ).toBe(true)
    expect(focused()).toBe(options[0])
    expect(screen.queryByTestId('operator-question-back')).toBeNull()
  })

  it('单选是 radiogroup / radio，多选是 group / checkbox', () => {
    renderBlock()
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.queryByTestId('operator-question-confirm')).toBeNull()
  })

  it('只有一题时不写「1 / 1」', () => {
    renderBlock({ ...PROMPT, questions: [PROMPT.questions[0]!] })
    expect(screen.queryByTestId('operator-question-step')).toBeNull()
  })

  it('③ 单选点任一行即提交 —— ⛔ 没有「确定」按钮', () => {
    const { onAnswer } = renderBlock()
    fireEvent.click(screen.getAllByTestId('operator-question-option')[1]!)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer.mock.calls[0]?.[0]).toEqual({
      questionId: 'q1',
      optionIds: ['nine'],
    })
  })

  it('⛔ 连点两下只发一次（第二下落在还没换掉的那一题上）', () => {
    const { onAnswer } = renderBlock()
    const first = screen.getAllByTestId('operator-question-option')[0]!
    fireEvent.click(first)
    fireEvent.click(first)
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it('② 第 2 题：已答的留一行「问题 · 答案」（多个标签 + 补的一句），点「改」回去', () => {
    const { onBack } = renderBlock({
      ...PROMPT,
      answers: [
        {
          header: '镜头数量',
          labels: ['6 镜'],
          answer: {
            questionId: 'q1',
            optionIds: ['six'],
            otherText: '前 3 镜慢一点',
          },
        },
      ],
    })
    const block = screen.getByTestId('operator-question-block')
    expect(block.dataset.step).toBe('2')
    expect(
      screen.getByTestId('operator-question-answer-tag').textContent,
    ).toContain('镜头数量·6 镜 + 前 3 镜慢一点')
    fireEvent.click(screen.getByTestId('operator-question-back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('跳过的那一题写「已跳过」', () => {
    renderBlock({
      ...PROMPT,
      answers: [
        {
          header: '镜头数量',
          labels: [],
          answer: { questionId: 'q1', optionIds: [] },
        },
      ],
    })
    expect(
      screen.getByTestId('operator-question-answer-tag').textContent,
    ).toContain('question.skipped')
  })

  it('键盘：数字直选（到 9 都认）', () => {
    const { onAnswer } = renderBlock()
    fireEvent.keyDown(focused(), { key: '2' })
    expect(onAnswer.mock.calls[0]?.[0]).toMatchObject({ optionIds: ['nine'] })
  })

  it('键盘：`↓` 移动焦点 + `Enter` 选中', () => {
    const { onAnswer } = renderBlock()
    fireEvent.keyDown(focused(), { key: 'ArrowDown' })
    expect(focused()).toBe(screen.getAllByTestId('operator-question-option')[1])
    fireEvent.keyDown(focused(), { key: 'Enter' })
    expect(onAnswer.mock.calls[0]?.[0]).toMatchObject({ optionIds: ['nine'] })
  })

  it('键盘：空格也选中（单选）', () => {
    const { onAnswer } = renderBlock()
    fireEvent.keyDown(focused(), { key: ' ' })
    expect(onAnswer.mock.calls[0]?.[0]).toMatchObject({ optionIds: ['six'] })
  })

  it('键盘：`Esc` = 跳过这一题（空答复）', () => {
    const { onAnswer } = renderBlock()
    fireEvent.keyDown(focused(), { key: 'Escape' })
    expect(onAnswer).toHaveBeenCalledWith({ questionId: 'q1', optionIds: [] })
  })

  it('④「跳过」「全部用推荐」', () => {
    const { onAnswer, onUseRecommended } = renderBlock()
    fireEvent.click(screen.getByTestId('operator-question-use-recommended'))
    expect(onUseRecommended).toHaveBeenCalledTimes(1)
    // 交过一次就锁住：再点跳过不会再发。
    fireEvent.click(screen.getByTestId('operator-question-skip'))
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('没有任何推荐项时不画「全部用推荐」', () => {
    renderBlock(MULTI)
    expect(screen.queryByTestId('operator-question-use-recommended')).toBeNull()
  })

  it('④「其他…」只把焦点交给输入框；`↓` 走到它那一行、`Enter` 同样交出去', () => {
    const { onOther, onAnswer } = renderBlock()
    fireEvent.click(screen.getByTestId('operator-question-other'))
    expect(onOther).toHaveBeenCalledTimes(1)
    for (let index = 0; index < 3; index += 1)
      fireEvent.keyDown(focused(), { key: 'ArrowDown' })
    expect(focused()).toBe(screen.getByTestId('operator-question-other'))
    fireEvent.keyDown(focused(), { key: 'Enter' })
    expect(onOther).toHaveBeenCalledTimes(2)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('闭集题（allowOther=false）不画「其他…」', () => {
    renderBlock(MULTI)
    expect(screen.queryByTestId('operator-question-other')).toBeNull()
  })

  it('多选：点一行 = 勾选（⛔ 不提交），勾选写回 store，「确定（N）」交出全部', () => {
    const { onAnswer, onConfirm, onCheckedChange } = renderBlock(MULTI)
    expect(screen.getByRole('group', { name: '这一镜谁出场？' })).toBeTruthy()
    const options = screen.getAllByRole('checkbox')
    expect(options).toHaveLength(3)
    const confirm = screen.getByTestId('operator-question-confirm')
    expect(confirm.textContent).toBe('question.confirm:0')
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(options[0]!)
    fireEvent.click(options[2]!)
    expect(onAnswer).not.toHaveBeenCalled()
    expect(onCheckedChange).toHaveBeenLastCalledWith(['harry', 'draco'])
    expect(options[0]!.getAttribute('aria-checked')).toBe('true')
    expect(options[1]!.getAttribute('aria-checked')).toBe('false')
    expect(confirm.textContent).toBe('question.confirm:2')

    // 再点一下 = 取消勾选。
    fireEvent.click(options[0]!)
    expect(onCheckedChange).toHaveBeenLastCalledWith(['draco'])

    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith(['draco'])
  })

  it('多选键盘：数字 / 空格切换，`Enter` 确定', () => {
    const { onConfirm, onCheckedChange } = renderBlock(MULTI)
    fireEvent.keyDown(focused(), { key: '2' })
    expect(onCheckedChange).toHaveBeenLastCalledWith(['ron'])
    fireEvent.keyDown(focused(), { key: ' ' })
    expect(onCheckedChange).toHaveBeenLastCalledWith([])
    fireEvent.keyDown(focused(), { key: '3' })
    fireEvent.keyDown(focused(), { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith(['draco'])
  })

  it('多选：一项没勾但输入框里有字时，「确定」也能按（选项 + 补的那句并存）', () => {
    const { onConfirm } = renderBlock(MULTI, { hasDraft: true })
    const confirm = screen.getByTestId('operator-question-confirm')
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith([])
  })

  it('勾选从 store 带回来（收放面板后重挂）', () => {
    renderBlock({ ...MULTI, checked: ['ron'] })
    const options = screen.getAllByRole('checkbox')
    expect(options.map((node) => node.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ])
    expect(screen.getByTestId('operator-question-confirm').textContent).toBe(
      'question.confirm:1',
    )
  })

  it('覆盖三选即使标了多选也按单选走', () => {
    const { onAnswer } = renderBlock({
      ...MULTI,
      overwrite: { field: 'prompt', have: '我写的', proposed: '助手写的' },
    })
    expect(screen.queryByTestId('operator-question-confirm')).toBeNull()
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    expect(onAnswer).toHaveBeenCalledWith({
      questionId: 'who',
      optionIds: ['ron'],
    })
  })

  it('动效开着时：选中那一行先变黑，停一拍再换题', () => {
    vi.useFakeTimers()
    motionPrefs.reduce = false
    try {
      const { onAnswer } = renderBlock()
      const [first] = screen.getAllByTestId('operator-question-option')
      fireEvent.click(first!)
      expect(first!.getAttribute('data-picked')).toBe('true')
      expect(onAnswer).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(120)
      })
      expect(onAnswer).toHaveBeenCalledTimes(1)
    } finally {
      motionPrefs.reduce = true
      vi.useRealTimers()
    }
  })
})
