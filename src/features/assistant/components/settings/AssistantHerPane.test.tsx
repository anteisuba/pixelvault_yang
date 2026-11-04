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
/** 只假接口：真的 `useChatCharacters` 去要卡片列表。 */
const card = (id: string, name: string) => ({
  id,
  name,
  voiceCardId: null,
  looks: [{ isDefault: true, referenceSlots: [] }],
})
vi.mock('@/lib/api-client/cards', () => ({
  listCharacterCardsAPI: vi.fn(async () => ({
    success: true,
    data: [card('card-1', 'Denia'), card('card-2', 'Rei')],
  })),
}))

import { AssistantHerPane } from './AssistantHerPane'

describe('AssistantHerPane', () => {
  it('每个角色一行，点了去她的角色页（日记和改动搬到那里了）', async () => {
    render(<AssistantHerPane />)
    const rows = await screen.findAllByTestId('assistant-her-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('href')).toBe('/library/cards?character=card-1')
    expect(rows[0].textContent).toContain('Denia')
    expect(rows[0].textContent).toContain('her.openOnPage')
  })
})
