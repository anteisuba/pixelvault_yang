'use client'

import { useState } from 'react'
import { Gift, ImageIcon, Film } from 'lucide-react'
import { useTranslations } from 'next-intl'

import dynamic from 'next/dynamic'

import { GenerateForm } from '@/components/business/GenerateForm'
import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'

const VideoGenerateForm = dynamic(
  () => import('@/components/business/VideoGenerateForm'),
)
import { useOnboarding } from '@/hooks/use-onboarding'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { cn } from '@/lib/utils'

type StudioMode = 'image' | 'video'

export function StudioWorkspace() {
  const [mode, setMode] = useState<StudioMode>('image')
  const t = useTranslations('StudioPage')
  const onboarding = useOnboarding()
  const { summary } = useUsageSummary()
  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  return (
    <div className="space-y-6">
      {/* Mode switch + free quota */}
      <div className="flex items-center justify-between">
        {/* Free tier quota indicator */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gift className="size-3.5 text-chart-3" />
          <span className="font-serif">
            {t('freeQuota', {
              remaining: Math.max(0, freeRemaining),
              limit: summary.freeGenerationLimit,
            })}
          </span>
          {freeRemaining <= 1 && freeRemaining >= 0 && (
            <span className="text-primary">·</span>
          )}
          {freeRemaining <= 1 && freeRemaining >= 0 && (
            <span className="font-serif text-primary/80">
              {t('freeQuotaLow')}
            </span>
          )}
        </div>
      </div>
      <div role="tablist" aria-label={t('modeLabel')} className="flex gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'image' ? 'true' : 'false'}
          onClick={() => setMode('image')}
          className={cn(
            'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
            mode === 'image'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <ImageIcon className="size-4" />
          {t('modeImage')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'video' ? 'true' : 'false'}
          onClick={() => setMode('video')}
          className={cn(
            'flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
            mode === 'video'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <Film className="size-4" />
          {t('modeVideo')}
        </button>
      </div>

      {/* Form area */}
      {mode === 'image' ? <GenerateForm /> : <VideoGenerateForm />}

      {/* Onboarding tooltip */}
      <OnboardingTooltip
        active={onboarding.active}
        step={onboarding.currentStep}
        stepIndex={onboarding.currentIndex}
        totalSteps={onboarding.totalSteps}
        isLastStep={onboarding.isLastStep}
        isSkippable={onboarding.isSkippable}
        onNext={onboarding.next}
        onSkip={onboarding.skip}
        onDismiss={onboarding.dismiss}
      />
    </div>
  )
}
