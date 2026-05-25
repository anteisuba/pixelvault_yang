import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface InspectorFieldProps {
  label: string
  children: ReactNode
  statusDotClassName?: string
  className?: string
}

export function InspectorField({
  label,
  children,
  statusDotClassName,
  className,
}: InspectorFieldProps) {
  return (
    <div className={cn('block space-y-2', className)}>
      <span className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
        {statusDotClassName ? (
          <span className={cn('size-1.5 rounded-full', statusDotClassName)} />
        ) : null}
        {label}
      </span>
      {children}
    </div>
  )
}
