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
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="font-display text-sm font-medium">
            {t('templatePickerTitle')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('recentTemplates')}
          </p>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('recentTemplates')}
            </div>
          ) : recipes.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('emptyTitle')}
            </div>
          ) : (
            <div className="space-y-2">
              {recipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="rounded-xl border border-border/60 bg-card/80 p-3"
                >
                  <div className="space-y-1">
                    <p className="line-clamp-1 text-sm font-medium">
                      {recipe.name || recipe.modelId}
                    </p>
                    <p className="line-clamp-2 font-serif text-xs leading-5 text-muted-foreground">
                      {recipe.compiledPrompt}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => runAction(recipe, onReplace)}
                    >
                      {t('replacePrompt')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => runAction(recipe, onInsert)}
                    >
                      {t('insertPrompt')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-2 text-xs"
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
