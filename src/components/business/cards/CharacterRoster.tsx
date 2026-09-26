'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { LIQUID_SPRING, LIQUID_TIMING } from '@/constants/motion'
import type { CharacterCardRecord, CreateCharacterCardRequest } from '@/types'
import { Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import {
  CharacterCardPanel,
  type CharacterPanelEntry,
} from '@/components/business/cards/CharacterCardPanel'
import { CharacterCardCreateForm } from '@/components/business/cards/CharacterCardCreateForm'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useLiquidReveal, type LiquidRect } from '@/hooks/use-liquid-reveal'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/**
 * **卡片页 K3：网格 + 侧栏**（画布第 7 页「卡片 · ④ 全状态」，owner 09-26 定）。
 *
 * ⭐ 一页一个主角：点一张角色，右侧那一栏**从这张卡长出来**（液态展开，
 *   `useLiquidReveal`）；开着时点别的角色只换内容，形状不动；再点同一张 / 关闭钮 /
 *   Esc 收回那张卡。网格让位走 motion `layout`（弹簧，`LIQUID_SPRING.unfold`），
 *   选中框是配角（`layoutId`），跟着卡走。
 * ⚠ 收起时网格**等侧栏收完才回位**：形状缩回的是那张卡此刻的位置。
 * ⚠ 手机走系统底部抽屉（下拉关闭），不走液态。
 */

/** 侧栏宽 380（`w-95`）；第一拍标题条高度；卡图圆角（`rounded-xl` = 12）。 */
const PANEL_WIDTH_PX = 380
const STRIP_HEIGHT_PX = 132
const TILE_RADIUS_PX = 12

interface RosterItem {
  card: CharacterCardRecord
  /** 变体跟在父卡后面，副标题写「父卡 · 变体名」。 */
  parentName: string | null
}

function flattenRoster(cards: CharacterCardRecord[]): RosterItem[] {
  return cards.flatMap((card) => [
    { card, parentName: null },
    ...card.variants.map((variant) => ({
      card: variant,
      parentName: card.name,
    })),
  ])
}

export function CharacterRoster() {
  const t = useTranslations('CharacterRoster')
  const characters = useCharacterCards()
  const reducedMotion = useReducedMotion() ?? false
  const isMobile = useIsMobile() ?? false
  const items = useMemo(
    () => flattenRoster(characters.cards),
    [characters.cards],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [entry, setEntry] = useState<CharacterPanelEntry>('open')
  const [closing, setClosing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const tileImageRefs = useRef(new Map<string, HTMLDivElement>())
  const reveal = useLiquidReveal({
    reducedMotion,
    stripHeightPx: STRIP_HEIGHT_PX,
    originRadiusPx: TILE_RADIUS_PX,
    targetRadiusPx: 0,
  })
  /** 形状起步是那张卡本身（它的图），线性退成白；收回时再退回那张图。 */
  const tintIn = useMotionValue(0)

  // 收完（相位回到 closed）就不再算选中：网格此时才回位。⛔ 不在 effect 里清状态。
  const activeId =
    !isMobile && closing && reveal.phase === 'closed' ? null : selectedId
  const selected = useMemo(
    () => items.find((item) => item.card.id === activeId)?.card ?? null,
    [items, activeId],
  )
  const panelVisible =
    !isMobile && reveal.phase !== 'closed' && selected !== null
  const moving = reveal.phase === 'opening' || reveal.phase === 'closing'

  const rects = useCallback(
    (id: string): { origin: LiquidRect; target: LiquidRect } | null => {
      const stage = stageRef.current?.getBoundingClientRect()
      const tile = tileImageRefs.current.get(id)?.getBoundingClientRect()
      if (!stage || !tile) return null
      return {
        origin: {
          left: tile.left - stage.left,
          top: tile.top - stage.top,
          right: tile.right - stage.left,
          bottom: tile.bottom - stage.top,
        },
        target: {
          left: stage.width - PANEL_WIDTH_PX,
          top: 0,
          right: stage.width,
          bottom: stage.height,
        },
      }
    },
    [],
  )

  const openCharacter = useCallback(
    (id: string) => {
      if (isMobile) {
        setSelectedId(id)
        return
      }
      const open = reveal.phase === 'open' || reveal.phase === 'opening'
      if (open && id === activeId) {
        const geometry = rects(id)
        if (!geometry) return
        setClosing(true)
        reveal.close(geometry.origin, geometry.target)
        if (!reducedMotion) {
          const retintAtS =
            LIQUID_TIMING.retractDelayS + LIQUID_TIMING.retractSecondBeatDelayS
          animate(tintIn, 1, {
            delay: retintAtS,
            duration: LIQUID_TIMING.swapInS,
            ease: 'linear',
          })
        }
        return
      }
      if (open) {
        setEntry('swap')
        setSelectedId(id)
        return
      }
      const geometry = rects(id)
      if (!geometry) return
      setEntry('open')
      setClosing(false)
      setSelectedId(id)
      reveal.open(geometry.origin, geometry.target)
      if (!reducedMotion) {
        tintIn.jump(1)
        animate(tintIn, 0, {
          duration: LIQUID_TIMING.headInDelayS + LIQUID_TIMING.headInS,
          ease: 'linear',
        })
      }
    },
    [activeId, isMobile, rects, reducedMotion, reveal, tintIn],
  )

  const closePanel = useCallback(() => {
    if (activeId) openCharacter(activeId)
  }, [activeId, openCharacter])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panelVisible && !closing) closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePanel, closing, panelVisible])

  const handleCreate = async (data: CreateCharacterCardRequest) => {
    setIsCreating(true)
    const card = await characters.create(data)
    setIsCreating(false)
    if (card) setCreateOpen(false)
    return card
  }

  /** 删掉之后侧栏直接关（不走收回动画：那张卡已经不在网格里了）。 */
  const deleteCharacter = async (id: string) => {
    const ok = await characters.remove(id)
    if (ok) {
      setSelectedId(null)
      setClosing(false)
      reveal.reset()
    }
    return ok
  }
  const gridShifted =
    !isMobile && selected !== null && reveal.phase !== 'closed'

  return (
    <div
      ref={stageRef}
      className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background"
    >
      <div
        className={cn(
          'h-full overflow-y-auto px-9 pb-12 pt-8',
          gridShifted && 'lg:pr-104',
        )}
      >
        <header className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('title')}
          </h1>
          <span className="text-sm text-muted-foreground">
            {items.length || ''}
          </span>
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            {t('newCharacter')}
          </Button>
        </header>

        {characters.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Plus aria-hidden />}
            title={t('emptyTitle')}
            description={t('emptyHint')}
            action={
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                onClick={() => setCreateOpen(true)}
              >
                {t('newCharacter')}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map(({ card, parentName }) => {
              const cover = card.referenceSlots[0]?.url ?? card.sourceImageUrl
              const isSelected = card.id === activeId
              return (
                <motion.button
                  key={card.id}
                  type="button"
                  layout={!reducedMotion}
                  transition={LIQUID_SPRING.unfold}
                  onClick={() => openCharacter(card.id)}
                  aria-pressed={isSelected}
                  data-testid="roster-tile"
                  className="flex flex-col gap-2.5 text-left"
                >
                  <div
                    ref={(node) => {
                      if (node) tileImageRefs.current.set(card.id, node)
                      else tileImageRefs.current.delete(card.id)
                    }}
                    className="relative aspect-4/5 w-full rounded-xl bg-muted"
                  >
                    {cover ? (
                      <Image
                        src={cover}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 220px, 45vw"
                        className="rounded-xl object-cover"
                      />
                    ) : null}
                    {isSelected ? (
                      <motion.span
                        layoutId="character-roster-selection"
                        transition={LIQUID_SPRING.lead}
                        aria-hidden
                        className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-foreground"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      {card.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {parentName
                        ? t('variantOf', {
                            parent: parentName,
                            label: card.variantLabel ?? '',
                          })
                        : card.handle
                          ? `@${card.handle}`
                          : ''}
                    </p>
                  </div>
                </motion.button>
              )
            })}
          </div>
        )}
      </div>

      {panelVisible ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-10',
            moving && 'drop-shadow-xl',
          )}
        >
          <motion.div
            style={{ clipPath: reveal.clipPath }}
            className={cn('absolute inset-0', moving && 'bg-background')}
          >
            {moving ? (
              <motion.div
                aria-hidden
                style={{ opacity: tintIn }}
                className="absolute inset-0 z-10 bg-muted"
              >
                {selected.referenceSlots[0]?.url ? (
                  <Image
                    src={selected.referenceSlots[0].url}
                    alt=""
                    fill
                    sizes="380px"
                    className="object-cover"
                  />
                ) : null}
              </motion.div>
            ) : null}
            <aside
              aria-label={selected.name}
              className={cn(
                'pointer-events-auto absolute inset-y-0 right-0 w-95 bg-background',
                !moving && 'border-l border-border',
              )}
            >
              <CharacterCardPanel
                key={selected.id}
                card={selected}
                entry={entry}
                closing={closing}
                onClose={closePanel}
                onUpdate={(data) => characters.update(selected.id, data)}
                onDelete={() => deleteCharacter(selected.id)}
                showClose
              />
            </aside>
          </motion.div>
        </div>
      ) : null}

      {isMobile ? (
        <Drawer
          open={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null)
          }}
        >
          <DrawerContent className="top-14 mt-0 flex flex-col overflow-hidden">
            <DrawerTitle className="sr-only">
              {selected?.name ?? ''}
            </DrawerTitle>
            {selected ? (
              <CharacterCardPanel
                key={selected.id}
                card={selected}
                entry="static"
                closing={false}
                onClose={() => setSelectedId(null)}
                onUpdate={(data) => characters.update(selected.id, data)}
                onDelete={() => deleteCharacter(selected.id)}
                showClose={false}
              />
            ) : null}
          </DrawerContent>
        </Drawer>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-svh overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('newCharacter')}</DialogTitle>
          </DialogHeader>
          <CharacterCardCreateForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            isSubmitting={isCreating}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
