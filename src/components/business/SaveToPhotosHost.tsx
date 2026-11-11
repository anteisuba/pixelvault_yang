'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { shareFile, subscribeSaveToPhotosTap } from '@/lib/save-to-photos'

/**
 * iPhone 上取字节太久、分享面板被 WebKit 以「没有手势」拒掉时的第二步：
 * 一条带「存到相册」键的提示，点一下重新弹面板。挂在 `(main)/layout.tsx`。
 */
export function SaveToPhotosHost() {
  const t = useTranslations('Toasts')

  useEffect(
    () =>
      subscribeSaveToPhotosTap((file) => {
        toast(t('saveToPhotosReady'), {
          duration: 15_000,
          action: {
            label: t('saveToPhotos'),
            onClick: () => void shareFile(file),
          },
        })
      }),
    [t],
  )

  return null
}
