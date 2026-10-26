import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CharacterGrowth } from '@/types/character-growth'

vi.mock('next-intl', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${Object.values(values).join(',')}` : key
  t.has = () => false
  return {
    useTranslations: () => t,
    useFormatter: () => ({ dateTime: () => 'date' }),
  }
})

const mocks = vi.hoisted(() => ({
  growth: null as CharacterGrowth | null,
  revert: vi.fn(),
}))

vi.mock('@/hooks/use-chat-characters', () => ({
  useChatCharacters: () => ({
    characters: [
      {
        character: { id: 'card-1', name: 'Denia' },
        avatarUrl: null,
        voiceCardId: null,
      },
    ],
    isLoading: false,
  }),
}))
vi.mock('@/hooks/cards', () => ({
  useCharacterGrowth: () => ({
    growth: mocks.growth,
    isLoading: false,
    error: null,
    revertingId: null,
    revert: mocks.revert,
    reload: vi.fn(),
  }),
}))

import { AssistantHerPane } from './AssistantHerPane'

const AT = new Date().toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.growth = {
    journals: [
      { id: 'j2', text: '他今天又画崩了。', createdAt: AT },
      { id: 'j1', text: '第一篇。', createdAt: AT },
    ],
    revisions: [
      {
        id: 'r1',
        source: 'REFLECTION',
        fields: ['speech'],
        before: { speech: '慢吞吞' },
        after: { speech: '慢吞吞，熟了会拖长音' },
        reason: '跟他熟了',
        revertedAt: null,
        createdAt: AT,
      },
      {
        id: 'r0',
        source: 'CHAT',
        fields: ['catchphrases'],
        before: { catchphrases: [] },
        after: { catchphrases: ['哼'] },
        reason: null,
        revertedAt: AT,
        createdAt: AT,
      },
    ],
  }
})

describe('AssistantHerPane', () => {
  it('日记只摊开最新一篇，更早的点开才有', () => {
    render(<AssistantHerPane />)
    expect(screen.getByText('他今天又画崩了。')).toBeTruthy()
    expect(screen.queryByText('第一篇。')).toBeNull()
    fireEvent.click(screen.getByText('her.journalEarlier|1'))
    expect(screen.getByText('第一篇。')).toBeTruthy()
  })

  it('一行摘要带理由，点开看前后；撤回过的不再给撤回', () => {
    render(<AssistantHerPane />)
    expect(screen.getByText('her.reason|跟他熟了')).toBeTruthy()
    expect(screen.queryByText('慢吞吞')).toBeNull()
    fireEvent.click(screen.getByText('her.reason|跟他熟了'))
    expect(screen.getByText('慢吞吞')).toBeTruthy()
    const reverts = screen.getAllByTestId('assistant-her-revert')
    expect(reverts).toHaveLength(1)
    fireEvent.click(reverts[0]!)
    expect(mocks.revert).toHaveBeenCalledWith('r1')
    expect(screen.getByText('her.reverted')).toBeTruthy()
  })
})
