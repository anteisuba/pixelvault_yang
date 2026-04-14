'use client'

import { useState, useCallback } from 'react'
import { ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES, getAdapterApiGuide } from '@/constants/providers'
import { createApiKey } from '@/lib/api-client'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioForm } from '@/contexts/studio-context'
import { getDefaultProviderConfig } from '@/constants/providers'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface QuickSetupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Model ID that triggered the setup */
  modelId: string
  /** Display name of the model */
  modelLabel: string
  /** Adapter type determines which provider guide to show */
  adapterType: AI_ADAPTER_TYPES
  /** Option ID to auto-select after key creation */
  optionId: string
}

type SetupStep = 'guide' | 'verifying' | 'success' | 'error'

/**
 * QuickSetupDialog — guides user to get an API key, verifies it, and auto-selects the model.
 * Flow: show guide link → user pastes key → verify → auto-select model.
 */
export function QuickSetupDialog({
  open,
  onOpenChange,
  modelId,
  modelLabel,
  adapterType,
  optionId,
}: QuickSetupDialogProps) {
  const [keyValue, setKeyValue] = useState('')
  const [step, setStep] = useState<SetupStep>('guide')
  const [errorMsg, setErrorMsg] = useState('')
  const { refresh } = useApiKeysContext()
  const { dispatch } = useStudioForm()
  const t = useTranslations('QuickSetup')

  const guide = getAdapterApiGuide(adapterType)
  const providerConfig = getDefaultProviderConfig(adapterType)

  const handleVerify = useCallback(async () => {
    if (keyValue.trim().length < 10) return
    setStep('verifying')
    setErrorMsg('')

    const result = await createApiKey({
      adapterType,
      providerConfig,
      modelId,
      label: `${providerConfig.label} (Quick Setup)`,
      keyValue: keyValue.trim(),
    })

    if (result.success) {
      setStep('success')
      await refresh()
      // Auto-select the newly created key's model option
      // The saved route option ID format is `saved:<keyId>`
      if (result.data?.id) {
        dispatch({
          type: 'SET_OPTION_ID',
          payload: `saved:${result.data.id}`,
        })
      } else {
        dispatch({ type: 'SET_OPTION_ID', payload: optionId })
      }
      // Auto-close after short delay
      setTimeout(() => {
        onOpenChange(false)
        setStep('guide')
        setKeyValue('')
      }, 1500)
    } else {
      setStep('error')
      setErrorMsg(result.error ?? t('verifyFailed'))
    }
  }, [
    keyValue,
    adapterType,
    providerConfig,
    modelId,
    optionId,
    refresh,
    dispatch,
    onOpenChange,
    t,
  ])

  const handleClose = (v: boolean) => {
    if (!v) {
      setStep('guide')
      setKeyValue('')
      setErrorMsg('')
    }
    onOpenChange(v)
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
          {/* Step 1: Guide */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
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

          {/* Step 2: Input key */}
          <div className="space-y-2">
            <label htmlFor="quick-setup-key" className="text-sm font-medium">
              {t('step2')}
            </label>
            <input
              id="quick-setup-key"
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

          {/* Error message */}
          {step === 'error' && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success message */}
          {step === 'success' && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{t('success')}</span>
            </div>
          )}

          {/* Verify button */}
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
                : 'bg-muted text-muted-foreground cursor-not-allowed',
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
