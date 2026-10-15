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
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useIsMobile } from '@/hooks/use-mobile'
import { isTouchPrimary } from '@/lib/touch'
import { cn } from '@/lib/utils'

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
 * 触屏手机从底部升起（手机操作习惯第 1 条，owner 2026-10-15）：两颗通栏大键，确认在上。
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
  const [sheetOpen, setSheetOpen] = useState(false)
  const isMobile = useIsMobile()

  const phraseField =
    confirmPhrase !== undefined ? (
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
    ) : null

  if (isMobile && isTouchPrimary()) {
    return (
      <Drawer
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setTyped('')
        }}
      >
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <div
            className="flex flex-col gap-4 px-5 pt-4"
            style={{
              paddingBottom:
                'max(var(--keyboard-safe-area-bottom, 0px), 1.25rem)',
            }}
          >
            <div className="flex flex-col gap-1.5">
              <DrawerTitle className="text-lg">{title}</DrawerTitle>
              <DrawerDescription className="text-base">
                {description}
              </DrawerDescription>
            </div>
            {phraseField}
            <div className="flex flex-col gap-2">
              <Button
                disabled={!phraseMatched}
                className={cn(
                  'h-12 rounded-full text-base',
                  variant === 'destructive' &&
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                )}
                onClick={() => {
                  setSheetOpen(false)
                  setTyped('')
                  onConfirm()
                }}
              >
                {confirmLabel}
              </Button>
              <Button
                variant="ghost"
                className="h-12 rounded-full text-base"
                onClick={() => {
                  setSheetOpen(false)
                  setTyped('')
                }}
              >
                {cancelLabel}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

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
        {phraseField}
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
