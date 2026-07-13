import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const openAuth = vi.fn()

vi.mock('./AuthModalProvider', () => ({
  useAuthModal: () => ({
    openAuth,
    closeAuth: vi.fn(),
  }),
}))

import { AuthModalTrigger } from './AuthModalTrigger'

describe('AuthModalTrigger', () => {
  it('opens sign-in by default', () => {
    openAuth.mockClear()
    render(<AuthModalTrigger>Log in</AuthModalTrigger>)
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(openAuth).toHaveBeenCalledWith('sign-in')
  })

  it('opens sign-up when intent is sign-up', () => {
    openAuth.mockClear()
    render(<AuthModalTrigger intent="sign-up">Start</AuthModalTrigger>)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(openAuth).toHaveBeenCalledWith('sign-up')
  })

  it('forwards asChild element without nesting a second button', () => {
    openAuth.mockClear()
    render(
      <AuthModalTrigger intent="sign-in" asChild>
        <button type="button" className="custom">
          Nested
        </button>
      </AuthModalTrigger>,
    )
    const btn = screen.getByRole('button', { name: 'Nested' })
    expect(btn).toHaveClass('custom')
    fireEvent.click(btn)
    expect(openAuth).toHaveBeenCalledWith('sign-in')
  })
})
