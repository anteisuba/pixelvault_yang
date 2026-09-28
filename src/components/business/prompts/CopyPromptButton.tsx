'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { COPIED_ACK_MS } from '@/constants/motion'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'

interface CopyPromptButtonProps {
  prompt: string
  className?: string
  /** 键上那几个字（缺省「复制 Prompt」）。 */
  label?: string
  /**
   * 提示词页 A（pages/prompts.md）：复制成功只在键上写「已复制」1.2 秒再回来，
   * ⛔ 弹 toast。缺省沿用旧行为（toast + 一直写着已复制）。
   */
  quiet?: boolean
}

export function CopyPromptButton({
  prompt,
  className,
  label,
  quiet = false,
}: CopyPromptButtonProps) {
  const t = useTranslations('PromptLibrary')
  const [manualOpen, setManualOpen] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPrompt(prompt)
      if (!quiet) {
        toast.success(t('promptCopied'))
        return
      }
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(
        () => setCopiedPrompt(null),
        COPIED_ACK_MS,
      )
    } catch {
      setManualOpen(true)
    }
  }

  const copied = copiedPrompt === prompt

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => void handleCopy()}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t('promptCopied') : (label ?? t('copyPrompt'))}
      </Button>
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
