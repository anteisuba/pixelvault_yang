import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssistantConversation } from './AssistantConversation'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('AssistantConversation', () => {
  it('prefills a starter and sends it from the compact composer', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)

    render(
      <AssistantConversation
        messages={[]}
        isLoading={false}
        error={null}
        onSend={onSend}
        onRetry={vi.fn()}
        onFocusNode={vi.fn()}
        getNodeLabel={(id) => id}
        emptyHint="Canvas is ready"
        starters={[{ id: 'outline', label: 'Outline', prompt: 'Plan it' }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Outline' }))
    expect(screen.getByRole('textbox')).toHaveValue('Plan it')

    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Plan it'))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('collapses a long assistant reply to one preview paragraph and expands it on demand', () => {
    const details = `Detailed ending ${'with more production notes '.repeat(30)}`

    render(
      <AssistantConversation
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: `Opening direction for the story.\n\n${details}`,
            references: [],
            capabilities: [],
          },
        ]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onRetry={vi.fn()}
        onFocusNode={vi.fn()}
        getNodeLabel={(id) => id}
      />,
    )

    expect(screen.getByText('Opening direction for the story.')).toBeVisible()
    expect(screen.queryByText(/Detailed ending/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'expandMessage' }))

    expect(screen.getByText(/Detailed ending/)).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'collapseMessage' }),
    ).toHaveAttribute('aria-expanded', 'true')
  })
})
