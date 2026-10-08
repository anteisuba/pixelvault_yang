import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'
import { ConfirmDialog } from './confirm-dialog'

function renderDialog(
  props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
) {
  const onConfirm = vi.fn()
  render(
    <ConfirmDialog
      trigger={<Button>Delete account</Button>}
      title="Delete your account?"
      description="Everything goes. This cannot be undone."
      cancelLabel="Cancel"
      confirmLabel="Delete account"
      onConfirm={onConfirm}
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
  return onConfirm
}

describe('ConfirmDialog', () => {
  it('opens a centered alert dialog that states the consequence', () => {
    renderDialog()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Everything goes. This cannot be undone.')
  })

  it('confirm is locked until the phrase is typed exactly', () => {
    const onConfirm = renderDialog({
      confirmPhrase: '注销',
      confirmPhraseLabel: '输入「注销」确认',
    })
    const dialog = screen.getByRole('alertdialog')
    const confirm = Array.from(dialog.querySelectorAll('button')).find(
      (button) => button.textContent === 'Delete account',
    )
    expect(confirm).toBeDisabled()

    const input = screen.getByLabelText('输入「注销」确认')
    fireEvent.change(input, { target: { value: '注' } })
    expect(confirm).toBeDisabled()

    fireEvent.change(input, { target: { value: '注销' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm!)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
