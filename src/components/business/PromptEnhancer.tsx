'use client'

import type { PromptEnhanceStyle } from '@/constants/config'

import { PromptEnhanceButton } from '@/components/business/PromptEnhanceButton'
import { PromptComparisonPanel } from '@/components/business/PromptComparisonPanel'

interface PromptEnhancerProps {
  prompt: string
  isEnhancing: boolean
  disabled: boolean
  enhanced: string | null
  enhancedOriginal: string | null
  enhancedStyle: PromptEnhanceStyle | null
  onEnhance: (style: PromptEnhanceStyle) => void
  onUseEnhanced: (text: string) => void
  onDismiss: () => void
}

/**
 * Unified prompt enhancement module combining the enhance button
 * and comparison panel with consistent null handling.
 * Used in GenerateForm and VideoGenerateForm.
 */
export function PromptEnhancer({
  prompt,
  isEnhancing,
  disabled,
  enhanced,
  enhancedOriginal,
  enhancedStyle,
  onEnhance,
  onUseEnhanced,
  onDismiss,
}: PromptEnhancerProps) {
  return (
    <>
      <PromptEnhanceButton
        prompt={prompt}
        isEnhancing={isEnhancing}
        disabled={disabled}
        onEnhance={onEnhance}
      />

      {enhanced && enhancedOriginal && enhancedStyle && (
        <div className="mt-3">
          <PromptComparisonPanel
            original={enhancedOriginal}
            enhanced={enhanced}
            style={enhancedStyle}
            onUseEnhanced={onUseEnhanced}
            onDismiss={onDismiss}
          />
        </div>
      )}
    </>
  )
}
