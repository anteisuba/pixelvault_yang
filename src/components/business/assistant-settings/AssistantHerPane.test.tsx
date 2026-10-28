import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/hooks/use-chat-characters', () => ({
  useChatCharacters: () => ({
    characters: [
      { character: { id: 'card-1', name: 'Denia' }, avatarUrl: null },
      { character: { id: 'card-2', name: 'Rei' }, avatarUrl: null },
    ],
    isLoading: false,
  }),
}))

import { AssistantHerPane } from './AssistantHerPane'

describe('AssistantHerPane', () => {
  it('每个角色一行，点了去她的角色页（日记和改动搬到那里了）', () => {
    render(<AssistantHerPane />)
    const rows = screen.getAllByTestId('assistant-her-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('href')).toBe('/library/cards?character=card-1')
    expect(rows[0].textContent).toContain('Denia')
    expect(rows[0].textContent).toContain('her.openOnPage')
  })
})
