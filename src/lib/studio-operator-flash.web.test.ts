/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_TOUCH_FLASH_MOTION } from '@/constants/motion'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { STUDIO_OPERATOR_FIELD_IDS } from '@/constants/studio-assistant-operator'
import {
  ASSISTANT_FIELD_TOUCH_CLASS,
  flashAssistantTouchedField,
} from '@/lib/studio-operator-flash'

function mountField(field: string): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-assistant-field', field)
  document.body.append(el)
  return el
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('flashAssistantTouchedField（进度表 21 · D7 Q4）', () => {
  /**
   * ⭐ 回执的第二只眼：面板那行「已改 N 项」说多少，这一闪说哪几个。
   * 断的是 class 真的挂上了 —— 闪不闪得起来在 jsdom 里看不到，但「class 压根
   * 没挂」是唯一会让它彻底失效的那一种失败。
   */
  it('⭐ 给被改的那一格挂上 class，320ms 后自己摘掉', () => {
    const chip = mountField(STUDIO_OPERATOR_FIELD_IDS.capabilities)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.capabilities)
    expect(chip.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(true)

    vi.advanceTimersByTime(ASSISTANT_TOUCH_FLASH_MOTION.durationMs - 1)
    expect(chip.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(true)

    vi.advanceTimersByTime(1)
    // ⚠ 不摘掉的话第二次改同一格就不会再闪（CSS 动画对「class 已经在了」不做事）。
    expect(chip.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(false)
  })

  it('一轮内多项同时闪 —— 一格一条，互不影响', () => {
    const model = mountField(STUDIO_OPERATOR_FIELD_IDS.model)
    const specs = mountField(STUDIO_OPERATOR_FIELD_IDS.specs)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.model)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.specs)
    expect(model.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(true)
    expect(specs.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(true)

    vi.advanceTimersByTime(ASSISTANT_TOUCH_FLASH_MOTION.durationMs)
    expect(model.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(false)
    expect(specs.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(false)
  })

  it('同一格一轮里被改两次：第二次重新起一遍，class 仍在', () => {
    const model = mountField(STUDIO_OPERATOR_FIELD_IDS.model)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.model)
    vi.advanceTimersByTime(ASSISTANT_TOUCH_FLASH_MOTION.durationMs / 2)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.model)
    // 第一次那颗定时器到点时不能把第二次的闪一起摘掉。
    vi.advanceTimersByTime(ASSISTANT_TOUCH_FLASH_MOTION.durationMs / 2)
    expect(model.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(true)

    vi.advanceTimersByTime(ASSISTANT_TOUCH_FLASH_MOTION.durationMs)
    expect(model.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(false)
  })

  /** ⚠ 提示词框借它自己那个 id —— 三个宿主的输入框共用它。 */
  it('提示词框按 id 认得出来', () => {
    const textarea = document.createElement('textarea')
    textarea.id = STUDIO_PROMPT_TEXTAREA_ID
    document.body.append(textarea)
    flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.prompt)
    expect(textarea.classList.contains(ASSISTANT_FIELD_TOUCH_CLASS)).toBe(true)
  })

  /** ⚠ 那一格不在 DOM 里（浮层没展开 / 本域没有这颗旋钮）时静默跳过，⛔ 不抛。 */
  it('⛔ 界面上没有这一格时什么都不做', () => {
    expect(() =>
      flashAssistantTouchedField(STUDIO_OPERATOR_FIELD_IDS.count),
    ).not.toThrow()
  })
})
