'use client'

import { Loader2, MessageCircle, X, ArrowRight, Lightbulb } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import type { PromptFeedbackResponseData } from '@/types'
import { cn } from '@/lib/utils'

interface PromptFeedbackButtonProps {
  prompt: string
  isLoading: boolean
  disabled: boolean
  onRequest: () => void
}

export function PromptFeedbackButton({
  prompt,
  isLoading,
  disabled,
  onRequest,
}: PromptFeedbackButtonProps) {
  const t = useTranslations('PromptFeedback')

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled || isLoading || !prompt.trim()}
      onClick={onRequest}
      className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
    >
      {isLoading ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          {t('loading')}
        </>
      ) : (
        <>
          <MessageCircle className="size-3" />
          {t('button')}
        </>
      )}
    </Button>
  )
}

interface PromptFeedbackPanelProps {
  feedback: PromptFeedbackResponseData
  onApplyImproved: (prompt: string) => void
  onDismiss: () => void
}

export function PromptFeedbackPanel({
  feedback,
  onApplyImproved,
  onDismiss,
}: PromptFeedbackPanelProps) {
  const t = useTranslations('PromptFeedback')

  return (
    <div className="animate-in fade-in-0 slide-in-from-top-2 mt-3 rounded-2xl border border-primary/20 bg-primary/3 p-4 duration-300">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h4>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Overall assessment */}
      <p className="mb-3 font-serif text-sm leading-6 text-foreground/80">
        {feedback.overallAssessment}
      </p>

      {/* Suggestions */}
      <div className="space-y-2">
        {feedback.suggestions.map((s, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/40 bg-background/60 p-3"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {s.category}
              </span>
            </div>
            <p className="text-sm text-foreground/80">{s.suggestion}</p>
            {s.example && (
              <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 font-mono text-xs text-foreground/70">
                {s.example}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Improved prompt */}
      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
          {t('improvedPrompt')}
        </p>
        <p className="font-serif text-sm leading-6 text-foreground/80">
          {feedback.improvedPrompt}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onApplyImproved(feedback.improvedPrompt)}
          className={cn(
            'mt-2 h-7 gap-1.5 rounded-full border-emerald-500/30 px-3 text-xs',
            'text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800',
          )}
        >
          <ArrowRight className="size-3" />
          {t('applyImproved')}
        </Button>
      </div>
    </div>
  )
}
