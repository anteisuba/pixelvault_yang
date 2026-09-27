'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { DURATION, DURATION_MS, EASE_STANDARD } from '@/constants/motion'
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
import {
  CharacterDetailBody,
  CharacterDetailHeader,
} from '@/components/business/cards/CharacterDetail'
import {
  CharacterOverview,
  CharacterOverviewHeader,
  countCharacterWorks,
  type OverviewItem,
} from '@/components/business/cards/CharacterOverview'
import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'
import { useCardsOperatorHost } from '@/hooks/cards/use-cards-operator-host'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { cn } from '@/lib/utils'

/**
 * **角色页 · 方向 A**（owner 09-26 选 A；09-27 详情排版 A · 打开动画 2 · 助手布局 A）。
 *
 * ⭐ 与图片台同一套**布局 A「分栏并排」**：地台上一行（总览 = 标题 · 计数 · 搜索 ·
 *   新角色；详情 = ‹ 角色 · 用她 · 编辑），右端是助手头像那一格（Dock 的 fixed 头像，
 *   锚点 `STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR`）；下面一张白卡。助手展开时面板从
 *   右侧滑进来，地台右内边距同一根弹簧让位（`CardsPageContent`）—— 并排，⛔ 不覆盖。
 * ⭐ 打开 / 返回 = **直接切**（原型「动画 2」）：旧的一层淡出 120ms，新的一层淡入并
 *   上移 8px（200ms）。⛔ 不做形状（液态长出来那版 owner 09-27 否了）。
 * ⚠ 总览在详情开着时**不卸载**（藏起 + `inert`）：回来时滚动位置、搜索词、作品筛选
 *   都还在。
 */

/**
 * 地台那一行。右边给助手头像留的位（36 头像 + 12 间距）只在面板收着时留：面板开着时
 * 头像在面板上方，这一行已经随白卡收窄，再留就是一块空。手机不出助手，不留。
 */
const ROW_CLASS = 'flex h-9 shrink-0 items-center gap-3'
const ROW_AVATAR_GAP_CLASS = 'lg:pr-12'

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
  const locale = useLocale()
  const characters = useCharacterCards()
  const reducedMotion = useReducedMotion() ?? false
  const items = useMemo(
    () => flattenRoster(characters.cards),
    [characters.cards],
  )
  const flatCards = useMemo(() => items.map((item) => item.card), [items])

  const [openId, setOpenId] = useState<string | null>(null)
  /** 正在淡出的那一位（返回时详情先淡出、淡完才卸载；这期间不接点击）。 */
  const [closingId, setClosingId] = useState<string | null>(null)
  /**
   * ⚠ 淡完才卸载**只认定时器**（与液态收回同一条）：后台标签页 rAF 冻结，动画的
   *   完成回调可能永远不来 —— 09-27 真机上留下一层透明详情吞掉点击。
   */
  const closeTimer = useRef<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const selected = useMemo(
    () => items.find((item) => item.card.id === openId)?.card ?? null,
    [items, openId],
  )
  /** 卡片助手（第五张脸）：读这页上有谁 + 打开着的那一位。 */
  const operatorHost = useCardsOperatorHost({
    cards: flatCards,
    openId: selected?.id ?? null,
  })

  const openCharacter = useCallback((id: string) => {
    setEditing(false)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setClosingId(null)
    setOpenId(id)
  }, [])
  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    },
    [],
  )
  const closeDetail = useCallback(() => {
    setEditing(false)
    setOpenId(null)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (reducedMotion) {
      setClosingId(null)
      return
    }
    setClosingId(openId)
    closeTimer.current = window.setTimeout(
      () => setClosingId(null),
      DURATION_MS.fast + DURATION_MS.fast,
    )
  }, [openId, reducedMotion])
  const detailCard = useMemo(
    () =>
      items.find((item) => item.card.id === (openId ?? closingId))?.card ??
      null,
    [closingId, items, openId],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // 叠在上面的弹层（素材库选择器、用她菜单）已经处理掉的 Esc 不再收详情。
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && selected && !editing) closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDetail, editing, selected])

  const handleCreate = async (data: CreateCharacterCardRequest) => {
    setIsCreating(true)
    const card = await characters.create(data)
    setIsCreating(false)
    if (card) setCreateOpen(false)
    return card
  }

  /** 删掉之后回总览。 */
  const deleteCharacter = async (id: string) => {
    const ok = await characters.remove(id)
    if (ok) closeDetail()
    return ok
  }

  /** 新的一层淡入并上移 8px；旧的一层淡出（原型「动画 2」）。 */
  const enter = reducedMotion ? false : { opacity: 0, y: 8 }
  const enterTransition = reducedMotion
    ? { duration: 0 }
    : { duration: DURATION.base, delay: DURATION.fast, ease: EASE_STANDARD }

  const newCharacterButton = (
    <Button
      type="button"
      className="shrink-0 rounded-full"
      onClick={() => setCreateOpen(true)}
    >
      <Plus className="size-4" />
      {t('newCharacter')}
    </Button>
  )

  return (
    <StudioOperatorHostProvider host={operatorHost}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* ⚠ 不等旧的一行退场（AnimatePresence mode="wait" 的退场完成靠 rAF，后台标签页
          冻结时整行卡在旧内容上）：换 key 即换，新的一行淡入上移。 */}
        <motion.div
          key={selected ? `detail:${selected.id}` : 'overview'}
          initial={enter}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: DURATION.base, ease: EASE_STANDARD }
          }
          className={cn(ROW_CLASS, !operatorHost.open && ROW_AVATAR_GAP_CLASS)}
        >
          {selected ? (
            <CharacterDetailHeader
              card={selected}
              editing={editing}
              onBack={closeDetail}
              onEdit={() => setEditing(true)}
            />
          ) : (
            <CharacterOverviewHeader
              characters={items.length}
              works={countCharacterWorks(items, locale)}
              query={query}
              onQueryChange={setQuery}
              actions={newCharacterButton}
            />
          )}
        </motion.div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background">
          <motion.div
            inert={selected !== null}
            animate={{ opacity: selected ? 0 : 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : selected
                  ? { duration: DURATION.fast, ease: EASE_STANDARD }
                  : enterTransition
            }
            className="h-full overflow-y-auto px-5 pb-12 pt-6 sm:px-8"
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
                query={query}
              />
            )}
          </motion.div>

          {/*
            ⚠ 不用 AnimatePresence：09-27 真机上它的退场淡完了却没卸载（完成回调靠 rAF，
            后台标签页冻结），留下一层透明详情盖住总览、吞掉点击。这里自己管：返回时这一层
            淡出（`closingId`），定时器到点再卸；淡出期间 `pointer-events-none`。
          */}
          {detailCard ? (
            <motion.div
              key={detailCard.id}
              role="region"
              aria-label={detailCard.name}
              initial={enter}
              animate={
                selected
                  ? { opacity: 1, y: 0, transition: enterTransition }
                  : {
                      opacity: 0,
                      transition: {
                        duration: DURATION.fast,
                        ease: EASE_STANDARD,
                      },
                    }
              }
              className={cn(
                'absolute inset-0 bg-background',
                !selected && 'pointer-events-none',
              )}
            >
              <CharacterDetailBody
                card={detailCard}
                editing={editing}
                onEdit={() => setEditing(true)}
                onEditDone={() => setEditing(false)}
                onUpdate={(data) => characters.update(detailCard.id, data)}
                onDelete={() => deleteCharacter(detailCard.id)}
              />
            </motion.div>
          ) : null}
        </div>
      </div>

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
      <StudioOperatorDock />
    </StudioOperatorHostProvider>
  )
}
