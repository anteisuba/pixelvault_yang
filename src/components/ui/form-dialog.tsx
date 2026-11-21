'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

interface FormDialogProps extends Omit<
  React.ComponentProps<typeof ResponsiveDialogContent>,
  'title'
> {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 标题 = 这一步要做的事（ui-spec §9）。 */
  title: React.ReactNode
  /** 读屏用的一句说明（看不见）——ui-spec §9 ⛔ 标题下面一段解释。 */
  description?: React.ReactNode
}

/**
 * 表单 / 确认类弹框的唯一外壳（ui-spec §9「弹窗」）：桌面居中 420 宽、圆角 18、
 * 内边距 20、标题 15/600、底栏右对齐「取消 + 主键」；手机（< 768）同一份内容
 * 落成底部抽屉（ui-defaults 移动端配方）。
 *
 * ⛔ 调用方不再各写 `max-w-*` / 标题字号；要拣东西的走 `library-picker`，看大图的走
 * `ImagePreviewDialog`。
 */
function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
  ...contentProps
}: FormDialogProps) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className={cn('md:max-w-105', className)}
        {...contentProps}
      >
        <ResponsiveDialogHeader className="p-0 text-left">
          <ResponsiveDialogTitle className="text-md leading-snug font-semibold">
            {title}
          </ResponsiveDialogTitle>
          {description ? (
            <ResponsiveDialogDescription className="sr-only">
              {description}
            </ResponsiveDialogDescription>
          ) : null}
        </ResponsiveDialogHeader>
        <div className="flex min-w-0 flex-col gap-4 pt-4 md:pt-0">
          {children}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

/** 底栏：右对齐「取消 + 主键」；手机竖排、主键在上。 */
function FormDialogActions({
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  confirmTestId,
}: {
  cancelLabel: string
  onCancel: () => void
  confirmLabel: string
  onConfirm: () => void
  confirmDisabled?: boolean
  confirmTestId?: string
}) {
  return (
    <ResponsiveDialogFooter className="mt-0 flex-col-reverse gap-2 p-0 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        type="button"
        data-testid={confirmTestId}
        disabled={confirmDisabled}
        onClick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </ResponsiveDialogFooter>
  )
}

export { FormDialog, FormDialogActions }
