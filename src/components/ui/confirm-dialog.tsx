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

interface ConfirmDialogProps {
  /** 不给 = 受控弹出（`open` / `onOpenChange`），比如长按菜单里点「删除」之后。 */
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
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
  /** 关窗后焦点落哪（桌面弹窗）：删掉的那一项本来是焦点的去处时由调用方接走。 */
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * 删东西一律用的居中小弹窗（ui-spec.md §9「删除确认」㉒，哪怕素材里选几张删）：
 * 标题「删除这 2 张？」+ 一句后果「删了就找不回来了。」+ 取消 / 红色删除，宽 340；
 * 从按下的那颗键长到正中（`AlertDialogContent` 自带）。⛔ 浏览器 confirm、⛔ 键上两步。
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
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const phraseMatched =
    confirmPhrase === undefined || typed.trim() === confirmPhrase
  const [innerOpen, setInnerOpen] = useState(false)
  const sheetOpen = openProp ?? innerOpen
  const setSheetOpen = (next: boolean) => {
    if (openProp === undefined) setInnerOpen(next)
    onOpenChange?.(next)
  }
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
        {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
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
                variant={variant}
                className="h-12 text-base"
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
                className="h-12 text-base"
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
      open={sheetOpen}
      onOpenChange={(open) => {
        setSheetOpen(open)
        if (!open) setTyped('')
      }}
    >
      {trigger ? (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      ) : null}
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {phraseField}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!phraseMatched}
            variant={variant}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
