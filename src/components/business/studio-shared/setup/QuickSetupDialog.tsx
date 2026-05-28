'use client'

import { useState, useCallback, useEffect } from 'react'
import { ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES, getAdapterApiGuide } from '@/constants/providers'
import { createApiKey, deleteApiKey } from '@/lib/api-client'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioFormOptional } from '@/contexts/studio-context'
import { getDefaultProviderConfig } from '@/constants/providers'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
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
  /**
   * Invoked after the key has been created AND verified upstream. Pages that
   * live outside `<StudioProvider>` (e.g. image-edit task pages) should use
   * this to flip their picker selection — the optional Studio dispatch below
   * is a no-op for them since `useStudioFormOptional()` returns null. Studio
   * callers can leave this unset and rely on the dispatch alone.
   */
  onVerified?: (modelId: string, keyId: string) => void
}

type SetupStep = 'guide' | 'verifying' | 'success' | 'error'

/**
 * QuickSetupDialog — guides user to get an API key, verifies it, and
 * auto-selects the model. Flow: show guide link → user pastes key →
 * verify → auto-select model.
 *
 * ── Reuse pattern ─────────────────────────────────────────────────
 *
 * This dialog is the canonical "API key gate" UX (CLAUDE.md Hard Rule
 * #8). Any UI element that depends on a provider key MUST route the
 * no-key click through this dialog instead of going disabled. The
 * pattern is the same everywhere:
 *
 *   const [quickSetup, setQuickSetup] = useState<{
 *     open: boolean
 *     adapterType: AI_ADAPTER_TYPES
 *     modelId: string
 *     modelLabel: string
 *   } | null>(null)
 *
 *   <button
 *     onClick={() => {
 *       if (hasReplicateKey) {
 *         // ...normal action when key is present
 *       } else {
 *         setQuickSetup({
 *           open: true,
 *           adapterType: AI_ADAPTER_TYPES.REPLICATE,
 *           modelId: AI_MODELS.ILLUSTRIOUS_XL, // any image model on that adapter
 *           modelLabel: 'Replicate',
 *         })
 *       }
 *     }}
 *   >
 *     Replicate {!hasReplicateKey && <span>{t('configureApiKey')}</span>}
 *   </button>
 *
 *   {quickSetup && (
 *     <QuickSetupDialog
 *       open={quickSetup.open}
 *       onOpenChange={(open) =>
 *         setQuickSetup((prev) => (prev ? { ...prev, open } : prev))
 *       }
 *       modelId={quickSetup.modelId}
 *       modelLabel={quickSetup.modelLabel}
 *       adapterType={quickSetup.adapterType}
 *       optionId={`workspace:${quickSetup.modelId}`}
 *     />
 *   )}
 *
 * Notes for non-Studio callers: pass `onVerified` to receive the
 * (modelId, keyId) of the freshly-created key — this is the hook image-edit
 * task pages use to flip their picker selection. The Studio dispatch above
 * is a no-op there (the optional hook returns null outside the provider),
 * so non-Studio pages won't get spurious selection changes.
 *
 * Live consumers:
 * - `StudioLoraChip` — "switch to X" recommended-model button (Studio)
 * - `LoraTrainingForm` — Replicate / fal.ai provider buttons (Studio)
 * - `StudioPromptArea` — main model picker capsule (Studio)
 * - `EditTaskHeader` — image-edit task picker (non-Studio, uses onVerified)
 */
export function QuickSetupDialog({
  open,
  onOpenChange,
  modelId,
  modelLabel,
  adapterType,
  optionId,
  onVerified,
}: QuickSetupDialogProps) {
  const [labelValue, setLabelValue] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [step, setStep] = useState<SetupStep>('guide')
  const [errorMsg, setErrorMsg] = useState('')
  const { refresh, verify } = useApiKeysContext()
  // Optional so we don't crash on pages without StudioProvider (e.g.
  // /studio/lora — LoraTrainingForm shows this dialog from its provider
  // buttons). If null, we skip the auto-select dispatch; the page that
  // doesn't have the Studio form context doesn't care which model was
  // auto-picked anyway.
  const studioForm = useStudioFormOptional()
  const t = useTranslations('QuickSetup')

  const guide = getAdapterApiGuide(adapterType)
  const providerConfig = getDefaultProviderConfig(adapterType)

  // Prefill the label with the model name so a user who doesn't care about
  // naming can just paste the key and click Verify. Reset every time the
  // dialog opens for a new model. Syncing local state to an `open` prop is
  // exactly the case React's set-state-in-effect rule disallows, but the
  // alternative (forcing the parent to key= the dialog on modelId) leaks
  // an implementation detail just to suppress a lint rule.
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

    // Step 1: persist the key. createApiKey only stores it — the actual
    // upstream check happens in step 2.
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

    // Step 2: actually hit the provider to check the key works. Only flip
    // to "available" (green dot) once this passes — saving a bad key used
    // to leave the dot green until the next generation failed.
    const status = await verify(keyId)
    if (status !== 'available') {
      // Roll back the stored key so the user doesn't end up with a dud
      // route taking up a slot in the picker.
      await deleteApiKey(keyId)
      await refresh()
      setStep('error')
      setErrorMsg(t('verifyFailed'))
      return
    }

    await refresh()
    setStep('success')
    // Auto-select the newly created key's model option (only when we're
    // inside a Studio provider tree — see useStudioFormOptional above).
    // The saved route option ID format is `saved:<keyId>`.
    studioForm?.dispatch({
      type: 'SET_OPTION_ID',
      payload: `saved:${keyId}`,
    })
    void optionId
    onVerified?.(modelId, keyId)
    setTimeout(() => {
      onOpenChange(false)
      setStep('guide')
      setKeyValue('')
      setLabelValue('')
    }, 1500)
  }, [
    keyValue,
    labelValue,
    modelLabel,
    adapterType,
    providerConfig,
    modelId,
    optionId,
    refresh,
    verify,
    studioForm,
    onOpenChange,
    onVerified,
    t,
  ])

  const handleClose = (v: boolean) => {
    if (!v) {
      setStep('guide')
      setKeyValue('')
      setLabelValue('')
      setErrorMsg('')
    }
    onOpenChange(v)
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={handleClose}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="font-display">
            {t('title', { model: modelLabel })}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

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

          {/* Step 3: Custom label so the user can distinguish multiple keys
              that share the same provider (e.g. a personal + a work Gemini
              account). Defaults to the model name. */}
          <div className="space-y-2">
            <label htmlFor="quick-setup-label" className="text-sm font-medium">
              {t('step3')}
            </label>
            <input
              id="quick-setup-label"
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
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
