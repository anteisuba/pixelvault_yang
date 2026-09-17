'use client'

import { useState } from 'react'
import { Check, Copy } from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

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
}

export function CopyPromptButton({ prompt, className }: CopyPromptButtonProps) {
  const t = useTranslations('PromptLibrary')
  const [manualOpen, setManualOpen] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiedPrompt(prompt)
      toast.success(t('promptCopied'))
    } catch {
      setManualOpen(true)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => void handleCopy()}
      >
        {copiedPrompt === prompt ? (
          <Check className="size-4" />
        ) : (
          <Copy className="size-4" />
        )}
        {copiedPrompt === prompt ? t('promptCopied') : t('copyPrompt')}
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
