'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { OnboardingStep } from '@/constants/onboarding'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface OnboardingTooltipProps {
  active: boolean
  step: OnboardingStep
  stepIndex: number
  totalSteps: number
  isLastStep: boolean
  isSkippable: boolean
  onNext: () => void
  onSkip: () => void
  onDismiss: () => void
}

interface Position {
  top: number
  left: number
  placement: 'top' | 'bottom'
}

function getTargetSelector(step: OnboardingStep): string | null {
  switch (step) {
    case 'welcome':
    case 'quickStart':
      return null // no target, center on screen
    case 'model':
      return '[data-onboarding="model"]'
    case 'prompt':
      return '[data-onboarding="prompt"]'
    case 'apiKey':
      return '[data-onboarding="apiKey"]'
    case 'generate':
      return '[data-onboarding="generate"]'
    default:
      return null
  }
}

function calculatePosition(
  targetEl: Element | null,
  tooltipEl: HTMLDivElement | null,
): Position {
  if (!targetEl || !tooltipEl) {
    // Center on screen for welcome step
    return {
      top: window.innerHeight / 2 - 100,
      left: window.innerWidth / 2 - 180,
      placement: 'bottom',
    }
  }

  const targetRect = targetEl.getBoundingClientRect()
  const tooltipRect = tooltipEl.getBoundingClientRect()

  const spaceBelow = window.innerHeight - targetRect.bottom
  const placement = spaceBelow > tooltipRect.height + 16 ? 'bottom' : 'top'

  // Use viewport-relative coords since tooltip is position: fixed
  let top: number
  if (placement === 'bottom') {
    top = targetRect.bottom + 12
  } else {
    top = targetRect.top - tooltipRect.height - 12
  }

  let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
  // Clamp to viewport
  left = Math.max(
    16,
    Math.min(left, window.innerWidth - tooltipRect.width - 16),
  )

  return { top, left, placement }
}

export function OnboardingTooltip({
  active,
  step,
  stepIndex,
  totalSteps,
  isLastStep,
  isSkippable,
  onNext,
  onSkip,
  onDismiss,
}: OnboardingTooltipProps) {
  const t = useTranslations('Onboarding')
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position>({
    top: 0,
    left: 0,
    placement: 'bottom',
  })
  const [visible, setVisible] = useState(false)

  const updatePosition = useCallback(() => {
    const selector = getTargetSelector(step)
    const targetEl = selector ? document.querySelector(selector) : null
    const pos = calculatePosition(targetEl, tooltipRef.current)
    setPosition(pos)

    // Scroll target into view if needed
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [step])

  useEffect(() => {
    if (!active) return

    // Reset visibility then show after DOM settles
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      updatePosition()
      setVisible(true)
    }, 150)

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      cancelled = true
      clearTimeout(timer)
      setVisible(false)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [active, step, updatePosition])

  if (!active) return null

  return (
    <>
      {/* Subtle backdrop */}
      <div
        className="fixed inset-0 z-40 bg-foreground/8 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onDismiss}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={t(`steps.${step}.title`)}
        className={cn(
          'fixed z-50 w-80 rounded-2xl border border-border/80 bg-card p-5 shadow-lg transition-all duration-300',
          visible
            ? 'translate-y-0 opacity-100'
            : position.placement === 'bottom'
              ? '-translate-y-2 opacity-0'
              : 'translate-y-2 opacity-0',
        )}
        style={{ top: position.top, left: position.left }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t('dismiss')}
        >
          <X className="size-3.5" />
        </button>

        {/* Content */}
        <div className="space-y-2 pr-6">
          <p className="font-display text-sm font-semibold text-foreground">
            {t(`steps.${step}.title`)}
          </p>
          <p className="font-serif text-sm leading-6 text-muted-foreground">
            {t(`steps.${step}.description`)}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  i === stepIndex
                    ? 'bg-primary'
                    : i < stepIndex
                      ? 'bg-primary/40'
                      : 'bg-border',
                )}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isSkippable && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="h-8 rounded-full px-3 text-xs text-muted-foreground"
              >
                {t('skipStep')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={onNext}
              className="h-8 rounded-full px-4 text-xs"
            >
              {isLastStep ? t('finish') : t('next')}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
