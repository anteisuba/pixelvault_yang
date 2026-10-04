import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageEditComposer } from './ImageEditComposer'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

function renderComposer(overrides?: {
  canSubmit?: boolean
  isRunning?: boolean
}) {
  const onSubmit = vi.fn()
  const result = render(
    <ImageEditComposer
      controls={{
        input: <textarea aria-label="Edit instruction" />,
        onSubmit,
        canSubmit: overrides?.canSubmit ?? true,
        submitLabel: 'Apply edit',
      }}
      tasks={null}
      settings={null}
      isRunning={overrides?.isRunning ?? false}
    />,
  )
  return { ...result, onSubmit }
}

describe('ImageEditComposer', () => {
  it('submits one edit on the composer shortcut and removes the listener on exit', () => {
    const { onSubmit, unmount } = renderComposer()
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      metaKey: true,
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    unmount()
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it.each([{ canSubmit: false }, { isRunning: true }])(
    'blocks button and shortcut while unavailable: %j',
    (state) => {
      const { onSubmit } = renderComposer(state)
      expect(screen.getByRole('button', { name: 'Apply edit' })).toBeDisabled()
      fireEvent.submit(screen.getByTestId('image-edit-composer'))
      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
      expect(onSubmit).not.toHaveBeenCalled()
    },
  )

  it('ignores input method composition and shortcuts inside another editor', () => {
    const { onSubmit } = renderComposer()
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      metaKey: true,
      isComposing: true,
    })
    const otherInput = document.createElement('textarea')
    document.body.append(otherInput)
    fireEvent.keyDown(otherInput, { key: 'Enter', ctrlKey: true })
    otherInput.remove()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
