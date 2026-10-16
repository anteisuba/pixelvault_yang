import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import { StudioOperatorChatPill } from '@/components/business/studio/assistant-operator/StudioOperatorChatPill'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

afterEach(cleanup)

describe('StudioOperatorChatPill', () => {
  it('点胶囊写「你在这段故事里是谁」，关上浮层才存', async () => {
    const rin = { id: 'card-rin', name: 'Rin' }
    resetOperatorThread(undefined, { character: rin, opening: '' })
    render(<StudioOperatorChatPill character={rin} userRole="" />)
    fireEvent.click(screen.getByTestId('operator-chat-pill'))
    fireEvent.change(screen.getByTestId('operator-chat-role'), {
      target: { value: '  刚搬来的邻居 ' },
    })
    expect(getOperatorState().chatUserRole).toBe('')
    // 浮层里刚有过一次交互的那一拍不算「关」（`Popover` 的内部交互闸），等它过去。
    await new Promise((resolve) => setTimeout(resolve, 0))
    fireEvent.click(screen.getByTestId('operator-chat-pill'))
    expect(getOperatorState().chatUserRole).toBe('刚搬来的邻居')
  })
})
