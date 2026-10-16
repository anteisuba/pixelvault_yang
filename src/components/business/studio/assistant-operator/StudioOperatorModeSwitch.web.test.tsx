import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import { StudioOperatorModeSwitch } from '@/components/business/studio/assistant-operator/StudioOperatorModeSwitch'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const RIN = { id: 'card-rin', name: 'Rin' }
const MIO = { id: 'card-mio', name: 'Mio' }

vi.mock('@/hooks/use-chat-characters', () => ({
  useChatCharacters: () => ({
    characters: [
      { character: RIN, opening: '欢迎光临喵' },
      { character: MIO, opening: '' },
    ],
    isLoading: false,
  }),
}))

afterEach(cleanup)

function session(
  id: string,
  chatCharacter: { id: string; name: string } | null,
) {
  return {
    id,
    chatCharacter,
  } as UseStudioOperatorHistoryResult['sessions'][number]
}

function renderSwitch(
  chatCharacter: { id: string; name: string } | null,
  sessions: UseStudioOperatorHistoryResult['sessions'],
) {
  const history = {
    sessions,
    selectSession: vi.fn(),
    refreshSessions: vi.fn(),
  } as unknown as UseStudioOperatorHistoryResult
  const onNewThread = vi.fn()
  render(
    <StudioOperatorModeSwitch
      chatCharacter={chatCharacter}
      history={history}
      disabled={false}
      onNewThread={onNewThread}
    />,
  )
  return { history, onNewThread }
}

describe('StudioOperatorModeSwitch', () => {
  it('工作里点「聊天」选角色：和她聊过就回到最近那段，没聊过就新开一段', () => {
    const { history, onNewThread } = renderSwitch(null, [
      session('work-1', null),
      session('rin-1', RIN),
    ])
    expect(
      screen.getByTestId('operator-mode-work').getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    expect(history.refreshSessions).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByText('Rin'))
    expect(history.selectSession).toHaveBeenCalledWith(session('rin-1', RIN))
    expect(onNewThread).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByText('Mio'))
    expect(onNewThread).toHaveBeenCalledWith({ character: MIO, opening: '' })
  })

  it('聊天里点「工作」：回到最近那段工作会话；没有就新开一段', () => {
    const first = renderSwitch(RIN, [
      session('rin-1', RIN),
      session('work-1', null),
      session('work-2', null),
    ])
    fireEvent.click(screen.getByTestId('operator-mode-work'))
    expect(first.history.selectSession).toHaveBeenCalledWith(
      session('work-1', null),
    )
    cleanup()

    const second = renderSwitch(RIN, [session('rin-1', RIN)])
    fireEvent.click(screen.getByTestId('operator-mode-work'))
    expect(second.onNewThread).toHaveBeenCalledWith()
  })

  it('工作里再点「工作」什么都不做', () => {
    const { history, onNewThread } = renderSwitch(null, [session('w', null)])
    fireEvent.click(screen.getByTestId('operator-mode-work'))
    expect(history.selectSession).not.toHaveBeenCalled()
    expect(onNewThread).not.toHaveBeenCalled()
  })
})
