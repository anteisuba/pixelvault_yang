'use client'

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cn } from '@/lib/utils'

interface AssistantShellHeaderProps {
  title: string
  subtitle?: string
  leading?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Shared chrome for all assistant rails. Business-specific controls stay in actions. */
export function AssistantShellHeader({
  title,
  subtitle,
  leading,
  actions,
  className,
}: AssistantShellHeaderProps) {
  return (
    <header
      data-assistant-shell-header
      className={cn(
        'flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-2xs font-medium text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-0.5 lg:gap-1">
          {actions}
        </div>
      ) : null}
    </header>
  )
}

interface AssistantShellProps extends Omit<
  ComponentPropsWithoutRef<'aside'>,
  'children' | 'className'
> {
  children: ReactNode
  className?: string
  label?: string
}

/** Shared semantic frame for assistant surfaces that need a complementary rail. */
export const AssistantShell = forwardRef<HTMLElement, AssistantShellProps>(
  function AssistantShell(
    { children, className, label, 'aria-label': ariaLabel, ...props },
    ref,
  ) {
    return (
      <aside
        {...props}
        ref={ref}
        role="complementary"
        aria-label={label ?? ariaLabel}
        data-assistant-shell
        className={cn('flex min-h-0 flex-col overflow-hidden', className)}
      >
        {children}
      </aside>
    )
  },
)
