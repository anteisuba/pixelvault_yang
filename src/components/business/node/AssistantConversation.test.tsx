import { useState, type ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { NodeAssistantMediaReference } from '@/types/node-assistant'

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

type HarnessProps = Omit<
  ComponentProps<typeof AssistantConversation>,
  'selectedReferences' | 'onSelectedReferencesChange'
> & {
  initialReferences?: NodeAssistantMediaReference[]
  onReferencesChange?(references: NodeAssistantMediaReference[]): void
}

/**
 * 手势 A 把 `selectedReferences` 提到了 dock（受控）—— 测试里用这个壳扮演
 * dock，持有那份列表。
 */
function Harness({
  initialReferences = [],
  onReferencesChange,
  ...props
}: HarnessProps) {
  const [references, setReferences] =
    useState<NodeAssistantMediaReference[]>(initialReferences)
  return (
    <AssistantConversation
      {...props}
      selectedReferences={references}
      onSelectedReferencesChange={(next) => {
        setReferences(next)
        onReferencesChange?.(next)
      }}
    />
  )
}

const BASE_PROPS = {
  messages: [],
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
  onFocusNode: vi.fn(),
  getNodeLabel: (id: string) => id,
} satisfies Partial<HarnessProps>

describe('AssistantConversation', () => {
  it('prefills a starter and sends it from the compact composer', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)

    render(
      <Harness
        {...BASE_PROPS}
        onSend={onSend}
        emptyHint="Canvas is ready"
        starters={[{ id: 'outline', label: 'Outline', prompt: 'Plan it' }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Outline' }))
    // A4：输入框从 <textarea> 换成了 contentEditable 的 MentionInput（`@名字`
    // 要渲染成胶囊），所以读的是 textContent 不是 value。
    expect(screen.getByRole('textbox')).toHaveTextContent('Plan it')

    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Plan it'))
    expect(screen.getByRole('textbox')).toHaveTextContent('')
  })

  it('collapses a long assistant reply to one preview paragraph and expands it on demand', () => {
    const details = `Detailed ending ${'with more production notes '.repeat(30)}`

    render(
      <Harness
        {...BASE_PROPS}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: `Opening direction for the story.\n\n${details}`,
            references: [],
            capabilities: [],
          },
        ]}
        onSend={vi.fn()}
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

  /**
   * ⚠ A4 的守卫就是这一条。`@` 与附件按钮是**两种意图**：附件按钮＝挂附件，
   * `@`＝把引用写进句子。第一版让「选中任何素材都插胶囊」，草稿因此永远非空，
   * 这条当场变红 —— 它守的是 `assistant-shell.md` §4「用户可只附附件发送」。
   */
  it('can send an uploaded reference without requiring typed text', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    render(<Harness {...BASE_PROPS} onSend={onSend} />)

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
      <Harness
        {...BASE_PROPS}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Check the node.',
            references: [{ nodeId: 'node-1' }],
            capabilities: [],
          },
        ]}
        onSend={vi.fn()}
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
      <Harness
        {...BASE_PROPS}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Check the node.',
            references: [{ nodeId: 'node-deleted' }],
            capabilities: [],
          },
        ]}
        onSend={vi.fn()}
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

  // ─── 手势 A：从画布拾进输入框 ────────────────────────────────────────
  it('renders a dock-injected canvas reference as a chip and sends it with the turn', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const onReferencesChange = vi.fn()
    render(
      <Harness
        {...BASE_PROPS}
        onSend={onSend}
        onReferencesChange={onReferencesChange}
        initialReferences={[
          {
            id: 'node-reference:img-1',
            nodeId: 'img-1',
            source: 'canvas',
            kind: 'image',
            url: 'https://cdn.example.com/a.png',
            thumbnailUrl: 'https://cdn.example.com/a.png',
            label: '开场镜',
          },
        ]}
      />,
    )

    expect(screen.getByText('开场镜')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'send' }))

    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('referenceOnlyPrompt', [
        expect.objectContaining({ nodeId: 'img-1' }),
      ]),
    )
    // 发完清空 —— 由 dock 持有的列表通过回调归零。
    expect(onReferencesChange).toHaveBeenLastCalledWith([])
  })

  it('removing a reference chip reports the shorter list to the owner', () => {
    const onReferencesChange = vi.fn()
    render(
      <Harness
        {...BASE_PROPS}
        onSend={vi.fn()}
        onReferencesChange={onReferencesChange}
        initialReferences={[
          {
            id: 'node-reference:img-1',
            nodeId: 'img-1',
            kind: 'image',
            url: 'https://cdn.example.com/a.png',
            label: '开场镜',
          },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'removeReference' }))
    expect(onReferencesChange).toHaveBeenCalledWith([])
  })

  it('renders picked non-media nodes as removable chips', () => {
    const onRemovePickedNode = vi.fn()
    render(
      <Harness
        {...BASE_PROPS}
        onSend={vi.fn()}
        pickedNodes={[{ id: 'text-1', label: '第一镜文本' }]}
        onRemovePickedNode={onRemovePickedNode}
      />,
    )
    expect(screen.getByText('第一镜文本')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'removePickedNode' }))
    expect(onRemovePickedNode).toHaveBeenCalledWith('text-1')
  })

  it('arms pick mode on composer focus and via the explicit toggle; the hint swaps while armed', () => {
    const onComposerFocus = vi.fn()
    const onPickToggle = vi.fn()
    const { rerender } = render(
      <Harness
        {...BASE_PROPS}
        onSend={vi.fn()}
        onComposerFocus={onComposerFocus}
        onPickToggle={onPickToggle}
        pickArmed={false}
      />,
    )
    expect(screen.getByText('modeHint')).toBeInTheDocument()

    fireEvent.focus(screen.getByRole('textbox'))
    expect(onComposerFocus).toHaveBeenCalledTimes(1)

    const toggle = screen.getByRole('button', { name: 'pickFromCanvas' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(onPickToggle).toHaveBeenCalledTimes(1)

    rerender(
      <Harness
        {...BASE_PROPS}
        onSend={vi.fn()}
        onComposerFocus={onComposerFocus}
        onPickToggle={onPickToggle}
        pickArmed
      />,
    )
    expect(screen.getByText('pickArmedHint')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'pickFromCanvas' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
