'use client'

import { useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { PROMPT_ENHANCE, type PromptEnhanceStyle } from '@/constants/config'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PromptEnhanceButtonProps {
  prompt: string
  isEnhancing: boolean
  disabled: boolean
  onEnhance: (style: PromptEnhanceStyle) => void
}

const STYLE_ICONS: Record<PromptEnhanceStyle, string> = {
  detailed: '🔍',
  artistic: '🎨',
  photorealistic: '📷',
  anime: '✨',
  lora: '🏷️',
}

export function PromptEnhanceButton({
  prompt,
  isEnhancing,
  disabled,
  onEnhance,
}: PromptEnhanceButtonProps) {
  const t = useTranslations('PromptEnhance')
  const [showStyles, setShowStyles] = useState(false)

  const handleStyleSelect = (style: PromptEnhanceStyle) => {
    setShowStyles(false)
    onEnhance(style)
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || isEnhancing || prompt.trim().length === 0}
        onClick={() => setShowStyles((v) => !v)}
        className="gap-1.5 rounded-full border-primary/30 text-xs hover:border-primary hover:bg-primary/5"
      >
        {isEnhancing ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Wand2 className="size-3.5" />
        )}
        {t('button')}
      </Button>

      {showStyles && (
        <div className="absolute top-full z-10 mt-1.5 w-48 rounded-2xl border border-border/75 bg-background p-1.5 shadow-lg">
          {PROMPT_ENHANCE.STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => handleStyleSelect(style)}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                'hover:bg-muted/50',
              )}
            >
              <span>{STYLE_ICONS[style]}</span>
              <div>
                <p className="font-medium text-foreground">
                  {t(`styles.${style}.label`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`styles.${style}.description`)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
