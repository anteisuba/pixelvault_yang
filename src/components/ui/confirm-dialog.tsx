'use client'

import { useId, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'

interface ConfirmDialogProps {
  trigger: React.ReactNode
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  onConfirm: () => void
  variant?: 'destructive' | 'default'
  /**
   * 要先打一遍这几个字，确认键才能按（owner 2026-10-08：注销账号要输入「注销」）。
   * 不给 = 不用打字。
   */
  confirmPhrase?: string
  /** 输入框上那句说明（「输入「注销」确认」）。给了 `confirmPhrase` 就必须给。 */
  confirmPhraseLabel?: string
}

/**
 * 删了找不回的大事（删密钥、删项目、注销账号）用的正中弹窗（owner 2026-10-08
 * 「提示与弹窗」第 2 题 A）：从按下的那颗键长到正中（`AlertDialogContent` 自带），
 * 写清后果。能撤销的小删除 ⛔ 不用它 —— 走 `ConfirmDeleteButton`。
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  variant = 'destructive',
  confirmPhrase,
  confirmPhraseLabel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const phraseMatched =
    confirmPhrase === undefined || typed.trim() === confirmPhrase

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) setTyped('')
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmPhrase !== undefined ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-2sm text-muted-foreground">
              {confirmPhraseLabel}
            </label>
            <Input
              id={inputId}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!phraseMatched}
            className={
              variant === 'destructive'
                ? 'rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'rounded-full'
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
