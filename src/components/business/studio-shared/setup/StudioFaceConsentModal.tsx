'use client'

import { memo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface StudioFaceConsentModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const StudioFaceConsentModal = memo(function StudioFaceConsentModal({
  open,
  onConfirm,
  onCancel,
}: StudioFaceConsentModalProps) {
  const t = useTranslations('Transform.faceConsent')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button onClick={onConfirm}>{t('confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
