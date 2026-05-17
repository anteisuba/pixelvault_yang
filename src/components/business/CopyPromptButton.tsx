'use client'

import { Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface CopyPromptButtonProps {
  prompt: string
}

export function CopyPromptButton({ prompt }: CopyPromptButtonProps) {
  const t = useTranslations('PromptLibrary')

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt)
    toast.success(t('promptCopied'))
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full rounded-full"
      onClick={() => void handleCopy()}
    >
      <Copy className="size-4" />
      {t('copyPrompt')}
    </Button>
  )
}
