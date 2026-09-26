'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { LIQUID_TIMING } from '@/constants/motion'
import type { CharacterCardRecord, CreateCharacterCardRequest } from '@/types'
import { Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import { CharacterCardCreateForm } from '@/components/business/cards/CharacterCardCreateForm'
import { CharacterDetail } from '@/components/business/cards/CharacterDetail'
import {
  CharacterOverview,
  type OverviewItem,
} from '@/components/business/cards/CharacterOverview'
import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'
import { useCardsOperatorHost } from '@/hooks/cards/use-cards-operator-host'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useLiquidReveal, type LiquidRect } from '@/hooks/use-liquid-reveal'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/**
 * **角色页 · 方向 A**（owner 09-26 选 A）：总览（`CharacterOverview`）+ 整页详情
 * （`CharacterDetail`，左图右文）。
 *
 * ⭐ 点一个角色，整页**从这张卡长出来**（液态展开 `useLiquidReveal`：先横成一条标题条
 *   贴住页顶，再纵向落下）；「‹ 角色」/ Esc 收回那张卡。形状起步带那张卡的图、线性退白。
 * ⚠ 手机与降级动效不走液态：直接换成详情。
 * ⚠ 详情开着时总览 `inert`（焦点与读屏不落到底下那层）。
 */

/** 第一拍标题条高度（≈ 详情标题行）；卡图圆角（`rounded-2xl` = 16）。 */
const STRIP_HEIGHT_PX = 72
const TILE_RADIUS_PX = 16

function flattenRoster(cards: CharacterCardRecord[]): OverviewItem[] {
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
  const directCut = reducedMotion || isMobile
  const items = useMemo(
    () => flattenRoster(characters.cards),
    [characters.cards],
  )
  const flatCards = useMemo(() => items.map((item) => item.card), [items])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef(new Map<string, HTMLElement>())
  const registerTile = useCallback((id: string, node: HTMLElement | null) => {
    if (node) tileRefs.current.set(id, node)
    else tileRefs.current.delete(id)
  }, [])
  const reveal = useLiquidReveal({
    reducedMotion: directCut,
    stripHeightPx: STRIP_HEIGHT_PX,
    originRadiusPx: TILE_RADIUS_PX,
    targetRadiusPx: 0,
  })
  /** 形状起步是那张卡本身（它的图），线性退成白；收回时再退回那张图。 */
  const tintIn = useMotionValue(0)

  // 收完（相位回到 closed）就不再算打开：⛔ 不在 effect 里清状态。
  const activeId = closing && reveal.phase === 'closed' ? null : selectedId
  const selected = useMemo(
    () => items.find((item) => item.card.id === activeId)?.card ?? null,
    [items, activeId],
  )
  const detailVisible = reveal.phase !== 'closed' && selected !== null
  /** 卡片助手（第五张脸）：读这页上有谁 + 打开着的那一位。 */
  const operatorHost = useCardsOperatorHost({
    cards: flatCards,
    openId: detailVisible ? activeId : null,
  })
  const moving = reveal.phase === 'opening' || reveal.phase === 'closing'

  const rects = useCallback(
    (id: string): { origin: LiquidRect; target: LiquidRect } | null => {
      const stage = stageRef.current?.getBoundingClientRect()
      if (!stage) return null
      const tile = tileRefs.current.get(id)?.getBoundingClientRect()
      const target = {
        left: 0,
        top: 0,
        right: stage.width,
        bottom: stage.height,
      }
      // 卡已不在屏上（搜索换了结果）：从页顶那条长出来。
      const origin = tile
        ? {
            left: tile.left - stage.left,
            top: tile.top - stage.top,
            right: tile.right - stage.left,
            bottom: tile.bottom - stage.top,
          }
        : { ...target, bottom: STRIP_HEIGHT_PX }
      return { origin, target }
    },
    [],
  )

  const openCharacter = useCallback(
    (id: string) => {
      const geometry = rects(id)
      if (!geometry) return
      setClosing(false)
      setSelectedId(id)
      reveal.open(geometry.origin, geometry.target)
      if (!directCut) {
        tintIn.jump(1)
        animate(tintIn, 0, {
          duration: LIQUID_TIMING.headInDelayS + LIQUID_TIMING.headInS,
          ease: 'linear',
        })
      }
    },
    [directCut, rects, reveal, tintIn],
  )

  const closeDetail = useCallback(() => {
    if (!activeId || closing) return
    const geometry = rects(activeId)
    if (!geometry) return
    setClosing(true)
    reveal.close(geometry.origin, geometry.target)
    if (!directCut) {
      animate(tintIn, 1, {
        delay:
          LIQUID_TIMING.retractDelayS + LIQUID_TIMING.retractSecondBeatDelayS,
        duration: LIQUID_TIMING.swapInS,
        ease: 'linear',
      })
    }
  }, [activeId, closing, directCut, rects, reveal, tintIn])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // 叠在详情上的弹层（素材库选择器）已经处理掉的 Esc 不再收详情。
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && detailVisible) closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDetail, detailVisible])

  const handleCreate = async (data: CreateCharacterCardRequest) => {
    setIsCreating(true)
    const card = await characters.create(data)
    setIsCreating(false)
    if (card) setCreateOpen(false)
    return card
  }

  /** 删掉之后直接回总览（不走收回动画：那张卡已经不在了）。 */
  const deleteCharacter = async (id: string) => {
    const ok = await characters.remove(id)
    if (ok) {
      setSelectedId(null)
      setClosing(false)
      reveal.reset()
    }
    return ok
  }

  return (
    <StudioOperatorHostProvider host={operatorHost}>
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background"
      >
        <div
          inert={detailVisible}
          className="h-full overflow-y-auto px-5 pb-12 pt-6 sm:px-9 sm:pt-8"
        >
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
            <CharacterOverview
              items={items}
              reducedMotion={reducedMotion}
              onOpen={openCharacter}
              registerTile={registerTile}
              actions={
                <Button
                  type="button"
                  className="shrink-0 rounded-full"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-4" />
                  {t('newCharacter')}
                </Button>
              }
            />
          )}
        </div>

        {detailVisible ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-10',
              moving && 'drop-shadow-xl',
            )}
          >
            <motion.div
              style={{ clipPath: reveal.clipPath }}
              className="absolute inset-0 bg-background"
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
                      sizes="100vw"
                      className="object-cover"
                    />
                  ) : null}
                </motion.div>
              ) : null}
              <div
                role="region"
                aria-label={selected.name}
                className="pointer-events-auto absolute inset-0"
              >
                <CharacterDetail
                  key={selected.id}
                  card={selected}
                  entry={directCut ? 'static' : 'open'}
                  closing={closing}
                  onClose={closeDetail}
                  onUpdate={(data) => characters.update(selected.id, data)}
                  onDelete={() => deleteCharacter(selected.id)}
                />
              </div>
            </motion.div>
          </div>
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
      <StudioOperatorDock />
    </StudioOperatorHostProvider>
  )
}
