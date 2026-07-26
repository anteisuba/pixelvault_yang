import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

// NodeShell.Header itself only reaches into next-intl (no ReactFlow hooks, no
// NodeWorkflowActionsContext) — but it's exported off the same `NodeShell`
// object as NodeShellRoot, so importing `NodeShell` at all still evaluates
// NodeShellRoot's own top-level import of `NodeSelectionToolbarChrome` from
// `../CanvasImageSelectionToolbar`, which transitively drags in
// AssetSelectorDialog's next-intl/navigation → next/navigation — unresolvable
// outside the Next.js runtime this Vitest environment doesn't provide. Same
// stub-the-whole-module fix `LooseImageCard.test.tsx` and `ImageNode.test.tsx`
// already use for exactly this kind of unrelated heavy transitive import.
vi.mock('../CanvasImageSelectionToolbar', () => ({
  NodeSelectionToolbarChrome: () => null,
}))

// Lightweight mock recipe shared with CanvasImageSelectionToolbar.test.tsx —
// ignores the namespace argument and echoes the key back so `t(type)` reads
// as the raw type string.
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
}))

import { NodeShell } from './NodeShell'

describe('NodeShell.Header — on-card rename (canvas-image-card.md §1)', () => {
  it('stays a read-only span when onRenameCommit is omitted (node types with no nameable field)', () => {
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.composer}
        status={NODE_STATUS_IDS.idle}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'rename' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    // Mocked useTranslations echoes the key, so t(type) === the type id.
    expect(screen.getByText(NODE_TYPE_IDS.composer)).toBeInTheDocument()
  })

  it('renders the name as a focusable, click-to-edit trigger when onRenameCommit is provided', () => {
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'rename' })
    expect(trigger).toHaveTextContent('娜波摩')
    // Keyboard-accessible per the task's "名字应可 Tab 聚焦并用 Enter 进入编辑"
    // requirement: a native <button> gives Tab-focus + Enter/Space activation
    // for free — real key-activation is a browser default action jsdom
    // doesn't simulate, so this asserts the semantic guarantee instead.
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).not.toBeDisabled()
    expect(trigger).not.toHaveAttribute('tabindex', '-1')
  })

  it('click enters edit mode with an input pre-filled with the raw (untranslated) value', () => {
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', {
      name: 'rename',
    }) as HTMLInputElement
    expect(input.value).toBe('娜波摩')
  })

  it('Enter commits the trimmed value and exits edit mode', () => {
    const onRenameCommit = vi.fn()
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={onRenameCommit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '  新名字  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRenameCommit).toHaveBeenCalledTimes(1)
    expect(onRenameCommit).toHaveBeenCalledWith('新名字')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('blur also commits (same path as Enter)', () => {
    const onRenameCommit = vi.fn()
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={onRenameCommit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '改名了' } })
    fireEvent.blur(input)

    expect(onRenameCommit).toHaveBeenCalledWith('改名了')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a no-op submit (unchanged value) does not call onRenameCommit', () => {
    const onRenameCommit = vi.fn()
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={onRenameCommit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'rename' }), {
      key: 'Enter',
    })
    expect(onRenameCommit).not.toHaveBeenCalled()
  })

  it('Esc reverts the draft without calling onRenameCommit', () => {
    const onRenameCommit = vi.fn()
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={onRenameCommit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '手滑乱打的字' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onRenameCommit).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'rename' })).toHaveTextContent(
      '娜波摩',
    )
  })

  it('an empty (or whitespace-only) submit does not call onRenameCommit and reverts instead of writing ""', () => {
    const onRenameCommit = vi.fn()
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={onRenameCommit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRenameCommit).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'rename' })).toHaveTextContent(
      '娜波摩',
    )
  })

  it('an empty submit on a never-named card reverts to the type-label placeholder, never persists ""', () => {
    const onRenameCommit = vi.fn()
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.image}
        status={NODE_STATUS_IDS.idle}
        onRenameCommit={onRenameCommit}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'rename' })
    // No custom title yet — the trigger shows the type-label fallback.
    expect(trigger).toHaveTextContent(NODE_TYPE_IDS.image)

    fireEvent.click(trigger)
    const input = screen.getByRole('textbox', {
      name: 'rename',
    }) as HTMLInputElement
    // The editable value is the RAW name, empty here — not the fallback text
    // baked in (so an unmodified Enter can never silently commit the
    // placeholder string as a real name).
    expect(input.value).toBe('')
    expect(input.placeholder).toBe(NODE_TYPE_IDS.image)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRenameCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'rename' })).toHaveTextContent(
      NODE_TYPE_IDS.image,
    )
  })

  it('does not commit on the Enter that confirms an IME composition candidate', () => {
    const onRenameCommit = vi.fn()
    render(
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={NODE_STATUS_IDS.idle}
        title="娜波摩"
        onRenameCommit={onRenameCommit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'rename' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: 'なみ' } })
    // KeyboardEventInit supports `isComposing` — this is how the native
    // event (and therefore React's `event.nativeEvent.isComposing`) carries
    // the IME-composing flag through fireEvent.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(onRenameCommit).not.toHaveBeenCalled()
    // Still editing — the composing Enter must not have exited edit mode.
    expect(screen.getByRole('textbox', { name: 'rename' })).toBeInTheDocument()
  })
})
