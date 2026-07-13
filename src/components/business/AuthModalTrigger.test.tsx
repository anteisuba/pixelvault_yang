import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthModalTrigger } from './AuthModalTrigger'

vi.mock('@clerk/nextjs', () => ({
  SignInButton: ({
    children,
    mode,
  }: {
    children: ReactNode
    mode?: string
  }) => (
    <div data-testid="sign-in-button" data-mode={mode}>
      {children}
    </div>
  ),
  SignUpButton: ({
    children,
    mode,
  }: {
    children: ReactNode
    mode?: string
  }) => (
    <div data-testid="sign-up-button" data-mode={mode}>
      {children}
    </div>
  ),
}))

describe('AuthModalTrigger', () => {
  it('opens sign-in in modal mode by default', () => {
    render(<AuthModalTrigger>Log in</AuthModalTrigger>)
    const host = screen.getByTestId('sign-in-button')
    expect(host).toHaveAttribute('data-mode', 'modal')
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
  })

  it('opens sign-up in modal mode when intent is sign-up', () => {
    render(<AuthModalTrigger intent="sign-up">Start</AuthModalTrigger>)
    expect(screen.getByTestId('sign-up-button')).toHaveAttribute(
      'data-mode',
      'modal',
    )
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('forwards asChild element without nesting a second button', () => {
    render(
      <AuthModalTrigger intent="sign-in" asChild>
        <button type="button" className="custom">
          Nested
        </button>
      </AuthModalTrigger>,
    )
    const btn = screen.getByRole('button', { name: 'Nested' })
    expect(btn).toHaveClass('custom')
    expect(btn.parentElement).toHaveAttribute('data-testid', 'sign-in-button')
  })
})
