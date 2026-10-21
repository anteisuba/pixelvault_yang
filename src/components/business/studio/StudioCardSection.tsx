'use client'

import { memo, useMemo } from 'react'
import { Settings2, X } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { CharacterCardManager } from '@/components/business/cards/CharacterCardManager'
import { StudioErrorBoundary } from '@/components/business/studio-shared/chrome/StudioErrorBoundary'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { buildStudioCardUsageMap } from '@/lib/studio-history'

/**
 * StudioCardSection — card mode only: the character card management sheet.
 * （风格卡、背景卡 2026-10-21 下线，卡片模式只留角色。）
 */
export const StudioCardSection = memo(function StudioCardSection() {
  const { state, dispatch } = useStudioForm()
  const { characters, projects } = useStudioData()
  const t = useTranslations('StudioV2')
  const tCommon = useTranslations('Common')
  const projectHistory = projects.history

  const cardUsage = useMemo(
    () => buildStudioCardUsageMap(projectHistory),
    [projectHistory],
  )

  return (
    <>
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
            <span className="text-sm">{t('cardManagement')}</span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="dark flex w-full flex-col border-l border-white/10 bg-sidebar p-0 text-sidebar-foreground sm:max-w-2xl"
          showCloseButton={false}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-sidebar/95 px-6 pb-5 pt-6 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80">
            <SheetTitle className="text-lg font-medium text-sidebar-foreground">
              {t('cardManagement')}
            </SheetTitle>
            <SheetClose
              aria-label={tCommon('close')}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="size-5" />
            </SheetClose>
          </div>
          <StudioErrorBoundary section={t('cardManagement')}>
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
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
            </div>
          </StudioErrorBoundary>
        </SheetContent>
      </Sheet>
    </>
  )
})
