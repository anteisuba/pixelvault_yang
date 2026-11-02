import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import { serializeEditor } from '@/components/ui/mention-input'
import { normalizeReferenceMentions } from '@/lib/studio-reference-mentions'
import { StudioReferencePromptInput } from './StudioReferencePromptInput'

const fixture = vi.hoisted(() => ({
  entries: [] as ReferenceImageEntry[],
  initialPrompt: '',
  upload: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { index: number }) =>
    values ? `图${values.index}` : key,
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => {
    const [prompt, setPrompt] = useState(fixture.initialPrompt)
    return {
      state: { prompt },
      dispatch: (action: { payload: string }) => setPrompt(action.payload),
    }
  },
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: fixture.entries,
      handleFileChange: fixture.upload,
    },
  }),
}))

function typePrompt(value: string) {
  const editor = screen.getByRole('textbox')
  editor.focus()
  editor.textContent = value
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  if (editor.firstChild) range.setStart(editor.firstChild, value.length)
  range.collapse(true)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  fireEvent.input(editor)
  return editor
}

beforeEach(() => {
  vi.clearAllMocks()
  fixture.initialPrompt = ''
  fixture.entries = [
    { url: 'https://example.com/one.png', disabledReason: null },
    { url: 'https://example.com/two.png', disabledReason: null },
    { url: 'https://example.com/disabled.png', disabledReason: 'over_limit' },
  ]
})

describe('StudioReferencePromptInput', () => {
  it('renders assistant-written references as matching inline thumbnails', () => {
    fixture.initialPrompt =
      normalizeReferenceMentions('Image1 服装，参考图2 画风')
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    const editor = screen.getByRole('textbox')
    expect(serializeEditor(editor)).toBe('@Image1 服装，@Image2 画风')
    for (const [index, entry] of fixture.entries.slice(0, 2).entries()) {
      expect(
        editor.querySelector(`[data-mention="@Image${index + 1}"] img`),
      ).toHaveAttribute('src', entry.url)
    }
  })

  it('lists only enabled attached images with thumbnails and inserts the selected atomic reference', () => {
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    const editor = typePrompt('采用@')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(
      screen.getByRole('option', { name: '图2' }).querySelector('img'),
    ).toHaveAttribute('src', fixture.entries[1].url)
    fireEvent.keyDown(editor, { key: 'ArrowDown' })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(fixture.submit).not.toHaveBeenCalled()
    expect(serializeEditor(editor)).toBe('采用@Image2 ')
    expect(editor.querySelector('[data-mention="@Image2"]')).toHaveAttribute(
      'contenteditable',
      'false',
    )
    expect(editor.querySelector('img')).toHaveAttribute(
      'src',
      fixture.entries[1].url,
    )
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('portals the reference picker to the body, not the surrounding box', () => {
    /**
     * ⚠ 这条从前反过来断言「浮层留在外框里」（64b68e3a）。12ecc51c 把浮层改成
     * **只 portal 到 `document.body`**：它是 `position: fixed`，而 fixed 只在没有
     * transform / backdrop-filter 祖先时才以视口为参照 —— 留在外框里的表现是浮层
     * 被裁掉或飞出视口（见 `mention-input.tsx` 那段头注）。
     * ⛔ 别改回 `toContainElement`：那是把已经修掉的裁切 bug 重新钉死。
     */
    render(
      <div role="dialog">
        <StudioReferencePromptInput onSubmit={fixture.submit} />
      </div>,
    )
    typePrompt('@')
    const listbox = screen.getByRole('listbox')
    expect(listbox.parentElement).toBe(document.body)
    expect(screen.getByRole('dialog')).not.toContainElement(listbox)
  })

  it('supports pointer selection without replacing surrounding text', () => {
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    const editor = typePrompt('角色@')
    fireEvent.mouseDown(screen.getByRole('option', { name: '图1' }))
    fireEvent.click(screen.getByRole('option', { name: '图1' }))
    expect(serializeEditor(editor)).toBe('角色@Image1 ')
  })

  it('does not open for an email and Escape dismisses without submitting', () => {
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    typePrompt('user@example')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    const editor = typePrompt('@')
    fireEvent.keyDown(editor, { key: 'Escape' })
    fireEvent.keyUp(editor, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(fixture.submit).not.toHaveBeenCalled()
  })

  it('does not select or submit while committing a Chinese composition', () => {
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    const editor = typePrompt('@')
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })
    fireEvent.compositionEnd(editor)
    expect(serializeEditor(editor)).toBe('@')
    expect(fixture.submit).not.toHaveBeenCalled()
  })

  it('keeps the upload flow for pasted images', () => {
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    const file = new File(['image'], 'reference.png', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        files: [file],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      },
    })
    expect(fixture.upload).toHaveBeenCalledWith(file)
  })

  it('shows an empty state and does not submit on picker Enter without references', () => {
    fixture.entries = []
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    const editor = typePrompt('@')
    expect(screen.getByRole('listbox')).toHaveTextContent('empty')
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(fixture.submit).not.toHaveBeenCalled()
  })

  it('refreshes a referenced thumbnail after in-place image editing', () => {
    const { rerender } = render(
      <StudioReferencePromptInput onSubmit={fixture.submit} />,
    )
    const editor = typePrompt('@')
    fireEvent.keyDown(editor, { key: 'Enter' })
    act(() => {
      fixture.entries = [
        { url: 'https://example.com/edited.png', disabledReason: null },
      ]
    })
    rerender(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    expect(editor.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/edited.png',
    )
    expect(serializeEditor(editor)).toBe('@Image1 ')
  })

  it('pastes reference tokens as thumbnail chips and copies their portable image indices', () => {
    render(<StudioReferencePromptInput onSubmit={fixture.submit} />)
    const editor = typePrompt('使用')
    fireEvent.paste(editor, {
      clipboardData: { files: [], getData: () => '@Image2' },
    })
    expect(
      editor.querySelector('[data-mention="@Image2"] img'),
    ).toHaveAttribute('src', fixture.entries[1].url)
    const range = document.createRange()
    range.selectNodeContents(editor)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    const setData = vi.fn()
    fireEvent.copy(editor, { clipboardData: { setData } })
    expect(setData).toHaveBeenCalledWith('text/plain', '使用@Image2')
  })
})
