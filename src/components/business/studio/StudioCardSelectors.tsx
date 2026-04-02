'use client'

import { useMemo } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CardDropdown } from '@/components/business/CardDropdown'
import { ApiKeyManager } from '@/components/business/ApiKeyManager'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { modelSupportsLora } from '@/constants/models'
import { buildStudioCardUsageMap } from '@/lib/studio-history'

export function StudioCardSelectors() {
  const { dispatch } = useStudioForm()
  const { characters, backgrounds, styles, projects } = useStudioData()
  const { keys, isLoading: isLoadingKeys } = useApiKeysContext()
  const t = useTranslations('StudioV2')
  const tV3 = useTranslations('StudioV3')
  const tApiKeys = useTranslations('StudioApiKeys')

  const activeKeyCount = keys.filter((k) => k.isActive).length
  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null
  const projectHistory = projects.history
  const cardUsage = useMemo(
    () => buildStudioCardUsageMap(projectHistory),
    [projectHistory],
  )

  const handleCharSelect = (id: string | null) => {
    if (selectedCharId) characters.toggleCardSelection(selectedCharId)
    if (id) characters.toggleCardSelection(id)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CardDropdown
        label={t('character')}
        cards={characters.cards.map((c) => ({
          id: c.id,
          name: c.name,
          sourceImageUrl: c.sourceImageUrl,
          tags: c.tags,
          createdAt: c.createdAt,
          lastUsedAt: cardUsage.character[c.id] ?? null,
        }))}
        selectedId={selectedCharId}
        onSelect={handleCharSelect}
        onManage={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
        }
        isLoading={characters.isLoading}
      />
      <CardDropdown
        label={t('background')}
        cards={backgrounds.cards.map((c) => ({
          id: c.id,
          name: c.name,
          sourceImageUrl: c.sourceImageUrl ?? null,
          tags: c.tags,
          createdAt: c.createdAt,
          lastUsedAt: cardUsage.background[c.id] ?? null,
        }))}
        selectedId={backgrounds.activeCardId}
        onSelect={backgrounds.setActiveCardId}
        onManage={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
        }
        isLoading={backgrounds.isLoading}
      />
      <CardDropdown
        label={t('style')}
        cards={styles.cards.map((c) => ({
          id: c.id,
          name: c.modelId
            ? `${c.name} · ${
                modelSupportsLora(c.modelId)
                  ? tV3('loraBadge')
                  : tV3('referenceBadge')
              }`
            : c.name,
          sourceImageUrl: c.sourceImageUrl ?? null,
          tags: c.tags,
          createdAt: c.createdAt,
          lastUsedAt: cardUsage.style[c.id] ?? null,
        }))}
        selectedId={styles.activeCardId}
        onSelect={styles.setActiveCardId}
        onManage={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
        }
        isLoading={styles.isLoading}
      />

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            title={tApiKeys('triggerLabel')}
          >
            <KeyRound className="size-3.5" />
            <span className="hidden sm:inline">{tApiKeys('triggerLabel')}</span>
            <Badge
              variant="secondary"
              className="rounded-full px-1.5 py-0 text-[10px]"
            >
              {isLoadingKeys
                ? tApiKeys('triggerLoading')
                : tApiKeys('triggerCount', { count: activeKeyCount })}
            </Badge>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto border-l bg-background/95 px-0 sm:max-w-2xl">
          <SheetHeader className="gap-3 border-b px-6 pb-5 pt-6">
            <SheetTitle className="flex items-center gap-2 font-display text-lg font-medium">
              <KeyRound className="size-4" />
              {tApiKeys('sheetTitle')}
            </SheetTitle>
            <SheetDescription className="max-w-md font-serif leading-6">
              {tApiKeys('sheetDescription')}
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 py-6">
            <ApiKeyManager />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
