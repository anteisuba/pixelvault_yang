'use client'

import { memo, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Layers } from 'lucide-react'
import { useCharacterCards } from '@/hooks/use-character-cards'
import { useStyleCards } from '@/hooks/use-style-cards'
import { useBackgroundCards } from '@/hooks/use-background-cards'
import { CharacterCardManager } from '@/components/business/CharacterCardManager'
import { StyleCardManager } from '@/components/business/StyleCardManager'
import { SimpleCardManager } from '@/components/business/SimpleCardManager'

interface CardDrawerProps {
  children?: React.ReactNode
}

function CardDrawerContent() {
  const t = useTranslations('StudioV2')
  const tBg = useTranslations('BackgroundCard')
  const characters = useCharacterCards()
  const styles = useStyleCards()
  const backgrounds = useBackgroundCards()

  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-2">
        <SheetTitle className="font-display">{t('cardManagement')}</SheetTitle>
      </SheetHeader>

      <Tabs defaultValue="characters" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-6 mb-2" variant="line">
          <TabsTrigger value="characters">{t('character')}</TabsTrigger>
          <TabsTrigger value="styles">{t('style')}</TabsTrigger>
          <TabsTrigger value="backgrounds">{tBg('title')}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="characters"
          className="flex-1 overflow-y-auto px-4 pb-4"
        >
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

        <TabsContent
          value="styles"
          className="flex-1 overflow-y-auto px-4 pb-4"
        >
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

        <TabsContent
          value="backgrounds"
          className="flex-1 overflow-y-auto px-4 pb-4"
        >
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
    </>
  )
}

export const CardDrawer = memo(function CardDrawer({
  children,
}: CardDrawerProps) {
  const t = useTranslations('StudioV2')
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {children ?? (
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex gap-1.5 text-xs"
          >
            <Layers className="size-3.5" />
            Cards
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:w-[420px] sm:max-w-[480px] flex flex-col p-0"
      >
        {open && <CardDrawerContent />}
      </SheetContent>
    </Sheet>
  )
})
