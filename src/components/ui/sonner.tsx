'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    // ⚠ 顶部居中：右上角住着助手头像开关与面板头部，toast 放那儿会压住它们（2026-09-24 真机）。
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'rounded-2xl border-border/75 bg-card text-foreground shadow-lg',
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
