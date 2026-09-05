import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { VoiceRoomPage } from './VoiceRoomPage'

const state = vi.hoisted(() => ({
  rooms: [],
  detail: null,
  activeRoomId: null as string | null,
  loadingRooms: false,
  error: 'Request failed',
  openRoom: vi.fn(),
  createRoom: vi.fn(),
  refreshRooms: vi.fn(),
  dismissError: vi.fn(),
}))

vi.mock('@/hooks/use-voiceroom', () => ({ useVoiceRoom: () => state }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/contexts/api-keys-context', () => ({
  ApiKeysProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./VoiceRoomRail', () => ({ VoiceRoomRail: () => null }))
vi.mock('./VoiceRoomStage', () => ({ VoiceRoomStage: () => null }))

describe('VoiceRoomPage loading failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.activeRoomId = null
  })

  it('shows retry instead of loading and does not create a room after a list failure', () => {
    render(<VoiceRoomPage />)
    expect(screen.getByRole('alert').textContent).toContain('loadFailed')
    expect(screen.queryByText('loading')).toBeNull()
    expect(state.createRoom).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(state.refreshRooms).toHaveBeenCalledOnce()
  })

  it('retries the existing room when its detail failed, without creating another room', () => {
    state.activeRoomId = 'existing-room'
    render(<VoiceRoomPage />)
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(state.openRoom).toHaveBeenCalledWith('existing-room')
    expect(state.createRoom).not.toHaveBeenCalled()
    expect(state.refreshRooms).not.toHaveBeenCalled()
  })
})
