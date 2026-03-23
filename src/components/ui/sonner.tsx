'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'rounded-2xl border-border/75 bg-card text-foreground font-serif shadow-lg',
          title: 'text-sm font-medium',
          description: 'text-xs text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-full',
          cancelButton: 'bg-muted text-muted-foreground rounded-full',
          error: 'border-destructive/30 text-destructive',
          success: 'border-chart-2/30',
        },
      }}
    />
  )
}
