'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  getAdapterApiGuide,
  getDefaultProviderConfig,
  type AI_ADAPTER_TYPES,
} from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { createApiKey, deleteApiKey } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EditQuickSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Model ID that triggered the setup (also stored on the persisted key) */
  modelId: string
  /** Display name shown in the title */
  modelLabel: string
  /** Adapter the new key belongs to */
  adapterType: AI_ADAPTER_TYPES
  /**
   * Invoked after the key has been created AND verified upstream. Use this to
   * flip the picker selection to {@link modelId}. We intentionally don't
   * couple to Studio's reducer the way `QuickSetupDialog` does, since the
   * image-edit task pages live outside `<StudioProvider>`.
   */
  onVerified?: (modelId: string) => void
}

type SetupStep = 'guide' | 'verifying' | 'success' | 'error'

/**
 * Same flow as {@link QuickSetupDialog} (guide link → paste → verify →
 * activate) but with no dependency on Studio context. Used by image-edit task
 * pages to prompt the user for a Gemini/OpenAI key when the picker hits a
 * model whose provider they haven't configured.
 */
export function EditQuickSetupDialog({
  open,
  onOpenChange,
  modelId,
  modelLabel,
  adapterType,
  onVerified,
}: EditQuickSetupDialogProps) {
  const t = useTranslations('QuickSetup')
  const { refresh, verify } = useApiKeysContext()
  const [labelValue, setLabelValue] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [step, setStep] = useState<SetupStep>('guide')
  const [errorMsg, setErrorMsg] = useState('')

  const guide = getAdapterApiGuide(adapterType)
  const providerConfig = getDefaultProviderConfig(adapterType)

  // Prefill the label with the model name so users who don't care about
  // naming can paste + verify in one flow. Reset every time the dialog opens
  // for a different model.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabelValue(modelLabel)
  }, [open, modelLabel])

  const handleVerify = useCallback(async () => {
    if (keyValue.trim().length < 10) return
    const finalLabel = labelValue.trim() || modelLabel
    setStep('verifying')
    setErrorMsg('')

    const created = await createApiKey({
      adapterType,
      providerConfig,
      modelId,
      label: finalLabel,
      keyValue: keyValue.trim(),
    })

    if (!created.success || !created.data?.id) {
      setStep('error')
      setErrorMsg(created.error ?? t('verifyFailed'))
      return
    }

    const keyId = created.data.id
    const status = await verify(keyId)
    if (status !== 'available') {
      await deleteApiKey(keyId)
      await refresh()
      setStep('error')
      setErrorMsg(t('verifyFailed'))
      return
    }

    await refresh()
    setStep('success')
    onVerified?.(modelId)
    setTimeout(() => {
      onOpenChange(false)
      setStep('guide')
      setKeyValue('')
      setLabelValue('')
    }, 1500)
  }, [
    adapterType,
    keyValue,
    labelValue,
    modelId,
    modelLabel,
    onOpenChange,
    onVerified,
    providerConfig,
    refresh,
    t,
    verify,
  ])

  const handleClose = (next: boolean) => {
    if (!next) {
      setStep('guide')
      setKeyValue('')
      setLabelValue('')
      setErrorMsg('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('title', { model: modelLabel })}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-sm font-medium">{t('step1')}</p>
            <a
              href={guide.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {providerConfig.label}
              <ExternalLink className="size-3.5" />
            </a>
            <p className="text-2xs text-muted-foreground">{guide.steps}</p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="edit-quick-setup-key"
              className="text-sm font-medium"
            >
              {t('step2')}
            </label>
            <input
              id="edit-quick-setup-key"
              type="password"
              value={keyValue}
              onChange={(e) => {
                setKeyValue(e.target.value)
                if (step === 'error') setStep('guide')
              }}
              placeholder={t('keyPlaceholder')}
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
              disabled={step === 'verifying' || step === 'success'}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="edit-quick-setup-label"
              className="text-sm font-medium"
            >
              {t('step3')}
            </label>
            <input
              id="edit-quick-setup-label"
              type="text"
              value={labelValue}
              onChange={(e) => {
                setLabelValue(e.target.value)
                if (step === 'error') setStep('guide')
              }}
              placeholder={t('labelPlaceholder')}
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
              disabled={step === 'verifying' || step === 'success'}
              maxLength={64}
            />
            <p className="text-2xs text-muted-foreground/70">
              {t('labelHint')}
            </p>
          </div>

          {step === 'error' && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {step === 'success' && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{t('success')}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={
              keyValue.trim().length < 10 ||
              step === 'verifying' ||
              step === 'success'
            }
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
              keyValue.trim().length >= 10 &&
                step !== 'verifying' &&
                step !== 'success'
                ? 'bg-primary text-primary-foreground hover:shadow-md active:scale-[0.97]'
                : 'cursor-not-allowed bg-muted text-muted-foreground',
            )}
          >
            {step === 'verifying' ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('verifying')}
              </>
            ) : step === 'success' ? (
              <>
                <CheckCircle2 className="size-4" />
                {t('success')}
              </>
            ) : (
              t('verify')
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
