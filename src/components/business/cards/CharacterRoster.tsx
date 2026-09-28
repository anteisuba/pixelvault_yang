'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'

import { DURATION, DURATION_MS, EASE_STANDARD } from '@/constants/motion'
import type { CharacterCardRecord } from '@/types'
import type { AssistantOperatorCharacterProfileField } from '@/types/assistant-operator'
import { Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import {
  CharacterDetailBody,
  CharacterDetailHeader,
  CharacterDraftBody,
} from '@/components/business/cards/CharacterDetail'
import {
  CharacterOverview,
  CharacterOverviewHeader,
  countCharacterWorks,
  type OverviewItem,
} from '@/components/business/cards/CharacterOverview'
import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'
import { useCardsOperatorHost } from '@/hooks/cards/use-cards-operator-host'
import { appendSlotSources } from '@/hooks/cards/use-character-card-editor'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { cn } from '@/lib/utils'

/**
 * **角色页 · 方向 A**（owner 09-26 选 A；09-27 详情排版 A · 打开动画 2 · 助手布局 A）。
 *
 * ⭐ 与图片台同一套**布局 A「分栏并排」**：地台上一行（总览 = 标题 · 计数 · 搜索 ·
 *   新角色；详情 = ‹ 角色 · 用她），右端是助手头像那一格（Dock 的 fixed 头像，
 *   锚点 `STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR`）；下面一张白卡。助手展开时面板从
 *   右侧滑进来，地台右内边距同一根弹簧让位（`CardsPageContent`）—— 并排，⛔ 不覆盖。
 * ⭐ 打开 / 返回 = **直接切**（原型「动画 2」）：旧的一层淡出 120ms，新的一层淡入并
 *   上移 8px（200ms）。⛔ 不做形状（液态长出来那版 owner 09-27 否了）。
 * ⚠ 总览在详情开着时**不卸载**（藏起 + `inert`）：回来时滚动位置、搜索词、作品筛选
 *   都还在。
 */

/**
 * 地台那一行（详情 = ‹ 角色 · 用她；⛔ 没有「编辑」键，详情上点哪改哪）。右边给助手头像留的位（36 头像 + 12 间距）只在面板收着时留：面板开着时
 * 头像在面板上方，这一行已经随白卡收窄，再留就是一块空。手机上头像同样在这一行右端（顶栏下 64，与图片台同一地台），一样要留。
 */
const ROW_CLASS = 'flex h-9 shrink-0 items-center gap-3'
const ROW_AVATAR_GAP_CLASS = 'pr-12'

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

  // 画布「在角色页打开」带 `?character=<id>` 进来：直接打开那一位（找不到就是总览）。
  const searchParams = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(() =>
    searchParams.get('character'),
  )
  /** 正在淡出的那一位（返回时详情先淡出、淡完才卸载；这期间不接点击）。 */
  const [closingId, setClosingId] = useState<string | null>(null)
  /**
   * ⚠ 淡完才卸载**只认定时器**（与液态收回同一条）：后台标签页 rAF 冻结，动画的
   *   完成回调可能永远不来 —— 09-27 真机上留下一层透明详情吞掉点击。
   */
  const closeTimer = useRef<number | null>(null)
  const [query, setQuery] = useState('')
  /** 「新角色」草稿开着（owner 09-28：直接进空详情页，名字写好才建卡）。 */
  const [drafting, setDrafting] = useState(false)

  const selected = useMemo(
    () => items.find((item) => item.card.id === openId)?.card ?? null,
    [items, openId],
  )
  /**
   * 设定提议卡「收下勾选的」（卡片助手 C2）：勾中的几格合进这个角色已有的设定，
   * 其余格原样保留，再走角色页自己的更新。
   */
  const { update } = characters
  const applyProfile = useCallback(
    async (
      characterId: string,
      fields: readonly {
        field: AssistantOperatorCharacterProfileField
        text: string
      }[],
    ) => {
      const card = flatCards.find((item) => item.id === characterId)
      if (!card) return false
      const persona = {
        identity: '',
        behavior: '',
        speech: '',
        backstory: '',
        catchphrases: [],
        scenario: '',
        opening: '',
        examples: [],
        ...card.persona,
      }
      // 「一句外观」住在角色卡的 `description` 上，其余几格在设定里（S14 起多了 look）。
      let description: string | undefined
      for (const { field, text } of fields) {
        if (field === 'look') description = text
        else persona[field] = text
      }
      return update(characterId, {
        persona,
        ...(description !== undefined ? { description } : {}),
      })
    },
    [flatCards, update],
  )
  /**
   * 候选图卡「挂上勾选的」（卡片助手 C3）：图都已在素材库里，追加到这个角色的参考槽
   * （已在卡上的不重复挂，满了就停），返回挂上了几张。
   */
  const attachImages = useCallback(
    async (
      characterId: string,
      images: readonly {
        url: string
        generationId: string
        origin: 'upload' | 'generation'
      }[],
    ) => {
      const card = flatCards.find((item) => item.id === characterId)
      if (!card) return null
      const slots = appendSlotSources(card.referenceSlots, images)
      const added = slots.length - card.referenceSlots.length
      if (added === 0) return null
      const ok = await update(characterId, { referenceSlots: slots })
      return ok ? added : null
    },
    [flatCards, update],
  )
  /** 卡片助手（第五张脸）：读这页上有谁 + 打开着的那一位。 */
  const operatorHost = useCardsOperatorHost({
    cards: flatCards,
    openId: selected?.id ?? null,
    applyProfile,
    attachImages,
  })

  const openCharacter = useCallback((id: string) => {
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
      // 叠在上面的弹层（素材库选择器、用她菜单）与正在改的那一格（Esc = 放弃这次改动）
      // 已经处理掉的 Esc 不再收详情。
      if (event.defaultPrevented) return
      if (event.key !== 'Escape') return
      if (drafting) setDrafting(false)
      else if (selected) closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDetail, drafting, selected])

  /** 草稿的名字写好了：这才建卡（只有名字，⛔ 不跑旧的上传 + 分析），建好直接打开她。 */
  const createFromDraft = async (name: string) => {
    const card = await characters.create({ name, sourceImages: [] })
    if (!card) return false
    setDrafting(false)
    openCharacter(card.id)
    return true
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

  /** 手机上收成一颗圆形 ＋（字留给读屏），桌面照旧带字。 */
  const newCharacterButton = (
    <Button
      type="button"
      aria-label={t('newCharacter')}
      className="shrink-0 rounded-full max-sm:size-9 max-sm:px-0"
      onClick={() => setDrafting(true)}
    >
      <Plus className="size-4" />
      <span className="max-sm:sr-only">{t('newCharacter')}</span>
    </Button>
  )

  return (
    <StudioOperatorHostProvider host={operatorHost}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* ⚠ 不等旧的一行退场（AnimatePresence mode="wait" 的退场完成靠 rAF，后台标签页
          冻结时整行卡在旧内容上）：换 key 即换，新的一行淡入上移。 */}
        <motion.div
          key={
            drafting ? 'draft' : selected ? `detail:${selected.id}` : 'overview'
          }
          initial={enter}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: DURATION.base, ease: EASE_STANDARD }
          }
          className={cn(
            ROW_CLASS,
            // 总览在手机上是两行（搜索在第二行、满宽）：头像的让位只给第一行，由那一行
            // 右端的按钮自己留（`CharacterOverviewHeader`），⛔ 不压窄第二行的搜索框。
            selected || drafting
              ? !operatorHost.open && ROW_AVATAR_GAP_CLASS
              : [
                  'max-sm:h-auto max-sm:flex-wrap max-sm:gap-y-3',
                  !operatorHost.open && 'sm:pr-12',
                ],
          )}
        >
          {drafting ? (
            <CharacterDetailHeader
              card={null}
              onBack={() => setDrafting(false)}
            />
          ) : selected ? (
            <CharacterDetailHeader card={selected} onBack={closeDetail} />
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
            inert={selected !== null || drafting}
            animate={{ opacity: selected || drafting ? 0 : 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : selected || drafting
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
                    onClick={() => setDrafting(true)}
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
          {drafting ? (
            <motion.div
              key="draft"
              initial={enter}
              animate={{ opacity: 1, y: 0, transition: enterTransition }}
              className="absolute inset-0 bg-background"
            >
              <CharacterDraftBody onCreate={createFromDraft} />
            </motion.div>
          ) : null}
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
                onUpdate={(data) => characters.update(detailCard.id, data)}
                onDelete={() => deleteCharacter(detailCard.id)}
              />
            </motion.div>
          ) : null}
        </div>
      </div>

      <StudioOperatorDock />
    </StudioOperatorHostProvider>
  )
}
