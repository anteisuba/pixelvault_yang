'use client'

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { Children, cloneElement, isValidElement } from 'react'
import { SignInButton, SignUpButton } from '@clerk/nextjs'

import { ROUTES } from '@/constants/routes'
import { clerkModalAppearance } from '@/lib/clerk-appearance'
import { cn } from '@/lib/utils'

export type AuthModalIntent = 'sign-in' | 'sign-up'

export type AuthModalTriggerProps = {
  /** Default sign-in; sign-up for primary “start creating” CTAs. */
  intent?: AuthModalIntent
  /** Where Clerk sends the user after a successful session. */
  fallbackRedirectUrl?: string
  /**
   * When true, the single child element receives Clerk’s click handler
   * (use with `<Button>`). When false, renders a native button wrapper.
   */
  asChild?: boolean
  children: ReactNode
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type' | 'onClick'
>

/**
 * Opens Clerk auth in a modal over the current page (owner: Haivis-style
 * task switch). Path routes `/sign-in` and `/sign-up` stay for OAuth /
 * email deep links and middleware redirects.
 */
export function AuthModalTrigger({
  intent = 'sign-in',
  fallbackRedirectUrl = ROUTES.STUDIO_IMAGE,
  className,
  asChild = false,
  children,
  ...buttonProps
}: AuthModalTriggerProps) {
  const child = resolveChild({ asChild, className, children, buttonProps })

  if (intent === 'sign-up') {
    return (
      <SignUpButton
        mode="modal"
        appearance={clerkModalAppearance}
        fallbackRedirectUrl={fallbackRedirectUrl}
        signInFallbackRedirectUrl={fallbackRedirectUrl}
      >
        {child}
      </SignUpButton>
    )
  }

  return (
    <SignInButton
      mode="modal"
      appearance={clerkModalAppearance}
      fallbackRedirectUrl={fallbackRedirectUrl}
      signUpFallbackRedirectUrl={fallbackRedirectUrl}
      withSignUp
    >
      {child}
    </SignInButton>
  )
}

function resolveChild({
  asChild,
  className,
  children,
  buttonProps,
}: {
  asChild: boolean
  className?: string
  children: ReactNode
  buttonProps: Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'children' | 'type' | 'onClick' | 'className'
  >
}): ReactElement {
  if (asChild) {
    const only = Children.only(children)
    if (!isValidElement<{ className?: string }>(only)) {
      throw new Error(
        'AuthModalTrigger asChild requires a single React element',
      )
    }
    if (!className) return only
    return cloneElement(only, {
      className: cn(only.props.className, className),
    })
  }

  return (
    <button type="button" className={className} {...buttonProps}>
      {children}
    </button>
  )
}
