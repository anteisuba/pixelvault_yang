import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StudioConversationRecent } from './StudioConversationRecent'

vi.mock('next-intl', () => ({
  useTranslations:
    (ns: string) => (key: string, values?: Record<string, unknown>) =>
      values?.title ? `${ns}:${key}:${values.title}` : `${ns}:${key}`,
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-studio-conversation-bench', () => ({
  conversationBenchOf: () => null,
  useStudioConversationBenchOverrides: () => ({}),
}))
vi.mock('@/hooks/use-studio-conversation-activity', () => ({
  useStudioConversationActivity: () => new Map(),
}))

const rooms = vi.hoisted(() => ({
  rename: vi.fn(async () => true),
  remove: vi.fn(async () => true),
}))
vi.mock('@/hooks/use-shell-voice-rooms', () => ({
  useShellVoiceRooms: () => ({
    rooms: [
      {
        id: 'r1',
        name: '翩翩姐',
        updatedAt: '2026-10-25T00:00:00.000Z',
        cast: [],
      },
    ],
    activeRoomId: null,
  }),
  renameShellVoiceRoom: rooms.rename,
  deleteShellVoiceRoom: rooms.remove,
}))

function openMore() {
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'StudioShell:recentMore:翩翩姐' }),
    { button: 0, ctrlKey: false },
  )
}

describe('StudioConversationRecent（最近：改名 / 删除，用户 10-25）', () => {
  beforeEach(() => {
    rooms.rename.mockClear()
    rooms.remove.mockClear()
    render(
      <StudioConversationRecent
        history={null}
        routeKind="home"
        pathname="/studio"
        rowClass=""
        rowActiveClass=""
      />,
    )
  })

  it('改名：就地变输入框，回车存', async () => {
    openMore()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'StudioShell:recentRename' }),
    )
    const input = screen.getByRole('textbox', {
      name: 'StudioShell:recentRenameLabel:翩翩姐',
    })
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(rooms.rename).toHaveBeenCalledWith('r1', '新名字'),
    )
  })

  it('删除：先居中确认，确认了才删', async () => {
    openMore()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'StudioShell:recentDelete' }),
    )
    expect(rooms.remove).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'StudioShell:recentDelete' }),
    )
    await waitFor(() => expect(rooms.remove).toHaveBeenCalledWith('r1'))
  })
})
