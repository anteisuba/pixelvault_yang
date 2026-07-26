import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssistantConversation } from './AssistantConversation'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('./CanvasAssistantReferencePicker', () => ({
  CanvasAssistantReferencePicker: (props: {
    onAddReference(reference: {
      id: string
      kind: 'image'
      url: string
      label: string
    }): void
  }) => (
    <button
      type="button"
      onClick={() =>
        props.onAddReference({
          id: 'uploaded-image:1',
          kind: 'image',
          url: 'https://cdn.example.com/reference.png',
          label: 'reference.png',
        })
      }
    >
      addReference
    </button>
  ),
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

  it('can send an uploaded reference without requiring typed text', async () => {
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
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'addReference' }))
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        'referenceOnlyPrompt',
        expect.arrayContaining([
          expect.objectContaining({ id: 'uploaded-image:1' }),
        ]),
      ),
    )
  })

  it('renders a message node reference as a clickable chip labeled with its resolved title', () => {
    const onFocusNode = vi.fn()

    render(
      <AssistantConversation
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Check the node.',
            references: [{ nodeId: 'node-1' }],
            capabilities: [],
          },
        ]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onRetry={vi.fn()}
        onFocusNode={onFocusNode}
        getNodeLabel={(id) => (id === 'node-1' ? 'Opening Shot' : undefined)}
      />,
    )

    const chip = screen.getByRole('button', { name: 'Opening Shot' })
    fireEvent.click(chip)
    expect(onFocusNode).toHaveBeenCalledWith('node-1')
  })

  it('renders a reference to a deleted node as a muted, non-clickable chip instead of its raw id', () => {
    render(
      <AssistantConversation
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Check the node.',
            references: [{ nodeId: 'node-deleted' }],
            capabilities: [],
          },
        ]}
        isLoading={false}
        error={null}
        onSend={vi.fn()}
        onRetry={vi.fn()}
        onFocusNode={vi.fn()}
        getNodeLabel={() => undefined}
      />,
    )

    expect(screen.queryByText('node-deleted')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'node-deleted' }),
    ).not.toBeInTheDocument()
    const chip = screen.getByText('unknownNodeReference')
    expect(chip.tagName).toBe('SPAN')
  })
})
