'use client'

import { useMemo, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useRecipes } from '@/hooks/use-recipes'
import type { RecipeRecord } from '@/types'

const RECENT_TEMPLATE_COUNT = 5

interface PromptTemplatePickerProps {
  onApply: (recipe: RecipeRecord) => void
}

export function PromptTemplatePicker({ onApply }: PromptTemplatePickerProps) {
  const t = useTranslations('PromptLibrary')
  const [open, setOpen] = useState(false)
  const { recipes, isLoading } = useRecipes(open)

  const { recentRecipes, restRecipes } = useMemo(() => {
    if (recipes.length === 0) return { recentRecipes: [], restRecipes: [] }

    const sorted = [...recipes].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    return {
      recentRecipes: sorted.slice(0, RECENT_TEMPLATE_COUNT),
      restRecipes: sorted.slice(RECENT_TEMPLATE_COUNT),
    }
  }, [recipes])

  const runAction = (recipe: RecipeRecord) => {
    onApply(recipe)
    setOpen(false)
  }

  const renderItem = (recipe: RecipeRecord) => {
    const searchValue = [
      recipe.id,
      recipe.name,
      recipe.compiledPrompt,
      recipe.modelId,
      recipe.provider,
    ]
      .filter((v): v is string => Boolean(v))
      .join(' ')

    return (
      <CommandItem
        key={recipe.id}
        value={searchValue}
        onSelect={() => runAction(recipe)}
        className="group min-h-11 items-center gap-3 px-3 py-2.5"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/65 text-muted-foreground transition-colors group-hover:bg-background/80 group-hover:text-foreground group-data-[selected=true]:bg-background/80 group-data-[selected=true]:text-foreground">
          <FileText className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 min-w-0 text-sm font-semibold">
            {recipe.name || recipe.modelId}
          </span>
        </span>
      </CommandItem>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 rounded-full px-3 text-sm text-muted-foreground',
            'transition-[color,background-color,border-color,box-shadow] duration-200',
            'hover:bg-muted/35 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20',
            'data-[state=open]:bg-muted/55 data-[state=open]:text-foreground',
          )}
        >
          <FileText className="size-4" />
          {t('templatePicker')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={12}
        className="w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <Command className="bg-transparent">
          <CommandInput
            placeholder={t('searchPlaceholder')}
            className="h-10 text-sm"
          />
          <CommandList className="max-h-96 overscroll-contain">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>{t('recentTemplates')}</span>
              </div>
            ) : (
              <>
                <CommandEmpty>{t('emptyTitle')}</CommandEmpty>
                {recentRecipes.length > 0 && (
                  <CommandGroup heading={t('recentTemplates')}>
                    {recentRecipes.map(renderItem)}
                  </CommandGroup>
                )}
                {restRecipes.length > 0 && (
                  <CommandGroup heading={t('allTemplates')}>
                    {restRecipes.map(renderItem)}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
