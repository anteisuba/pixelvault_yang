'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useRecipes } from '@/hooks/use-recipes'
import type { RecipeRecord } from '@/types'

interface PromptTemplatePickerProps {
  onReplace: (recipe: RecipeRecord) => void
  onInsert: (recipe: RecipeRecord) => void
  onApply: (recipe: RecipeRecord) => void
}

export function PromptTemplatePicker({
  onReplace,
  onInsert,
  onApply,
}: PromptTemplatePickerProps) {
  const t = useTranslations('PromptLibrary')
  const [open, setOpen] = useState(false)
  const { recipes, isLoading } = useRecipes(open)

  const runAction = (
    recipe: RecipeRecord,
    action: (recipe: RecipeRecord) => void,
  ) => {
    action(recipe)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted/35 hover:text-foreground"
        >
          <FileText className="size-4" />
          {t('templatePicker')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-sm font-medium">
              {t('templatePickerTitle')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('recentTemplates')}
            </p>
          </div>
          {!isLoading && (
            <span className="shrink-0 rounded-full border border-border/60 px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {t('templateCount', { count: recipes.length })}
            </span>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {isLoading ? (
            <div
              className="space-y-2.5 px-1 py-2"
              aria-label={t('recentTemplates')}
            >
              <div className="flex items-center justify-center py-3">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border/50 bg-card/60 p-3"
                >
                  <div className="h-3 w-1/2 rounded-full bg-muted" />
                  <div className="mt-3 space-y-2">
                    <div className="h-2 w-full rounded-full bg-muted/70" />
                    <div className="h-2 w-4/5 rounded-full bg-muted/70" />
                  </div>
                </div>
              ))}
            </div>
          ) : recipes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              <FileText className="size-4" />
              <span>{t('emptyTitle')}</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="rounded-lg border border-border/60 bg-card/75 p-3 transition-colors hover:border-border hover:bg-card"
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-1 min-w-0 text-sm font-medium">
                        {recipe.name || recipe.modelId}
                      </p>
                      <span className="max-w-36 shrink-0 truncate text-[11px] text-muted-foreground">
                        {t('templateMeta', {
                          model: recipe.modelId,
                          version: recipe.version,
                        })}
                      </span>
                    </div>
                    <p className="line-clamp-2 font-serif text-xs leading-5 text-muted-foreground">
                      {recipe.compiledPrompt}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-2.5 text-xs"
                      onClick={() => runAction(recipe, onReplace)}
                    >
                      {t('replacePrompt')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-2.5 text-xs"
                      onClick={() => runAction(recipe, onInsert)}
                    >
                      {t('insertPrompt')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="ml-auto h-8 rounded-full px-3 text-xs"
                      onClick={() => runAction(recipe, onApply)}
                    >
                      {t('applyRecipe')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
