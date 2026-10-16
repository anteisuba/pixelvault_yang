import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appendOperatorEntry,
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import { StudioOperatorModeSwitch } from '@/components/business/studio/assistant-operator/StudioOperatorModeSwitch'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const RIN = { id: 'card-rin', name: 'Rin', userRole: '常来的熟客' }
const MIO = { id: 'card-mio', name: 'Mio', userRole: '' }

vi.mock('@/hooks/use-chat-characters', () => ({
  useChatCharacters: () => ({
    characters: [
      { character: RIN, opening: '欢迎光临喵' },
      { character: MIO, opening: '' },
    ],
    isLoading: false,
  }),
}))

afterEach(() => {
  cleanup()
  act(() => resetOperatorThread())
})

function startWorkThread() {
  act(() => {
    resetOperatorThread()
    appendOperatorEntry({
      kind: 'user',
      id: 'u-1',
      text: '帮我找制服参考',
      attachments: [],
    })
  })
}

function say(id: string) {
  act(() => {
    appendOperatorEntry({ kind: 'user', id, text: '嗯', attachments: [] })
  })
}

function marks() {
  return getOperatorState().entries.filter((entry) => entry.kind === 'chatMark')
}

describe('StudioOperatorModeSwitch', () => {
  it('⭐ 同一段对话里切：先选角色，记录不换，切的地方留一条标记', () => {
    startWorkThread()
    render(<StudioOperatorModeSwitch disabled={false} />)
    expect(
      screen.getByTestId('operator-mode-work').getAttribute('aria-pressed'),
    ).toBe('true')

    // 没聊过谁：点「聊天」先弹列表。
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByText('Rin'))
    expect(getOperatorState().chatCharacter).toEqual(RIN)
    expect(getOperatorState().entries[0]).toMatchObject({ id: 'u-1' })
    expect(marks()).toEqual([
      expect.objectContaining({ character: { id: RIN.id, name: 'Rin' } }),
    ])

    say('u-2')
    fireEvent.click(screen.getByTestId('operator-mode-work'))
    expect(getOperatorState().chatCharacter).toBeNull()
    expect(marks().at(-1)).toMatchObject({ character: null })

    // 聊过 Rin：再点「聊天」直接接着和她聊，带着卡上的身份。
    say('u-3')
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    expect(getOperatorState().chatCharacter).toEqual(RIN)
    expect(screen.queryByTestId('operator-mode-characters')).toBeNull()
    expect(marks()).toHaveLength(3)
  })

  it('中间没说话的来回切只留一条；切回原样就一条都不留', () => {
    startWorkThread()
    render(<StudioOperatorModeSwitch disabled={false} />)
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByText('Rin'))
    fireEvent.click(screen.getByTestId('operator-mode-work'))
    expect(marks()).toHaveLength(0)

    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByTestId('operator-mode-work'))
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    expect(marks()).toEqual([
      expect.objectContaining({ character: { id: RIN.id, name: 'Rin' } }),
    ])
  })

  it('在聊天里再点「聊天」弹列表换个人；点同一个人什么都不做', () => {
    startWorkThread()
    render(<StudioOperatorModeSwitch disabled={false} />)
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByText('Rin'))

    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByText('Rin'))
    expect(marks()).toHaveLength(1)

    say('u-2')
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByText('Mio'))
    expect(getOperatorState().chatCharacter).toEqual(MIO)
    expect(marks()).toHaveLength(2)
    expect(marks().at(-1)).toMatchObject({
      character: { id: MIO.id, name: 'Mio' },
    })
  })

  it('还空着的对话只换模式不留标记；工作里再点「工作」什么都不做', () => {
    act(() => resetOperatorThread())
    render(<StudioOperatorModeSwitch disabled={false} />)
    fireEvent.click(screen.getByTestId('operator-mode-work'))
    fireEvent.click(screen.getByTestId('operator-mode-chat'))
    fireEvent.click(screen.getByText('Mio'))
    expect(getOperatorState().chatCharacter).toEqual(MIO)
    expect(marks()).toHaveLength(0)
  })
})
