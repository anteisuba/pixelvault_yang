'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CharacterCardManager } from '@/components/business/CharacterCardManager'
import { SimpleCardManager } from '@/components/business/SimpleCardManager'
import { StyleCardManager } from '@/components/business/StyleCardManager'
import { AnimatedCollapse } from '@/components/ui/animated-collapse'
import { StudioErrorBoundary } from '@/components/business/studio/StudioErrorBoundary'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

export function StudioCardManagement() {
  const { state, dispatch } = useStudioForm()
  const { characters, backgrounds, styles, projects } = useStudioData()

  const t = useTranslations('StudioV2')
  const tBg = useTranslations('BackgroundCard')

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <button
        type="button"
        aria-expanded={state.panels.cardManagement}
        aria-controls="studio-card-management"
        onClick={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'cardManagement' })
        }
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
      >
        <span className="font-display">{t('cardManagement')}</span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform duration-300',
            state.panels.cardManagement && 'rotate-180',
          )}
        />
      </button>

      <AnimatedCollapse open={state.panels.cardManagement}>
        <StudioErrorBoundary section="Card Management">
          <div
            id="studio-card-management"
            className="border-t border-border/40 p-4 space-y-6"
          >
            <CharacterCardManager
              cards={characters.cards}
              activeCardIds={characters.activeCardIds}
              isLoading={characters.isLoading}
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
      </AnimatedCollapse>
    </div>
  )
}
