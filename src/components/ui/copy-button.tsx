'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Check, Copy } from '@/components/icons'
import { COPIED_ACK_MS } from '@/constants/motion'
import { Button } from '@/components/ui/button'
import { BlurSwap } from '@/components/ui/blur-swap'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Textarea } from '@/components/ui/textarea'

interface CopyButtonProps {
  /** 要复制的那段字。 */
  text: string
  /** 键的名字（读屏 + 悬停提示），缺省「复制」。 */
  label?: string
  /** `secondary` = 32 的白圆图标键（默认）；`ghost` = 贴在字段右上角那种不带底的。 */
  variant?: 'secondary' | 'ghost'
  className?: string
}

/**
 * 复制（ui-spec.md §9「复制」㉑）：只放复制图标，点了换成勾 1.5 秒再变回；⛔ 另弹提示、
 * ⛔ 键上写字。剪贴板被拒时退回一个可全选的文本框。全站复制都用这一颗。
 */
export function CopyButton({
  text,
  label,
  variant = 'secondary',
  className,
}: CopyButtonProps) {
  const t = useTranslations('Common')
  const [copied, setCopied] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      if (timer.current) clearTimeout(timer.current)
      setCopied(true)
      timer.current = setTimeout(() => {
        timer.current = null
        setCopied(false)
      }, COPIED_ACK_MS)
    } catch {
      setManualOpen(true)
    }
  }

  const name = label ?? t('copy')

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="icon-sm"
        aria-label={copied ? t('copied') : name}
        title={name}
        className={className}
        onClick={() => void handleCopy()}
      >
        <BlurSwap swapKey={copied ? 'copied' : 'idle'}>
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </BlurSwap>
      </Button>
      {/* 结果说给读屏听（`forbidden.md`：状态不只靠颜色与形状）。 */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('copied') : ''}
      </span>
      <ResponsiveDialog open={manualOpen} onOpenChange={setManualOpen}>
        <ResponsiveDialogContent className="sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {t('manualCopyTitle')}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('manualCopyDescription')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <Textarea
            aria-label={name}
            value={text}
            readOnly
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-48"
          />
          <Button onClick={() => setManualOpen(false)}>{t('close')}</Button>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}
