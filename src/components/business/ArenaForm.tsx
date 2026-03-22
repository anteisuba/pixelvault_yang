'use client'

import { useState } from 'react'
import { Loader2, Swords } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  DEFAULT_ASPECT_RATIO,
  GENERATION_LIMITS,
  type AspectRatio,
} from '@/constants/config'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ArenaFormProps {
  isCreating: boolean
  onBattle: (prompt: string, aspectRatio: AspectRatio) => void
}

export function ArenaForm({ isCreating, onBattle }: ArenaFormProps) {
  const t = useTranslations('ArenaPage')
  const [prompt, setPrompt] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (prompt.trim()) {
      onBattle(prompt, DEFAULT_ASPECT_RATIO)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="arena-prompt"
          className="text-sm font-semibold text-foreground"
        >
          {t('promptLabel')}
        </label>
        <Textarea
          id="arena-prompt"
          placeholder={t('promptPlaceholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={GENERATION_LIMITS.PROMPT_MAX_LENGTH}
          disabled={isCreating}
          className="resize-none rounded-2xl border-border/75 bg-background/72 px-4 py-3 font-serif"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={!prompt.trim() || isCreating}
        className="w-full gap-2 rounded-full"
      >
        {isCreating ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('creating')}
          </>
        ) : (
          <>
            <Swords className="size-4" />
            {t('battleButton')}
          </>
        )}
      </Button>
    </form>
  )
}
