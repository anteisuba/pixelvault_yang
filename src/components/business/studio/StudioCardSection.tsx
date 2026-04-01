'use client'

import { memo, useCallback, useMemo } from 'react'
import { Settings2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { CardDropdown } from '@/components/business/CardDropdown'
import { CharacterCardManager } from '@/components/business/CharacterCardManager'
import { SimpleCardManager } from '@/components/business/SimpleCardManager'
import { StyleCardManager } from '@/components/business/StyleCardManager'
import { StudioErrorBoundary } from './StudioErrorBoundary'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { modelSupportsLora } from '@/constants/models'
import { buildStudioCardUsageMap } from '@/lib/studio-history'

import { StudioApiRoutesSection } from './StudioApiRoutesSection'

/**
 * StudioCardSection — card mode only.
 * Contains: character/background/style dropdowns, API Keys sheet,
 * and Card Management sheet (with all three card managers).
 */
export const StudioCardSection = memo(function StudioCardSection() {
  const { state, dispatch } = useStudioForm()
  const { characters, backgrounds, styles, projects } = useStudioData()
  const t = useTranslations('StudioV2')
  const tV3 = useTranslations('StudioV3')
  const tBg = useTranslations('BackgroundCard')
  const projectHistory = projects.history

  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null
  const cardUsage = useMemo(
    () => buildStudioCardUsageMap(projectHistory),
    [projectHistory],
  )

  const handleCharSelect = useCallback(
    (id: string | null) => {
      if (selectedCharId) characters.toggleCardSelection(selectedCharId)
      if (id) characters.toggleCardSelection(id)
    },
    [selectedCharId, characters],
  )

  return (
    <>
      {/* ── Card dropdowns + API Keys ──────────────────────────── */}
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

        <StudioApiRoutesSection compact />
      </div>

      {/* ── Card management Sheet ──────────────────────────────── */}
      <Sheet
        open={state.panels.cardManagement}
        onOpenChange={(open) =>
          dispatch({
            type: open ? 'TOGGLE_PANEL' : 'CLOSE_PANEL',
            payload: 'cardManagement',
          })
        }
      >
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-border/60 text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="size-3.5" />
            <span className="font-display text-sm">{t('cardManagement')}</span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-l bg-background/95 px-0 sm:max-w-xl"
        >
          <SheetHeader className="gap-3 border-b px-6 pb-5 pt-6">
            <SheetTitle className="font-display text-lg font-medium">
              {t('cardManagement')}
            </SheetTitle>
          </SheetHeader>
          <StudioErrorBoundary section={t('cardManagement')}>
            <div className="p-6 space-y-6">
              <CharacterCardManager
                cards={characters.cards}
                activeCardIds={characters.activeCardIds}
                isLoading={characters.isLoading}
                lastUsedAtById={cardUsage.character}
                onToggleSelect={characters.toggleCardSelection}
                onCreate={characters.create}
                onUpdate={characters.update}
                onDelete={characters.remove}
              />

              <SimpleCardManager
                cardType="BACKGROUND"
                title={tBg('title')}
                cards={backgrounds.cards.map((c) => ({
                  id: c.id,
                  name: c.name,
                  description: c.description,
                  sourceImageUrl: c.sourceImageUrl ?? null,
                  prompt: c.backgroundPrompt,
                  tags: c.tags,
                  createdAt: c.createdAt,
                  lastUsedAt: cardUsage.background[c.id] ?? null,
                }))}
                activeCardId={backgrounds.activeCardId}
                isLoading={backgrounds.isLoading}
                onSelect={backgrounds.setActiveCardId}
                onCreate={async (data) => {
                  await backgrounds.create({
                    name: data.name,
                    description: data.description,
                    backgroundPrompt: data.prompt,
                    sourceImageData: data.sourceImageData,
                    tags: data.tags ?? [],
                    projectId: projects.activeProjectId ?? undefined,
                  })
                }}
                onUpdate={async (id, data) =>
                  backgrounds.update(id, {
                    ...(data.name ? { name: data.name } : {}),
                    ...(data.prompt ? { backgroundPrompt: data.prompt } : {}),
                  })
                }
                onDelete={backgrounds.remove}
                supportsImageExtraction
                showLoraConfig
                promptLabel={tBg('prompt')}
                promptPlaceholder={tBg('promptPlaceholder')}
              />

              <StyleCardManager
                cards={styles.cards}
                activeCardId={styles.activeCardId}
                isLoading={styles.isLoading}
                lastUsedAtById={cardUsage.style}
                onSelect={styles.setActiveCardId}
                onCreate={async (data) => {
                  await styles.create({
                    ...data,
                    projectId: projects.activeProjectId ?? undefined,
                  })
                }}
                onUpdate={styles.update}
                onDelete={styles.remove}
              />
            </div>
          </StudioErrorBoundary>
        </SheetContent>
      </Sheet>
    </>
  )
})
