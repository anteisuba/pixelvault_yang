'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import {
  CHARACTER_PAGE_TABS,
  CHUB_LIBRARY,
  type CharacterPageTab,
} from '@/constants/cards/chub-library'
import { DURATION, DURATION_MS, EASE_STANDARD } from '@/constants/motion'
import type { AssistantOperatorCharacterProfileField } from '@/types/assistant-operator'
import { Copy, Pencil, Plus, Trash2, Upload } from '@/components/icons'
import { DropOverlay } from '@/components/ui/drop-overlay'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
} from '@/components/ui/responsive-menu'
import { Spinner } from '@/components/ui/spinner'
import { StudioOperatorBenchDock } from '@/components/business/studio/assistant-operator'
import { StudioLibraryAssistantAvatar } from '@/components/business/studio/shell/StudioLibraryOverlay'
import {
  CharacterDetailBody,
  CharacterDetailHeader,
  CharacterDraftBody,
} from '@/components/business/cards/CharacterDetail'
import { CharacterDetailDesk } from '@/components/business/cards/CharacterDetailDesk'
import { CharacterDetailSplit } from '@/components/business/cards/CharacterRecent'
import { CharacterLibrary } from '@/components/business/cards/CharacterLibrary'
import { CharacterPhoneBar } from '@/components/business/cards/CharacterPhoneBar'
import {
  CharacterOverview,
  CharacterOverviewHeader,
} from '@/components/business/cards/CharacterOverview'
import { StudioOperatorHostProvider } from '@/contexts/studio-operator-host'
import { useCardsOperatorHost } from '@/hooks/cards/use-cards-operator-host'
import {
  useLibraryChanged,
  useLibraryShowRequest,
  useReportLibraryItem,
} from '@/hooks/use-library-view'
import { appendSlotSources } from '@/hooks/cards/use-character-card-editor'
import { defaultLook } from '@/lib/card-bus'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useCharacterRecentActivity } from '@/hooks/cards/use-character-recent-activity'
import { useChubLibrary } from '@/hooks/cards/use-chub-library'
import { useIsMobile } from '@/hooks/use-mobile'
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
 * ⭐ 手机（iOS 稿 v16，owner 2026-10-16）：没有地台和白卡，总览顶上是吸住的磨砂胶囊
 *   （`CharacterPhoneBar`：分段 · 搜索 · ＋），地台那一行只在详情 / 草稿时出现；
 *   长按一张卡从底部升起「编辑 / 复制 / 删除」，删除走确认弹层。
 */

/**
 * 地台那一行（详情 = ‹ 角色 · 用她；⛔ 没有「编辑」键，详情上点哪改哪）。右边给助手头像留的位（36 头像 + 12 间距）只在面板收着时留：面板开着时
 * 头像在面板上方，这一行已经随白卡收窄，再留就是一块空。手机上头像同样在这一行右端（顶栏下 64，与图片台同一地台），一样要留。
 */
const ROW_CLASS = 'flex h-9 shrink-0 items-center gap-3'
const ROW_AVATAR_GAP_CLASS = 'pr-12'

export function CharacterRoster() {
  const t = useTranslations('CharacterRoster')
  const tDrop = useTranslations('DropZone')
  const characters = useCharacterCards()
  const reducedMotion = useReducedMotion() ?? false
  const isMobile = useIsMobile()
  const flatCards = characters.cards
  /** 桌面总览「最近」那几张卡（手机总览没有这一段）。 */
  const recentActivity = useCharacterRecentActivity(isMobile === false)
  /** 最左那颗助手头像（库整页里点它叫出 / 收回助手，对话从左边出来）。 */
  const assistantAvatar = <StudioLibraryAssistantAvatar />

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
  /** 详情里正看着的那套造型（`null` = 默认）：图片带、外观、标签和「用她 ▾」训练都跟它。 */
  const [detailLookId, setDetailLookId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  /** 「新角色」草稿开着（owner 09-28：直接进空详情页，名字写好才建卡）。 */
  const [drafting, setDrafting] = useState(false)
  /** 「我的角色 / 卡库」页签（`?tab=library` 直接开卡库）。 */
  const [tab, setTab] = useState<CharacterPageTab>(() =>
    searchParams.get(CHUB_LIBRARY.TAB_PARAM) === CHARACTER_PAGE_TABS.library
      ? CHARACTER_PAGE_TABS.library
      : CHARACTER_PAGE_TABS.roster,
  )
  const onLibrary = tab === CHARACTER_PAGE_TABS.library
  const library = useChubLibrary(onLibrary)
  /** 卡库里正在建成角色的那一张（一次一张）。 */
  const [libraryImporting, setLibraryImporting] = useState<string | null>(null)
  /** 手机长按的那一位（出「编辑 / 复制 / 删除」）与正在确认删除的那一位。 */
  const [pressedId, setPressedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /** 导入酒馆卡：选文件那一下 / 拖进总览那一下（附录J ⑥）。 */
  const importInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const selected = useMemo(
    () => flatCards.find((card) => card.id === openId) ?? null,
    [flatCards, openId],
  )
  // 助手认得出「这个角色」（库开着时报给它，`use-library-view`）。
  useReportLibraryItem(
    selected ? { kind: 'character', name: selected.name } : null,
  )
  /**
   * 设定提议卡「收下勾选的」（卡片助手 C2）：勾中的几格合进这个角色已有的设定，
   * 其余格原样保留，再走角色页自己的更新。
   */
  const { update, updateLook } = characters
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
        boundaries: '',
        backstory: '',
        catchphrases: [],
        moods: [],
        learnedPhrases: [],
        relationship: '',
        scenario: '',
        opening: '',
        examples: [],
        ...card.persona,
      }
      // 「一句外观」住在默认造型上（角色④），其余几格在设定里（S14 起多了 look）。
      let description: string | undefined
      for (const { field, text } of fields) {
        if (field === 'look') description = text
        else persona[field] = text
      }
      const look = defaultLook(card)
      const personaChanged = fields.some(({ field }) => field !== 'look')
      const personaOk = personaChanged
        ? await update(characterId, { persona })
        : true
      if (!personaOk || description === undefined || !look.id) return personaOk
      return updateLook(characterId, look.id, { description })
    },
    [flatCards, update, updateLook],
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
      // 挂到默认造型上（角色④）：卡片助手看的就是默认造型。
      const look = defaultLook(card)
      if (!look.id) return null
      const slots = appendSlotSources(look.referenceSlots, images)
      const added = slots.length - look.referenceSlots.length
      if (added === 0) return null
      const ok = await updateLook(characterId, look.id, {
        referenceSlots: slots,
      })
      return ok ? added : null
    },
    [flatCards, updateLook],
  )
  /** 卡片助手（第五张脸）：读这页上有谁 + 打开着的那一位。 */
  const operatorHost = useCardsOperatorHost({
    cards: flatCards,
    openId: selected?.id ?? null,
    applyProfile,
    attachImages,
    refresh: characters.refresh,
  })

  const openCharacter = useCallback((id: string) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setClosingId(null)
    setDetailLookId(null)
    setOpenId(id)
  }, [])
  // 助手改了角色库：名册重读（库叠层里这一页不当宿主，宿主那条 `libraryChanged` 够不着）。
  useLibraryChanged('cards', characters.refresh)
  // 助手翻给你看：按名字打开那一位（找不到就搜这个名字），或搜那个词。
  useLibraryShowRequest('cards', (show) => {
    setTab(CHARACTER_PAGE_TABS.roster)
    setDrafting(false)
    const target = show.itemName?.toLowerCase()
    const found = target
      ? flatCards.find((card) => card.name.toLowerCase() === target)
      : undefined
    if (show.search !== undefined || (target && !found))
      setQuery(show.search ?? show.itemName ?? '')
    if (found) openCharacter(found.id)
    else if (show.search !== undefined) setOpenId(null)
  })
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
    () => flatCards.find((card) => card.id === (openId ?? closingId)) ?? null,
    [closingId, flatCards, openId],
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
    const card = await characters.create({ name })
    if (!card) return false
    setDrafting(false)
    openCharacter(card.id)
    return true
  }

  /** 导入一张酒馆卡，建好直接打开她（一次一张：拖进来好几个只认第一个）。 */
  const importCard = async (file: File | undefined) => {
    if (!file || importing) return
    setImporting(true)
    const card = await characters.importTavern(file)
    setImporting(false)
    if (card) openCharacter(card.id)
  }
  /** 卡库里点「做成角色」：建好回到「我的角色」并打开她。 */
  const importFromLibrary = async (fullPath: string) => {
    if (libraryImporting) return
    setLibraryImporting(fullPath)
    const card = await characters.importChub(fullPath)
    setLibraryImporting(null)
    if (!card) return
    setTab(CHARACTER_PAGE_TABS.roster)
    openCharacter(card.id)
  }
  const isFileDrag = (event: React.DragEvent) =>
    event.dataTransfer.types.includes('Files')

  /** 删掉之后回总览。 */
  const deleteCharacter = async (id: string) => {
    const ok = await characters.remove(id)
    if (ok) closeDetail()
    return ok
  }
  const pressedCard = flatCards.find((card) => card.id === pressedId) ?? null
  const deletingCard = flatCards.find((card) => card.id === deletingId) ?? null

  /** 详情要的那一份（手机两栏与电脑页签同一份）。 */
  const detailProps = (card: (typeof flatCards)[number]) => ({
    card,
    lookId: detailLookId,
    onLookChange: setDetailLookId,
    onUpdate: (data: Parameters<typeof characters.update>[1]) =>
      characters.update(card.id, data),
    onCreateLook: (data: Parameters<typeof characters.createLook>[1]) =>
      characters.createLook(card.id, data),
    onUpdateLook: (
      lookId: string,
      data: Parameters<typeof characters.updateLook>[2],
    ) => characters.updateLook(card.id, lookId, data),
    onDeleteLook: (lookId: string) => characters.removeLook(card.id, lookId),
    onDelete: () => deleteCharacter(card.id),
  })

  /** 新的一层淡入并上移 8px；旧的一层淡出（原型「动画 2」）。 */
  const enter = reducedMotion ? false : { opacity: 0, y: 8 }
  const enterTransition = reducedMotion
    ? { duration: 0 }
    : { duration: DURATION.base, delay: DURATION.fast, ease: EASE_STANDARD }

  /** 选文件那颗隐藏的 input：桌面「导入酒馆卡」与手机 ＋ 菜单共用。 */
  const importFileInput = (
    <input
      ref={importInput}
      type="file"
      accept=".png,.json,image/png,application/json"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        void importCard(file)
      }}
    />
  )
  /** 桌面总览 = 书架（用户 10-25：照 #397 之前那版）：顶上一行（计数 · 搜索 · 导入 · 新角色），下面书架；详情 / 草稿照旧盖在上面。 */
  const deskOverview = !isMobile
  const newCharacterButton = (
    <Button
      type="button"
      className="shrink-0 rounded-full"
      onClick={() => setDrafting(true)}
    >
      <Plus className="size-4" />
      {t('newCharacter')}
    </Button>
  )
  const importButton = (
    <Button
      type="button"
      variant="secondary"
      title={t('importCardHint')}
      disabled={importing}
      className="shrink-0 rounded-full"
      onClick={() => importInput.current?.click()}
    >
      {importing ? <Spinner size="sm" /> : <Upload className="size-4" />}
      {t('importCard')}
    </Button>
  )

  return (
    <StudioOperatorHostProvider host={operatorHost}>
      {importFileInput}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* ⚠ 不等旧的一行退场（AnimatePresence mode="wait" 的退场完成靠 rAF，后台标签页
          冻结时整行卡在旧内容上）：换 key 即换，新的一行淡入上移。 */}
        {/* 手机总览不要这一行（顶上是滚动区里的胶囊），详情 / 草稿才有。 */}
        {isMobile ? <h1 className="sr-only">{t('title')}</h1> : null}
        {/* 总览不要这一行（手机顶上是滚动区里的胶囊，桌面是库骨架），详情 / 草稿才有。 */}
        {!selected && !drafting ? null : (
          <motion.div
            key={
              drafting
                ? 'draft'
                : selected
                  ? `detail:${selected.id}`
                  : 'overview'
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
              // 手机没有地台内边距：左边自己留 10、上边 4（与胶囊同一条中线）。
              'max-md:pl-2.5 max-md:pt-1',
              !operatorHost.open && ROW_AVATAR_GAP_CLASS,
            )}
          >
            {drafting ? (
              <CharacterDetailHeader
                lead={assistantAvatar}
                onBack={() => setDrafting(false)}
              />
            ) : selected ? (
              <CharacterDetailHeader
                lead={assistantAvatar}
                onBack={closeDetail}
              />
            ) : null}
          </motion.div>
        )}

        <div
          className={cn(
            // 总览和详情都直接画在库的白板上，⛔ 再套一张描边白卡（角色大项目 ①）。
            'relative min-h-0 flex-1 overflow-hidden bg-background',
          )}
          // 酒馆卡 PNG / JSON 拖进总览即导入（详情、草稿开着时不接）。
          onDragOver={(event) => {
            if (selected || drafting || onLibrary || !isFileDrag(event)) return
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) {
              return
            }
            setDragOver(false)
          }}
          onDrop={(event) => {
            if (selected || drafting || onLibrary || !isFileDrag(event)) return
            event.preventDefault()
            setDragOver(false)
            void importCard(event.dataTransfer.files[0])
          }}
        >
          <DropOverlay
            active={dragOver}
            label={tDrop('importCharacterCard')}
            className="rounded-2xl max-md:rounded-none"
          />
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
            className={
              deskOverview
                ? 'flex h-full flex-col overflow-y-auto pb-12'
                : 'h-full overflow-y-auto px-4 pb-12'
            }
          >
            {deskOverview ? (
              <div className="flex shrink-0 items-center gap-3 pb-5">
                <CharacterOverviewHeader
                  lead={assistantAvatar}
                  query={query}
                  onQueryChange={setQuery}
                  actions={
                    <>
                      {importButton}
                      {newCharacterButton}
                    </>
                  }
                />
              </div>
            ) : null}
            {isMobile ? (
              <CharacterPhoneBar
                tab={tab}
                onTabChange={setTab}
                query={onLibrary ? library.query : query}
                onQueryChange={onLibrary ? library.setQuery : setQuery}
                searchPlaceholder={
                  onLibrary
                    ? t('librarySearchPlaceholder')
                    : t('searchPlaceholder')
                }
                importing={importing}
                onNew={() => setDrafting(true)}
                onImport={() => importInput.current?.click()}
                reducedMotion={reducedMotion}
              />
            ) : null}
            {onLibrary && !deskOverview ? (
              <CharacterLibrary
                library={library}
                importingPath={libraryImporting}
                onImport={(fullPath) => void importFromLibrary(fullPath)}
              />
            ) : characters.isLoading ? (
              <div className="flex justify-center py-16">
                <Spinner size="lg" className="text-muted-foreground" />
              </div>
            ) : flatCards.length === 0 ? (
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
                cards={flatCards}
                reducedMotion={reducedMotion}
                onOpen={openCharacter}
                query={query}
                {...(isMobile
                  ? { onLongPress: setPressedId }
                  : { recent: recentActivity })}
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
              {isMobile ? (
                <CharacterDetailSplit
                  key={detailCard.id}
                  cardId={detailCard.id}
                  body={<CharacterDetailBody {...detailProps(detailCard)} />}
                />
              ) : (
                <CharacterDetailDesk
                  key={detailCard.id}
                  {...detailProps(detailCard)}
                />
              )}
            </motion.div>
          ) : null}
        </div>
      </div>

      {/* 手机长按一张卡：从底部升起（只有触屏会触发，桌面不挂 trigger 也就打不开）。 */}
      <ResponsiveMenu
        open={pressedCard !== null}
        onOpenChange={(open) => {
          if (!open) setPressedId(null)
        }}
      >
        <ResponsiveMenuContent
          label={t('phone.actions', { name: pressedCard?.name ?? '' })}
        >
          <ResponsiveMenuItem
            onSelect={() => {
              if (pressedCard) openCharacter(pressedCard.id)
            }}
          >
            <Pencil aria-hidden />
            {t('phone.edit')}
          </ResponsiveMenuItem>
          <ResponsiveMenuItem
            onSelect={() => {
              if (!pressedCard) return
              void characters.duplicate(
                pressedCard,
                t('phone.copyName', { name: pressedCard.name }),
              )
            }}
          >
            <Copy aria-hidden />
            {t('phone.duplicate')}
          </ResponsiveMenuItem>
          <ResponsiveMenuItem
            variant="destructive"
            onSelect={() => setDeletingId(pressedId)}
          >
            <Trash2 aria-hidden />
            {t('phone.delete')}
          </ResponsiveMenuItem>
        </ResponsiveMenuContent>
      </ResponsiveMenu>
      <ConfirmDialog
        open={deletingCard !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title={t('deleteCharacter')}
        description={t('deleteConfirm', { name: deletingCard?.name ?? '' })}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => {
          if (deletingCard) void characters.remove(deletingCard.id)
          setDeletingId(null)
        }}
      />

      <StudioOperatorBenchDock />
    </StudioOperatorHostProvider>
  )
}
