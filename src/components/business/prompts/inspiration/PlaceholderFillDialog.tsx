'use client'

import { useMemo, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { isTouchPrimary } from '@/lib/touch'
import {
  applyPlaceholders,
  extractPlaceholders,
} from '@/lib/prompt-placeholders'

interface PlaceholderFillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: string
  /** Called with the final prompt (after substitution) when the user confirms. */
  onApply: (filledPrompt: string) => void
}

const PREVIEW_MAX_CHARS = 600

export function PlaceholderFillDialog({
  open,
  onOpenChange,
  prompt,
  onApply,
}: PlaceholderFillDialogProps) {
  const t = useTranslations('PromptLibrary')
  const placeholders = useMemo(() => extractPlaceholders(prompt), [prompt])
  const [values, setValues] = useState<Record<string, string>>({})

  // Reset inputs whenever the dialog opens with a (potentially new) prompt.
  // Use the "adjust state on prop change" pattern (set during render +
  // tracking key) so we don't trigger a cascading effect render.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [resetKey, setResetKey] = useState<string | null>(null)
  const currentResetKey = open ? prompt : null
  if (currentResetKey !== resetKey) {
    setResetKey(currentResetKey)
    if (currentResetKey != null) setValues({})
  }

  const filledPrompt = useMemo(
    () => applyPlaceholders(prompt, values),
    [prompt, values],
  )

  const previewPrompt =
    filledPrompt.length > PREVIEW_MAX_CHARS
      ? `${filledPrompt.slice(0, PREVIEW_MAX_CHARS).trimEnd()}...`
      : filledPrompt

  const hasFilledAny = placeholders.some(
    (name) => (values[name]?.trim() ?? '') !== '',
  )

  function handleApply() {
    onApply(filledPrompt)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('placeholderTitle')}</DialogTitle>
          <DialogDescription>
            {placeholders.length > 0
              ? t('placeholderDescription', { count: placeholders.length })
              : t('placeholderDescriptionEmpty')}
          </DialogDescription>
        </DialogHeader>

        {placeholders.length > 0 && (
          <div className="space-y-3 py-2">
            {placeholders.map((name) => (
              <div key={name} className="space-y-1.5">
                <label
                  htmlFor={`placeholder-${name}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  <span className="font-mono text-foreground">[{name}]</span>
                </label>
                <Input
                  id={`placeholder-${name}`}
                  value={values[name] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                  placeholder={t('placeholderInputPlaceholder', { name })}
                  maxLength={200}
                  autoFocus={!isTouchPrimary() && placeholders[0] === name}
                />
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('placeholderPreviewLabel')}
          </p>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 font-serif text-sm leading-6 text-foreground/85">
            {previewPrompt}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-5"
          >
            {t('placeholderCancel')}
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            className="rounded-full px-5"
          >
            {placeholders.length === 0 || hasFilledAny
              ? t('placeholderApply')
              : t('placeholderApplyAsIs')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
