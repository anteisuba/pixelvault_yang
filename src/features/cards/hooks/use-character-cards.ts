'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type {
  CharacterCardRecord,
  CharacterImagePick,
  CreateCharacterCardRequest,
  CreateCharacterLookRequest,
  UpdateCharacterCardRequest,
  UpdateCharacterLookRequest,
} from '@/types'
import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type { AppLocale } from '@/i18n/routing'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import {
  createCharacterCardAPI,
  createCharacterLookAPI,
  deleteCharacterLookAPI,
  duplicateCharacterCardAPI,
  importChubCardAPI,
  importTavernCardAPI,
  updateCharacterCardAPI,
  updateCharacterLookAPI,
  deleteCharacterCardAPI,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { tavernCardMime } from '@/lib/tavern-card'
import {
  characterCardsQuery,
  refreshCharacterCards,
  updateCharacterCardsCache,
} from '@/lib/character-cards-query'
import { queryClient } from '@/lib/query-client'
import { useErrorText } from '@/hooks/use-error-text'

const NO_CARDS: CharacterCardRecord[] = []

function withoutKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

export interface UseCharacterCardsReturn {
  cards: CharacterCardRecord[]
  isLoading: boolean
  error: string | null
  /** @deprecated Use activeCardIds instead */
  activeCardId: string | null
  /** @deprecated Use toggleCardSelection / setActiveCardIds instead */
  setActiveCardId: (id: string | null) => void
  /** Currently selected card IDs (multi-select) */
  activeCardIds: string[]
  /** Set all active card IDs at once */
  setActiveCardIds: (ids: string[]) => void
  /** Toggle a single card's selection state */
  toggleCardSelection: (id: string) => void
  /**
   * 每个在场角色**挑了哪几张**（工作台「卡片」弹层，owner 09-27）。没有键 = 没挑，
   * 出图时卡片总线自动排。
   */
  imagePicks: Readonly<Record<string, readonly CharacterImagePick[]>>
  /**
   * 设一个角色挑的图：挑了至少一张 = 她在场；一张都不挑 = 她不在场。
   */
  setImagePicks: (id: string, picks: readonly CharacterImagePick[]) => void
  /**
   * 每个在场角色用哪套造型（角色④，工作台角色胶囊上切）。没有键 = 默认造型。
   */
  lookIds: Readonly<Record<string, string>>
  /** 切一个角色的造型：挑的图属于原来那套，一起清掉。 */
  setLookId: (id: string, lookId: string | null) => void
  findCard: (id: string) => CharacterCardRecord | null
  /** Get all currently active cards as records */
  activeCards: CharacterCardRecord[]
  create: (
    data: CreateCharacterCardRequest,
  ) => Promise<CharacterCardRecord | null>
  /** 导入一张酒馆卡（PNG / JSON）建成角色卡；失败已 toast，返回 `null`。 */
  importTavern: (file: File) => Promise<CharacterCardRecord | null>
  /** 卡库里的一张 chub 卡（`作者/卡名`）建成角色卡；失败已 toast，返回 `null`。 */
  importChub: (fullPath: string) => Promise<CharacterCardRecord | null>
  update: (id: string, data: UpdateCharacterCardRequest) => Promise<boolean>
  /** 库里收藏 / 取消收藏：先在界面上翻过去，失败翻回来并 toast。 */
  toggleFavorite: (id: string) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  /** 加一套造型；成功返回新造型 id，失败已 toast，返回 `null`。 */
  createLook: (
    cardId: string,
    data: CreateCharacterLookRequest,
  ) => Promise<string | null>
  /** 改一套造型（名字 · 外观 · 标签 · 图 · 设为默认）；失败已 toast。 */
  updateLook: (
    cardId: string,
    lookId: string,
    data: UpdateCharacterLookRequest,
  ) => Promise<boolean>
  /** 删一套造型（最后一套删不掉）；失败已 toast。 */
  removeLook: (cardId: string, lookId: string) => Promise<boolean>
  /**
   * 复制一位（手机长按菜单「复制」）：名字换新，设定、标签、全部造型和她收的 LoRA 都带上，
   * 酒馆原样存的那几格不带。新卡排最前；失败已 toast，返回 `null`。
   */
  duplicate: (
    card: CharacterCardRecord,
    name: string,
  ) => Promise<CharacterCardRecord | null>
  refresh: () => Promise<void>
}

export function useCharacterCards(): UseCharacterCardsReturn {
  // 列表住共用查询（`characterCardsQuery`）：切页回来先给手里那份、过期才后台对一遍，
  // 七个挂载点只拉一次。在场 / 挑图 / 造型是这一处自己的选择，照旧留本地。
  const query = useQuery(characterCardsQuery, queryClient)
  const cards = query.data ?? NO_CARDS
  const [activeCardIds, setActiveIds] = useState<string[]>([])
  const [imagePicks, setImagePicksState] = useState<
    Record<string, readonly CharacterImagePick[]>
  >({})
  const [lookIds, setLookIds] = useState<Record<string, string>>({})
  /** 写请求失败的那句；列表拉不下来的那句从查询读。 */
  const [mutationError, setError] = useState<string | null>(null)
  const t = useTranslations('Toasts')
  const tErrors = useTranslations('Errors')
  const errText = useErrorText()
  const locale = useLocale() as AppLocale
  // 只有一张都没拿到过才算「加载中」；有手里那份时后台对一遍不转圈。
  const isLoading = query.isPending
  const error =
    mutationError ??
    (query.isError
      ? errText.thrown(query.error, t('characterCardLoadFailed'))
      : null)

  const findCard = useCallback(
    (id: string): CharacterCardRecord | null =>
      cards.find((card) => card.id === id) ?? null,
    [cards],
  )

  // ─── Active cards resolved ──────────────────────────────────

  const activeCards = activeCardIds
    .map((id) => findCard(id))
    .filter((c): c is CharacterCardRecord => c !== null)

  // ─── Toggle selection ───────────────────────────────────────

  /** 换了在场的角色就把不在场的那几位挑的图、选的造型一起清掉。 */
  const setActiveCardIds = useCallback((ids: string[]) => {
    setActiveIds(ids)
    const keep = <T>(prev: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(prev).filter(([cardId]) => ids.includes(cardId)),
      )
    setImagePicksState(keep)
    setLookIds(keep)
  }, [])

  const toggleCardSelection = useCallback((id: string) => {
    setActiveIds((prev) => {
      if (prev.includes(id)) {
        setImagePicksState((prev) => withoutKey(prev, id))
        setLookIds((prev) => withoutKey(prev, id))
        return prev.filter((cid) => cid !== id)
      }
      if (prev.length >= CHARACTER_CARD.MAX_ACTIVE_CARDS) {
        return prev
      }
      return [...prev, id]
    })
  }, [])

  const setImagePicks = useCallback(
    (id: string, picks: readonly CharacterImagePick[]) => {
      if (picks.length === 0) {
        setActiveIds((prev) => prev.filter((cid) => cid !== id))
        setImagePicksState((prev) => withoutKey(prev, id))
        return
      }
      setActiveIds((prev) =>
        prev.includes(id) || prev.length >= CHARACTER_CARD.MAX_ACTIVE_CARDS
          ? prev
          : [...prev, id],
      )
      setImagePicksState((prev) => ({ ...prev, [id]: picks }))
    },
    [],
  )

  const setLookId = useCallback((id: string, lookId: string | null) => {
    setLookIds((prev) =>
      lookId ? { ...prev, [id]: lookId } : withoutKey(prev, id),
    )
    setImagePicksState((prev) => withoutKey(prev, id))
  }, [])

  // ─── Backward compat: single card setter ────────────────────

  const setActiveCardId = useCallback(
    (id: string | null) => {
      setActiveCardIds(id ? [id] : [])
    },
    [setActiveCardIds],
  )

  const activeCardId = activeCardIds[0] ?? null

  // ─── Card CRUD ────────────────────────────────────────────────

  const create = useCallback(
    async (
      data: CreateCharacterCardRequest,
    ): Promise<CharacterCardRecord | null> => {
      const response = await createCharacterCardAPI(data)
      if (response.success && response.data) {
        setError(null)
        const newCard = response.data
        updateCharacterCardsCache((prev) => [newCard, ...prev])
        toast.success(t('characterCardCreated'))
        return newCard
      }
      const msg = errText.api(response, t('characterCardCreateFailed'))
      setError(msg)
      toast.error(msg)
      return null
    },
    [errText, t],
  )

  /** 导入那两条（文件 / 卡库）收尾同一套：插到最前、toast 名字；失败说人话。 */
  const settleImport = useCallback(
    (
      response: Awaited<ReturnType<typeof importTavernCardAPI>>,
    ): CharacterCardRecord | null => {
      if (response.success && response.data) {
        setError(null)
        const newCard = response.data
        updateCharacterCardsCache((prev) => [newCard, ...prev])
        toast.success(t('characterCardImported', { name: newCard.name }))
        return newCard
      }
      const msg = getApiErrorMessage(
        tErrors,
        response,
        t('characterCardImportFailed'),
      )
      setError(msg)
      toast.error(msg)
      return null
    },
    [t, tErrors],
  )

  const importTavern = useCallback(
    async (file: File): Promise<CharacterCardRecord | null> => {
      const mime = tavernCardMime(file)
      if (!mime) {
        toast.error(tErrors('tavernCard.notACard'))
        return null
      }
      if (file.size > TAVERN_CARD.UPLOAD_MAX_BYTES) {
        toast.error(tErrors('tavernCard.tooLarge'))
        return null
      }
      return settleImport(
        await importTavernCardAPI(
          file,
          mime,
          file.name.slice(0, TAVERN_CARD.FILE_NAME_MAX_LENGTH),
          locale,
        ),
      )
    },
    [settleImport, tErrors, locale],
  )

  const importChub = useCallback(
    async (fullPath: string): Promise<CharacterCardRecord | null> =>
      settleImport(await importChubCardAPI({ fullPath, locale })),
    [settleImport, locale],
  )

  /** 写请求回来的整个角色换进手里那份。 */
  const replaceCard = useCallback((updated: CharacterCardRecord) => {
    updateCharacterCardsCache((prev) =>
      prev.map((card) => (card.id === updated.id ? updated : card)),
    )
  }, [])

  const update = useCallback(
    async (id: string, data: UpdateCharacterCardRequest): Promise<boolean> => {
      const response = await updateCharacterCardAPI(id, data)
      if (response.success && response.data) {
        setError(null)
        replaceCard(response.data)
        toast.success(t('characterCardUpdated'))
        return true
      }
      const msg = errText.api(response, t('characterCardUpdateFailed'))
      setError(msg)
      toast.error(msg)
      return false
    },
    [errText, replaceCard, t],
  )

  const setFavorite = useCallback((id: string, isFavorite: boolean) => {
    updateCharacterCardsCache((prev) =>
      prev.map((card) => (card.id === id ? { ...card, isFavorite } : card)),
    )
  }, [])
  /**
   * ⚠ ⛔ 拿回包整张换掉：单张回包的 `generationCount` 恒为 0（只在列表里算），换了
   * 格子上的「N 张」就清零了 —— 只翻这一格。
   */
  const toggleFavorite = useCallback(
    async (id: string): Promise<boolean> => {
      const card = cards.find((item) => item.id === id)
      if (!card) return false
      const next = !card.isFavorite
      setFavorite(id, next)
      const response = await updateCharacterCardAPI(id, { isFavorite: next })
      if (response.success) return true
      setFavorite(id, !next)
      toast.error(errText.api(response, t('characterCardUpdateFailed')))
      return false
    },
    [errText, cards, setFavorite, t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await deleteCharacterCardAPI(id)
      if (response.success) {
        setError(null)
        updateCharacterCardsCache((prev) => prev.filter((c) => c.id !== id))
        // Remove from active selection（连同她挑的图、选的造型）
        setActiveIds((prev) => prev.filter((cid) => cid !== id))
        setImagePicksState((prev) => withoutKey(prev, id))
        setLookIds((prev) => withoutKey(prev, id))
        toast.success(t('characterCardDeleted'))
        return true
      }
      const msg = errText.api(response, t('characterCardDeleteFailed'))
      setError(msg)
      toast.error(msg)
      return false
    },
    [errText, t],
  )

  const duplicate = useCallback(
    async (
      card: CharacterCardRecord,
      name: string,
    ): Promise<CharacterCardRecord | null> => {
      const response = await duplicateCharacterCardAPI(card.id, name)
      if (!response.success || !response.data) {
        toast.error(errText.api(response, t('characterCardCreateFailed')))
        return null
      }
      const copy = response.data
      updateCharacterCardsCache((prev) => [copy, ...prev])
      toast.success(t('characterCardDuplicated', { name }))
      return copy
    },
    [errText, t],
  )

  // ─── 造型（角色④）───────────────────────────────────────────

  const createLook = useCallback(
    async (
      cardId: string,
      data: CreateCharacterLookRequest,
    ): Promise<string | null> => {
      const response = await createCharacterLookAPI(cardId, data)
      if (!response.success || !response.data) {
        toast.error(
          getApiErrorMessage(tErrors, response, t('characterCardUpdateFailed')),
        )
        return null
      }
      const before = new Set(findCard(cardId)?.looks.map((look) => look.id))
      replaceCard(response.data)
      return (
        response.data.looks.find((look) => !before.has(look.id))?.id ?? null
      )
    },
    [findCard, replaceCard, t, tErrors],
  )

  const updateLook = useCallback(
    async (
      cardId: string,
      lookId: string,
      data: UpdateCharacterLookRequest,
    ): Promise<boolean> => {
      const response = await updateCharacterLookAPI(lookId, data)
      if (!response.success || !response.data) {
        toast.error(
          getApiErrorMessage(tErrors, response, t('characterCardUpdateFailed')),
        )
        return false
      }
      replaceCard(response.data)
      return true
    },
    [replaceCard, t, tErrors],
  )

  const removeLook = useCallback(
    async (cardId: string, lookId: string): Promise<boolean> => {
      const response = await deleteCharacterLookAPI(lookId)
      if (!response.success) {
        toast.error(
          getApiErrorMessage(tErrors, response, t('characterCardUpdateFailed')),
        )
        return false
      }
      // 与服务端同一条规则：删的是默认，排在最前的那套接任。
      const card = findCard(cardId)
      if (card) {
        const looks = card.looks.filter((look) => look.id !== lookId)
        const removed = card.looks.find((look) => look.id === lookId)
        replaceCard({
          ...card,
          looks:
            removed?.isDefault && looks[0]
              ? [{ ...looks[0], isDefault: true }, ...looks.slice(1)]
              : looks,
        })
      }
      setLookIds((prev) =>
        prev[cardId] === lookId ? withoutKey(prev, cardId) : prev,
      )
      return true
    },
    [findCard, replaceCard, t, tErrors],
  )

  return {
    cards,
    isLoading,
    error,
    activeCardId,
    setActiveCardId,
    activeCardIds,
    setActiveCardIds,
    toggleCardSelection,
    imagePicks,
    setImagePicks,
    lookIds,
    setLookId,
    findCard,
    activeCards,
    create,
    importTavern,
    importChub,
    update,
    toggleFavorite,
    remove,
    createLook,
    updateLook,
    removeLook,
    duplicate,
    refresh: refreshCharacterCards,
  }
}
