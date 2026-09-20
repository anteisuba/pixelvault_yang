// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageIcon } from '@/components/icons'
import type { StudioOperatorFace } from '@/contexts/studio-operator-host'

import { StudioOperatorEmptyState } from './StudioOperatorEmptyState'

/**
 * 空态的回归闸（D7c ④ · 画板 `DesignD7cFlow`「空态 · 改后」）。
 *
 * 钉三件事：
 *  ① 头像 40px + **一句话**（来自宿主那张脸），⛔ 不再是「标题 + 说明」两段、
 *     ⛔ 也不再重复人设名字；
 *  ② ⭐ **药丸不在这里**：那四条满宽建议条整块搬去了输入框正上方（在
 *     `StudioOperatorPanel.web.test.tsx` 里验），⛔ 空态一颗都不画；
 *  ③ 药丸走了之后这一格**不再收** `onSuggestion` —— 留个没人调的回调只会让
 *     下一个人把它们塞回来；
 *  ④ ⭐ 上下留白是**会让步的 spacer** 不是 `padding`：`basis` 是画板那对 52 / 44
 *     （宽松档一字不差），但挤的时候它们先于内容收缩 —— 留白该比字先消失。
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

const FACE: StudioOperatorFace = {
  domainIcon: ImageIcon,
  contextLine: () => 'Seedream 5.0 Pro · 1:1 · 4 张',
  emptyLine: '说你想要的画面，我来写提示词、挑模型、配参考。',
  starterPills: ['把这句写成好提示词', '换个模型看差别'],
  inputPlaceholder: '描述画面，或把参考图挂进来…',
}

function renderEmpty(
  overrides: Partial<Parameters<typeof StudioOperatorEmptyState>[0]> = {},
) {
  render(<StudioOperatorEmptyState face={FACE} {...overrides} />)
}

describe('StudioOperatorEmptyState', () => {
  it('画 40px 头像 + 那一句（⛔ 没有第二段说明）', () => {
    renderEmpty()
    expect(screen.getByTestId('operator-empty-avatar').className).toContain(
      'size-10',
    )
    expect(screen.getByTestId('operator-empty-line').textContent).toBe(
      FACE.emptyLine,
    )
  })

  /**
   * owner 在画板上的判据：药丸是**诱饵**，不该比助手说的那句话还重。四条与输入框
   * 等宽、带边带影的卡摆在一句话底下，读起来像四个必须先做的选择。
   */
  /**
   * 手机 Sheet 实测：写成 `padding` 的 52 / 44 在矮容器里照样占满 96px，于是那句
   * 话被挤出可视区。所以它们是两根 `shrink` 的 spacer —— 宽松档还是画板那两个
   * 数（`basis-13` / `basis-11`），挤的时候先于内容让步。
   */
  it('⭐ 上下留白是会让步的 spacer，⛔ 不是写死的 padding', () => {
    renderEmpty()
    const root = screen.getByTestId('operator-empty')
    // ⛔ 留白不许回到 padding：padding 不会让步。
    expect(root.className).not.toMatch(/\bp[ytb]-/)
    // 这一格要填满会话区，两根 spacer 才有高度可分。
    expect(root.className).toContain('flex-1')
    expect(root.className).toContain('min-h-0')

    const spacers = [...root.children].filter((node) =>
      node.className.includes('basis-'),
    )
    expect(spacers.map((node) => node.className)).toEqual([
      expect.stringContaining('basis-13'),
      expect.stringContaining('basis-11'),
    ])
    for (const spacer of spacers) {
      // `shrink` = 挤的时候让步；`grow` = 宽松时把多出来的高度分掉（居中）。
      expect(spacer.className).toContain('shrink')
      expect(spacer.className).toContain('grow')
      expect(spacer.getAttribute('aria-hidden')).toBe('true')
    }
  })

  /** ⚠ 让步的是空白，⛔ 不是内容：头像与那句话都 `shrink-0`。 */
  it('⭐ 头像与那句话不跟着缩', () => {
    renderEmpty()
    expect(screen.getByTestId('operator-empty-avatar').className).toContain(
      'shrink-0',
    )
    expect(screen.getByTestId('operator-empty-line').className).toContain(
      'shrink-0',
    )
  })

  it('⭐ 空态里一颗药丸都不画 —— 它们搬去了输入框正上方', () => {
    renderEmpty()
    expect(screen.queryByTestId('operator-empty-suggestion')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByTestId('operator-empty')).toBeTruthy()
  })
})
