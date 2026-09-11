// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT,
  STUDIO_OPERATOR_SUGGESTIONS,
} from '@/constants/studio-assistant-operator'

import { StudioOperatorEmptyState } from './StudioOperatorEmptyState'

/**
 * 空态的回归闸（v2 §4.2 / 画板 BEmpty）。
 *
 * 钉四件事：
 *  ① 头像 + 自我介绍（名字来自 persona，缺席时回落到默认 ID）；
 *  ② 图片域**零改动时正好三颗起手势**（§4.2 的三句）——「这版还差在哪」那一颗
 *     的门是 1，不该出现在空态里；
 *  ③ 点一颗 = **直接把那句话发出去**（拍板 15），⛔ 不是填进输入框；
 *  ④ 封顶就是 `STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT`。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// 头像那一颗的内部（persona 预设 / 自传图）不是这条断言的契约。
vi.mock(
  '@/components/business/studio/assistant-operator/TimelineAvatar',
  () => ({
    AssistantTimelineAvatar: ({ className }: { className?: string }) => (
      <span data-testid="operator-empty-avatar" className={className} />
    ),
  }),
)

const IMAGE_SUGGESTIONS =
  STUDIO_OPERATOR_SUGGESTIONS[ASSISTANT_PROTOCOL_DOMAIN_IDS.image]

/** 空态的语境：助手一处都还没改（`changeCount === 0`）。 */
const FRESH = IMAGE_SUGGESTIONS.filter((item) => item.minChanges === 0)

function renderEmpty(
  overrides: Partial<Parameters<typeof StudioOperatorEmptyState>[0]> = {},
) {
  const onSuggestion = vi.fn()
  render(
    <StudioOperatorEmptyState
      suggestions={FRESH}
      onSuggestion={onSuggestion}
      {...overrides}
    />,
  )
  return { onSuggestion }
}

describe('StudioOperatorEmptyState', () => {
  it('画头像 + 自我介绍 + 能力说明', () => {
    renderEmpty()
    expect(screen.getByTestId('operator-empty-avatar').className).toContain(
      'size-17',
    )
    expect(screen.getByTestId('operator-empty').textContent).toContain(
      'emptyState.title',
    )
    expect(screen.getByTestId('operator-empty').textContent).toContain(
      'emptyState.description',
    )
  })

  it('图片域零改动时正好三颗起手势，⛔「还差在哪」那颗不在（门是 1）', () => {
    renderEmpty()
    const chips = screen.getAllByTestId('operator-empty-suggestion')
    expect(chips.map((chip) => chip.dataset.suggestion)).toEqual([
      'setupShot',
      'findReference',
      'checkStyle',
    ])
    expect(chips).toHaveLength(STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT)
  })

  it('点一颗就把那句话发出去（⛔ 不是填进输入框）', () => {
    const { onSuggestion } = renderEmpty()
    fireEvent.click(screen.getAllByTestId('operator-empty-suggestion')[1]!)
    expect(onSuggestion).toHaveBeenCalledWith('suggestion.findReference')
  })

  it('超过封顶就截断 —— 多给一颗也只画三颗', () => {
    renderEmpty({ suggestions: IMAGE_SUGGESTIONS })
    expect(screen.getAllByTestId('operator-empty-suggestion')).toHaveLength(
      STUDIO_OPERATOR_EMPTY_SUGGESTION_COUNT,
    )
  })

  it('一颗药丸都没有时 ⛔ 不画空壳容器', () => {
    renderEmpty({ suggestions: [] })
    expect(screen.queryByTestId('operator-empty-suggestion')).toBeNull()
    expect(screen.getByTestId('operator-empty')).toBeTruthy()
  })
})
