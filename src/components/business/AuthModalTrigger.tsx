'use client'

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { Children, cloneElement, isValidElement } from 'react'

import { cn } from '@/lib/utils'

import { useAuthModal } from './AuthModalProvider'

export type AuthModalIntent = 'sign-in' | 'sign-up'

export type AuthModalTriggerProps = {
  /** Default sign-in; sign-up for primary “start creating” CTAs. */
  intent?: AuthModalIntent
  /**
   * Kept for API stability; redirect is owned by AuthModalProvider
   * (locale-aware Studio path).
   */
  fallbackRedirectUrl?: string
  /**
   * When true, the single child element receives the open handler
   * (use with `<Button>`). When false, renders a native button wrapper.
   */
  asChild?: boolean
  children: ReactNode
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type' | 'onClick'
>

/**
 * Opens the in-page auth dialog (Haivis-style). Must sit under
 * `AuthModalProvider` (mounted in `[locale]/layout`).
 */
export function AuthModalTrigger({
  intent = 'sign-in',
  className,
  asChild = false,
  children,
  ...buttonProps
}: AuthModalTriggerProps) {
  const { openAuth } = useAuthModal()

  const handleOpen = () => {
    openAuth(intent)
  }

  if (asChild) {
    const only = Children.only(children)
    if (!isValidElement<{ className?: string; onClick?: unknown }>(only)) {
      throw new Error(
        'AuthModalTrigger asChild requires a single React element',
      )
    }
    return cloneElement(
      only as ReactElement<{
        className?: string
        onClick?: (e: unknown) => void
      }>,
      {
        className: cn(only.props.className, className),
        onClick: (event: unknown) => {
          const prev = only.props.onClick
          if (typeof prev === 'function') {
            prev(event)
          }
          handleOpen()
        },
      },
    )
  }

  return (
    <button
      type="button"
      className={className}
      {...buttonProps}
      onClick={handleOpen}
    >
      {children}
    </button>
  )
}
