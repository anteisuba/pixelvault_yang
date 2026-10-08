'use client'

import { useState } from 'react'
import { Copy } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { COPIED_ACK_MS } from '@/constants/motion'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  FeedbackButton,
  useButtonFeedback,
} from '@/components/ui/feedback-button'
import { Textarea } from '@/components/ui/textarea'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { cn } from '@/lib/utils'

interface CopyPromptButtonProps {
  prompt: string
  className?: string
  /** 键上那几个字（缺省「复制 Prompt」）。 */
  label?: string
}

/**
 * 复制提示词。复制成功只在键上说：键拉长变黑写「已复制」1.2 秒再缩回
 * （提示词页 A · owner 2026-10-08「提示与弹窗」第 1 题 B），⛔ 弹 toast。
 * 剪贴板被拒时退回一个可全选的文本框。
 */
export function CopyPromptButton({
  prompt,
  className,
  label,
}: CopyPromptButtonProps) {
  const t = useTranslations('PromptLibrary')
  const [manualOpen, setManualOpen] = useState(false)
  const copied = useButtonFeedback(COPIED_ACK_MS)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      copied.show({ label: t('promptCopied') })
    } catch {
      setManualOpen(true)
    }
  }

  return (
    <>
      <FeedbackButton
        feedback={copied.feedback}
        className={cn(buttonVariants({ variant: 'outline' }), className)}
        onClick={() => void handleCopy()}
      >
        <Copy className="size-4" />
        {label ?? t('copyPrompt')}
      </FeedbackButton>
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
            aria-label={t('createPromptLabel')}
            value={prompt}
            readOnly
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-48"
          />
          <Button onClick={() => setManualOpen(false)}>
            {t('closeAction')}
          </Button>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )
}
