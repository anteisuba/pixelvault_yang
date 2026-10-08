import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthCodeInput } from './AuthCodeInput'

function boxes() {
  return screen.getAllByRole('textbox') as HTMLInputElement[]
}

function renderInput(
  props: Partial<React.ComponentProps<typeof AuthCodeInput>> = {},
) {
  const onComplete = vi.fn()
  const utils = render(
    <AuthCodeInput
      label="验证码"
      invalid={false}
      errorSerial={0}
      onComplete={onComplete}
      {...props}
    />,
  )
  return { ...utils, onComplete }
}

describe('AuthCodeInput — 6 格验证码', () => {
  it('renders six boxes and focuses the first', () => {
    renderInput()
    expect(boxes()).toHaveLength(6)
    expect(document.activeElement).toBe(boxes()[0])
    expect(boxes()[0]).toHaveAttribute('autocomplete', 'one-time-code')
  })

  it('typing moves to the next box; the sixth digit submits', () => {
    const { onComplete } = renderInput()
    '12345'.split('').forEach((d, i) => {
      fireEvent.change(boxes()[i], { target: { value: d } })
    })
    expect(document.activeElement).toBe(boxes()[5])
    expect(onComplete).not.toHaveBeenCalled()
    fireEvent.change(boxes()[5], { target: { value: '6' } })
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('pasting fills all six boxes and submits, wherever the caret was', () => {
    const { onComplete } = renderInput()
    fireEvent.paste(boxes()[3], {
      clipboardData: { getData: () => ' 987 654 ' },
    })
    expect(boxes().map((b) => b.value)).toEqual(['9', '8', '7', '6', '5', '4'])
    expect(onComplete).toHaveBeenCalledWith('987654')
  })

  it('one-time-code autofill into one box spreads across all six', () => {
    const { onComplete } = renderInput()
    fireEvent.change(boxes()[0], { target: { value: '246810' } })
    expect(onComplete).toHaveBeenCalledWith('246810')
  })

  it('backspace on an empty box clears and focuses the previous one', () => {
    renderInput()
    fireEvent.change(boxes()[0], { target: { value: '1' } })
    fireEvent.change(boxes()[1], { target: { value: '2' } })
    expect(document.activeElement).toBe(boxes()[2])
    fireEvent.keyDown(boxes()[2], { key: 'Backspace' })
    expect(document.activeElement).toBe(boxes()[1])
    expect(boxes()[1].value).toBe('')
    expect(boxes()[0].value).toBe('1')
  })

  it('a wrong code turns the boxes red, clears them and returns to the first', () => {
    const { rerender, onComplete } = renderInput()
    fireEvent.paste(boxes()[0], {
      clipboardData: { getData: () => '111111' },
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    ;(boxes()[5] as HTMLInputElement).focus()

    rerender(
      <AuthCodeInput
        label="验证码"
        invalid
        errorSerial={1}
        onComplete={onComplete}
      />,
    )

    expect(screen.getByRole('group')).toHaveAttribute('data-invalid', 'true')
    expect(boxes().every((b) => b.value === '')).toBe(true)
    expect(document.activeElement).toBe(boxes()[0])
    boxes().forEach((b) => expect(b).toHaveAttribute('aria-invalid', 'true'))
  })

  it('tells the parent the user is typing again so the red can go', () => {
    const onEdit = vi.fn()
    renderInput({ invalid: true, errorSerial: 1, onEdit })
    fireEvent.change(boxes()[0], { target: { value: '4' } })
    expect(onEdit).toHaveBeenCalled()
  })
})
