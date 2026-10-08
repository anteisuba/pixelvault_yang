'use client'

import type { ReactNode } from 'react'

import { Check } from '@/components/icons'
import { BlurSwap } from '@/components/ui/blur-swap'
import { Spinner } from '@/components/ui/spinner'

export type AuthButtonState = 'idle' | 'pending' | 'done'

/**
 * 卡上的黑键「继续」：字糊成转圈（+「发送中」），再糊成 ✓（owner 2026-10-08 登录注册
 * 原型）。宽度是整行，换内容不跳；读屏读 `aria-busy` 与原来的字。
 */
export function AuthSubmitButton({
  state,
  children,
  pendingLabel,
  disabled,
}: {
  state: AuthButtonState
  children: ReactNode
  /** 转圈旁边那几个字（「发送中」）。 */
  pendingLabel: string
  disabled?: boolean
}) {
  return (
    <button
      type="submit"
      className="auth-primary auth-primary-own"
      disabled={disabled || state !== 'idle'}
      aria-busy={state === 'pending' || undefined}
      data-state={state}
    >
      <BlurSwap swapKey={state}>
        {state === 'pending' ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner size="sm" aria-hidden />
            {pendingLabel}
          </span>
        ) : state === 'done' ? (
          <>
            <Check className="size-4" aria-hidden />
            <span className="sr-only">{children}</span>
          </>
        ) : (
          children
        )}
      </BlurSwap>
    </button>
  )
}
