'use client'

import { useTranslations } from 'next-intl'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { VoiceTrainer } from '@/components/business/voices/VoiceTrainer'

/**
 * 「克隆音色」框——全仓唯一一份：音色页、挑音色框、画布音色库面板三处都弹它，
 * 里面就是那个 `VoiceTrainer`（⛔ 不另写一套训练界面）。手机落成底部抽屉。
 */
export function VoiceCloneDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 克隆成功：调用方刷新自己的列表；框由调用方关。 */
  onCreated: () => void
}) {
  const t = useTranslations('VoicesPage')
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-xl">
        <ResponsiveDialogTitle>{t('clone')}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          {t('clone')}
        </ResponsiveDialogDescription>
        <VoiceTrainer onCreated={onCreated} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
