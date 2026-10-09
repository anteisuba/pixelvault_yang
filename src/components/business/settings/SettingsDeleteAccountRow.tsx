'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { useDeleteAccount } from '@/hooks/use-delete-account'

import { buttonVariants } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FeedbackButton } from '@/components/ui/feedback-button'
import { cn } from '@/lib/utils'

/**
 * 偏好分区最底那一行「注销账号」（owner 2026-10-08「提示与弹窗」：删了找不回的大事）。
 *
 * 点了从键长到正中的 `ConfirmDialog`，写清后果、要先打一遍「注销」才能按；
 * 确认后键里转圈写「正在注销」，删完退出登录回首页。没删成：键缩回，
 * 行下面一行红字说原因，可以再点一次。
 */
export function SettingsDeleteAccountRow() {
  const t = useTranslations('Settings.deleteAccount')
  const { deleteAccount, isDeleting } = useDeleteAccount()
  const [failed, setFailed] = useState(false)

  const confirm = async () => {
    setFailed(false)
    const ok = await deleteAccount()
    if (!ok) setFailed(true)
  }

  return (
    <div className="flex min-h-11 flex-col gap-1.5 border-t border-border py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <span>{t('row')}</span>
          <span className="text-xs text-muted-foreground">{t('rowHint')}</span>
        </span>
        <ConfirmDialog
          trigger={
            <FeedbackButton
              disabled={isDeleting}
              feedback={
                isDeleting ? { label: t('deleting'), tone: 'progress' } : null
              }
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-100 coarse:h-11',
              )}
            >
              {t('trigger')}
            </FeedbackButton>
          }
          title={t('title')}
          description={t('description')}
          cancelLabel={t('cancel')}
          confirmLabel={t('confirm')}
          confirmPhrase={t('phrase')}
          confirmPhraseLabel={t('phraseLabel', { phrase: t('phrase') })}
          onConfirm={() => void confirm()}
        />
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          {t('failed')}
        </p>
      ) : null}
    </div>
  )
}
