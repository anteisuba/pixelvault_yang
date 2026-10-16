import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import { StudioOperatorChatPill } from '@/components/business/studio/assistant-operator/StudioOperatorChatPill'

const { mockUpdateCharacterCard } = vi.hoisted(() => ({
  mockUpdateCharacterCard: vi.fn(),
}))
vi.mock('@/lib/api-client/cards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/cards')>()),
  updateCharacterCardAPI: mockUpdateCharacterCard,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

afterEach(cleanup)

describe('StudioOperatorChatPill', () => {
  it('点胶囊写「你在她故事里是谁」，关上浮层才存到卡上', async () => {
    mockUpdateCharacterCard.mockResolvedValue({ success: true })
    const rin = { id: 'card-rin', name: 'Rin', userRole: '' }
    resetOperatorThread(undefined, { character: rin, opening: '' })
    render(<StudioOperatorChatPill character={rin} />)
    fireEvent.click(screen.getByTestId('operator-chat-pill'))
    fireEvent.change(screen.getByTestId('operator-chat-role'), {
      target: { value: '  刚搬来的邻居 ' },
    })
    expect(mockUpdateCharacterCard).not.toHaveBeenCalled()
    // 浮层里刚有过一次交互的那一拍不算「关」（`Popover` 的内部交互闸），等它过去。
    await new Promise((resolve) => setTimeout(resolve, 0))
    fireEvent.click(screen.getByTestId('operator-chat-pill'))
    expect(mockUpdateCharacterCard).toHaveBeenCalledWith('card-rin', {
      extensions: { 'pv.chatUserRole': '刚搬来的邻居' },
    })
    expect(getOperatorState().chatCharacter?.userRole).toBe('刚搬来的邻居')
  })
})
