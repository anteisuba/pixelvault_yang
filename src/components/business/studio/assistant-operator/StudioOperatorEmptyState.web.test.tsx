// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageIcon } from '@/components/icons'
import { STUDIO_OPERATOR_FACE_PILL_LIMIT } from '@/constants/studio-assistant-operator'
import type { StudioOperatorFace } from '@/contexts/studio-operator-host'

import { StudioOperatorEmptyState } from './StudioOperatorEmptyState'

/**
 * 空态的回归闸（v2 §4.2 / 画板 `DesignD7bFaces`）。
 *
 * 钉四件事：
 *  ① 头像 + **一句话**（来自宿主那张脸），⛔ 不再是「标题 + 说明」两段、
 *     ⛔ 也不再重复人设名字；
 *  ② 药丸文案来自 `face.starterPills`——⛔ 组件不再按 domain 去取药丸表；
 *  ③ 点一颗 = **直接把那句话发出去**（拍板 15），⛔ 不是填进输入框；
 *  ④ 封顶就是 `STUDIO_OPERATOR_FACE_PILL_LIMIT`（5 颗，两行以内）。
 */

// 头像那一颗的内部（persona 预设 / 自传图）不是这条断言的契约。
vi.mock(
  '@/components/business/studio/assistant-operator/TimelineAvatar',
  () => ({
    AssistantTimelineAvatar: ({ className }: { className?: string }) => (
      <span data-testid="operator-empty-avatar" className={className} />
    ),
  }),
)

const PILLS = [
  '把这句写成好提示词',
  '换个模型看差别',
  '照这张参考图来',
  '出 4 张对比',
] as const

const FACE: StudioOperatorFace = {
  domainIcon: ImageIcon,
  contextLine: () => 'Seedream 5.0 Pro · 1:1 · 4 张',
  emptyLine: '说你想要的画面，我来写提示词、挑模型、配参考。',
  starterPills: PILLS,
  inputPlaceholder: '描述画面，或把参考图挂进来…',
}

function renderEmpty(
  overrides: Partial<Parameters<typeof StudioOperatorEmptyState>[0]> = {},
) {
  const onSuggestion = vi.fn()
  render(
    <StudioOperatorEmptyState
      face={FACE}
      onSuggestion={onSuggestion}
      {...overrides}
    />,
  )
  return { onSuggestion }
}

describe('StudioOperatorEmptyState', () => {
  it('画头像 + 那一句（⛔ 没有第二段说明）', () => {
    renderEmpty()
    expect(screen.getByTestId('operator-empty-avatar').className).toContain(
      'size-17',
    )
    expect(screen.getByTestId('operator-empty-line').textContent).toBe(
      FACE.emptyLine,
    )
  })

  it('药丸文案原样来自那张脸', () => {
    renderEmpty()
    expect(
      screen
        .getAllByTestId('operator-empty-suggestion')
        .map((pill) => pill.textContent),
    ).toEqual([...PILLS])
  })

  it('点一颗就把那句话发出去（⛔ 不是填进输入框）', () => {
    const { onSuggestion } = renderEmpty()
    fireEvent.click(screen.getAllByTestId('operator-empty-suggestion')[1]!)
    expect(onSuggestion).toHaveBeenCalledWith(PILLS[1])
  })

  it('超过封顶就截断 —— 给六颗也只画五颗', () => {
    renderEmpty({
      face: {
        ...FACE,
        starterPills: [...PILLS, '第五颗', '第六颗'],
      },
    })
    expect(screen.getAllByTestId('operator-empty-suggestion')).toHaveLength(
      STUDIO_OPERATOR_FACE_PILL_LIMIT,
    )
  })

  it('一颗药丸都没有时 ⛔ 不画空壳容器', () => {
    renderEmpty({ face: { ...FACE, starterPills: [] } })
    expect(screen.queryByTestId('operator-empty-suggestion')).toBeNull()
    expect(screen.getByTestId('operator-empty')).toBeTruthy()
  })
})
