'use client'

import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import {
  AuthModalTrigger,
  type AuthModalIntent,
} from '@/components/business/AuthModalTrigger'
import { cn } from '@/lib/utils'

type ButtonSize = ComponentProps<typeof Button>['size']
type ButtonVariant = ComponentProps<typeof Button>['variant']

interface AuthModalCtaButtonProps {
  label: string
  intent?: AuthModalIntent
  size?: ButtonSize
  variant?: ButtonVariant
  className?: string
}

/**
 * Client island for server pages (cards/assets empty states) that need a
 * Haivis-style auth modal without turning the whole page into a client tree.
 */
export function AuthModalCtaButton({
  label,
  intent = 'sign-in',
  size = 'lg',
  variant,
  className,
}: AuthModalCtaButtonProps) {
  return (
    <AuthModalTrigger intent={intent} asChild>
      <Button
        size={size}
        variant={variant}
        className={cn('h-11 rounded-full px-6', className)}
      >
        {label}
      </Button>
    </AuthModalTrigger>
  )
}
