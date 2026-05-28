'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import {
  CARD_MANAGEMENT_TABS,
  type CardManagementTab,
} from '@/constants/routes'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useStyleCards } from '@/hooks/cards/use-style-cards'
import { useBackgroundCards } from '@/hooks/cards/use-background-cards'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CharacterCardManager } from '@/components/business/cards/CharacterCardManager'
import { StyleCardManager } from '@/components/business/cards/StyleCardManager'
import { SimpleCardManager } from '@/components/business/cards/SimpleCardManager'

/**
 * /cards 页面内容：复用 CardDrawerContent 的三个卡管理器，但以页面形式呈现。
 * 套用 `dark` 类切到 Krea Overlay 表面 — 卡片缩略图为主体，匹配 sidebar /
 * AssetSelectorDialog 的视觉体系（参见 CLAUDE.md「Krea Overlay surfaces」）。
 */
export function CardsPageContent() {
  const t = useTranslations('StudioV2')
  const tBg = useTranslations('BackgroundCard')
  const searchParams = useSearchParams()
  const characters = useCharacterCards()
  const styles = useStyleCards()
  const backgrounds = useBackgroundCards()
  const requestedTab = searchParams.get('tab')
  const defaultTab = CARD_MANAGEMENT_TABS.includes(
    requestedTab as CardManagementTab,
  )
    ? (requestedTab as CardManagementTab)
    : 'characters'

  return (
    <main className="dark min-h-[calc(100svh-3rem)] bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-medium tracking-tight">
            {t('cardManagement')}
          </h1>
          <p className="font-serif text-sm leading-7 text-sidebar-foreground/70">
            {t('cardManagementHint')}
          </p>
        </header>

        <Tabs
          defaultValue={defaultTab}
          className="flex flex-1 flex-col gap-4 min-h-0"
        >
          <TabsList variant="line">
            <TabsTrigger value="characters">{t('character')}</TabsTrigger>
            <TabsTrigger value="styles">{t('style')}</TabsTrigger>
            <TabsTrigger value="backgrounds">{tBg('title')}</TabsTrigger>
          </TabsList>

          <TabsContent value="characters" className="flex-1 min-h-0">
            <CharacterCardManager
              cards={characters.cards}
              activeCardIds={characters.activeCardIds}
              isLoading={characters.isLoading}
              lastUsedAtById={{}}
              onToggleSelect={characters.toggleCardSelection}
              onCreate={characters.create}
              onUpdate={characters.update}
              onDelete={characters.remove}
            />
          </TabsContent>

          <TabsContent value="styles" className="flex-1 min-h-0">
            <StyleCardManager
              cards={styles.cards}
              activeCardId={styles.activeCardId}
              isLoading={styles.isLoading}
              lastUsedAtById={{}}
              onSelect={styles.setActiveCardId}
              onCreate={async (data) => {
                await styles.create(data)
              }}
              onUpdate={styles.update}
              onDelete={styles.remove}
            />
          </TabsContent>

          <TabsContent value="backgrounds" className="flex-1 min-h-0">
            <SimpleCardManager
              cardType="BACKGROUND"
              title={tBg('title')}
              cards={backgrounds.cards.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description ?? null,
                prompt: c.backgroundPrompt ?? '',
                sourceImageUrl: c.sourceImageUrl ?? null,
                tags: [],
                createdAt: c.createdAt,
              }))}
              activeCardId={backgrounds.activeCardId}
              isLoading={backgrounds.isLoading}
              onSelect={backgrounds.setActiveCardId}
              onCreate={backgrounds.create as never}
              onUpdate={backgrounds.update}
              onDelete={backgrounds.remove}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
