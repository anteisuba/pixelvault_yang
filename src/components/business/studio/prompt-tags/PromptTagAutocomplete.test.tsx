import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import type { PromptPolarity } from '@/types/prompt-tags'

import { PromptTagAutocomplete } from './PromptTagAutocomplete'

// lora-workbench.md §5/§10 S6：这些测试用真实 PROMPT_TAG_DEFINITIONS（未 mock
// searchPromptTags），验收条目本身就是"敲 long 出 Long Hair"——用真词库既测
// 组件行为，也顺带验证真数据里确有这条词，一举两得。

function Harness({
  polarity = 'positive',
  initialValue = '',
}: {
  polarity?: PromptPolarity
  initialValue?: string
}) {
  const [value, setValue] = useState(initialValue)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  return (
    <div>
      <textarea
        ref={textareaRef}
        aria-label="prompt"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <PromptTagAutocomplete
        textareaRef={textareaRef}
        value={value}
        onChange={setValue}
        polarity={polarity}
      />
    </div>
  )
}

/** Fires a change event and places the caret at the end, like real typing. */
function typeInto(textarea: HTMLTextAreaElement, nextValue: string) {
  fireEvent.change(textarea, { target: { value: nextValue } })
  textarea.setSelectionRange(nextValue.length, nextValue.length)
}

function getPromptTextarea(): HTMLTextAreaElement {
  return screen.getByLabelText('prompt') as HTMLTextAreaElement
}

describe('PromptTagAutocomplete', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame

  beforeEach(() => {
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
  })

  it('opens the listbox with a matching tag after the debounce', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'long')

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(
      screen
        .getAllByRole('option')
        .some((option) => option.textContent?.includes('Long Hair')),
    ).toBe(true)
  })

  it('does not open for a query shorter than the minimum length', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'l')

    // Give the debounce window time to fire, then assert it stayed closed.
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does not render a listbox when there are zero matches', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'zzqq')

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does not open while an IME composition is in progress, and opens right after it ends', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()

    fireEvent.compositionStart(textarea)
    typeInto(textarea, 'long')
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.compositionEnd(textarea)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
  })

  it('ArrowDown moves the highlighted option', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'hai') // matches multiple hair-related tags

    await waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options.length).toBeGreaterThan(1)
    })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('Enter replaces the segment with promptText + ", " and lands the cursor at the tail', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'long')

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => expect(textarea.value).toBe('long_hair, '))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('Tab confirms the highlighted option the same way Enter does', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'long')

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    fireEvent.keyDown(textarea, { key: 'Tab' })

    await waitFor(() => expect(textarea.value).toBe('long_hair, '))
  })

  it('Escape closes the listbox and suppresses the same segment; continued typing re-triggers', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'lon')

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    // No further typing yet — same segment must stay suppressed.
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    // Continue typing → new segment text → suppression lifts.
    typeInto(textarea, 'long')
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
  })

  it('searches negative-polarity tags in the negative textarea', async () => {
    render(<Harness polarity="negative" />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'blur')

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(
      screen
        .getAllByRole('option')
        .some((option) => option.textContent?.includes('blurry')),
    ).toBe(true)
  })

  it('closes on blur without a pointerdown on an option', async () => {
    render(<Harness />)
    const textarea = getPromptTextarea()
    typeInto(textarea, 'long')

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    fireEvent.blur(textarea)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
