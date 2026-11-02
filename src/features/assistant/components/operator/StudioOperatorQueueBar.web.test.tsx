// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorQueueBar } from './StudioOperatorQueueBar'

/**
 * 排队条的回归闸（§3.1 ㉒–㉔ / §11.4「排队条」）。
 *
 * 钉四件事：
 *  ① 队里没东西时**整块不渲染** —— ⛔ 不留一条空的虚线框占位（§4.3）；
 *  ② 档位是 **warning**（「花钱与排队」那一档，§11.2），⛔ 不是 destructive：
 *    排队不是错误，用红色说这件事会让人以为自己干了什么坏事；
 *  ③ 排的原文写在条上（`truncate`）—— 用户要认得出被扣住的是哪一句；
 *  ④ 「撤回」把那一条的 id 交出去；⛔ 组件自己不动队列（通报与丢弃在 hook 里，
 *    两处都写会得到两行系统行）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('motion/react', () => ({
  motion: { div: 'div' },
  useReducedMotion: () => true,
}))

function queued(id: string, text: string) {
  return { id, text, attachments: [] as const }
}

describe('StudioOperatorQueueBar', () => {
  it('空队列整块不渲染', () => {
    render(<StudioOperatorQueueBar items={[]} onCancel={vi.fn()} />)
    expect(screen.queryByTestId('operator-queue-bar')).toBeNull()
  })

  it('warning 档 + 虚线，写出被排队的原文', () => {
    render(
      <StudioOperatorQueueBar
        items={[queued('q1', '等一下，比例改成 3:4')]}
        onCancel={vi.fn()}
      />,
    )
    const bar = screen.getByTestId('operator-queue-bar')
    expect(bar.dataset.count).toBe('1')

    const item = screen.getByTestId('operator-queue-item')
    // ⚠ `/70` 不是规格里的 40%：条底对面板底只有 1.10:1，这条边就是唯一的
    //    边界，40% 只有 1.81:1（contrast-check 实算，见组件头注）。
    expect(item.className).toContain('border-dashed')
    expect(item.className).toContain('border-status-warning/70')
    expect(item.className).toContain('bg-status-warning-surface')
    expect(item.className).toContain('text-status-warning')
    // ⛔ 破坏性档只留给 ⏹ / 「连对话一起回」/「清掉全部改动」（§11.2）。
    expect(item.className).not.toContain('destructive')
    expect(item.textContent).toContain('等一下，比例改成 3:4')
  })

  it('「撤回」把那一条的 id 交出去', () => {
    const onCancel = vi.fn()
    render(
      <StudioOperatorQueueBar
        items={[queued('q1', '甲'), queued('q2', '乙')]}
        onCancel={onCancel}
      />,
    )
    const buttons = screen.getAllByTestId('operator-queue-cancel')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)
    expect(onCancel).toHaveBeenCalledWith('q2')
  })
})
