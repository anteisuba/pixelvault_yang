import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CanvasAssistantHistoryPanel } from './CanvasAssistantHistory'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const sessions = [
  {
    id: 'session-1',
    title: '便利店分镜',
    updatedAt: '2026-08-11T00:00:00.000Z',
    messages: [],
  },
  {
    id: 'session-2',
    title: '雨夜短片',
    updatedAt: '2026-08-10T00:00:00.000Z',
    messages: [],
  },
]

describe('CanvasAssistantHistoryPanel', () => {
  it('renders as a searchable sidebar panel and restores a selected session', () => {
    const onSelect = vi.fn()
    render(
      <CanvasAssistantHistoryPanel
        sessions={sessions}
        activeSessionId="session-1"
        onSelect={onSelect}
        fill
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('search'), {
      target: { value: '雨夜' },
    })
    expect(screen.queryByText('便利店分镜')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /雨夜短片/ }))
    expect(onSelect).toHaveBeenCalledWith('session-2')
  })
})
