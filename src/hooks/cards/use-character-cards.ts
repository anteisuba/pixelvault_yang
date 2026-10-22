'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
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
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import {
  listCharacterCardsAPI,
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
  makeCardCacheKey,
  readCardCache,
  writeCardCache,
} from '@/lib/card-cache'
import { deferEffectTask } from '@/lib/defer-effect-task'

const CHARACTER_CARDS_CACHE_KEY = makeCardCacheKey('character')

/** 文件 → 纯 base64（不带数据地址前缀；类型由 `tavernCardMime` 另给）。读不了 `null`。 */
function readFileBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      const comma = url.indexOf(',')
      resolve(comma >= 0 ? url.slice(comma + 1) : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

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
  // Seed from the module-level cache so repeated CardDrawer opens render
  // instantly. Mirrors `useCardManager` for style/background cards.
  const [cards, setCards] = useState<CharacterCardRecord[]>(
    () => readCardCache<CharacterCardRecord[]>(CHARACTER_CARDS_CACHE_KEY) ?? [],
  )
  const [activeCardIds, setActiveIds] = useState<string[]>([])
  const [imagePicks, setImagePicksState] = useState<
    Record<string, readonly CharacterImagePick[]>
  >({})
  const [lookIds, setLookIds] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(
    () =>
      readCardCache<CharacterCardRecord[]>(CHARACTER_CARDS_CACHE_KEY) ===
      undefined,
  )
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Toasts')
  const tErrors = useTranslations('Errors')

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

  const fetchCards = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setIsLoading(true)
      setError(null)
      const response = await listCharacterCardsAPI()
      if (response.success && response.data) {
        setCards(response.data)
        writeCardCache(CHARACTER_CARDS_CACHE_KEY, response.data)
      } else {
        setError(response.error ?? t('characterCardLoadFailed'))
      }
      if (!opts?.silent) setIsLoading(false)
    },
    [t],
  )

  useEffect(() => {
    const hasCached =
      readCardCache<CharacterCardRecord[]>(CHARACTER_CARDS_CACHE_KEY) !==
      undefined
    return deferEffectTask(() => {
      // Cache hit → silent SWR refresh; cache miss → visible loading.
      void fetchCards({ silent: hasCached })
    })
  }, [fetchCards])

  const create = useCallback(
    async (
      data: CreateCharacterCardRequest,
    ): Promise<CharacterCardRecord | null> => {
      const response = await createCharacterCardAPI(data)
      if (response.success && response.data) {
        setError(null)
        const newCard = response.data
        setCards((prev) => {
          const next = [newCard, ...prev]
          writeCardCache(CHARACTER_CARDS_CACHE_KEY, next)
          return next
        })
        toast.success(t('characterCardCreated'))
        return newCard
      }
      const msg = response.error ?? t('characterCardCreateFailed')
      setError(msg)
      toast.error(msg)
      return null
    },
    [t],
  )

  /** 导入那两条（文件 / 卡库）收尾同一套：插到最前、toast 名字；失败说人话。 */
  const settleImport = useCallback(
    (
      response: Awaited<ReturnType<typeof importTavernCardAPI>>,
    ): CharacterCardRecord | null => {
      if (response.success && response.data) {
        setError(null)
        const newCard = response.data
        setCards((prev) => {
          const next = [newCard, ...prev]
          writeCardCache(CHARACTER_CARDS_CACHE_KEY, next)
          return next
        })
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
      if (file.size > TAVERN_CARD.MAX_FILE_BYTES) {
        toast.error(tErrors('tavernCard.tooLarge'))
        return null
      }
      const base64 = await readFileBase64(file)
      if (base64 === null) {
        toast.error(t('characterCardImportFailed'))
        return null
      }
      return settleImport(
        await importTavernCardAPI({
          fileName: file.name.slice(0, TAVERN_CARD.FILE_NAME_MAX_LENGTH),
          data: `data:${mime};base64,${base64}`,
        }),
      )
    },
    [settleImport, t, tErrors],
  )

  const importChub = useCallback(
    async (fullPath: string): Promise<CharacterCardRecord | null> =>
      settleImport(await importChubCardAPI({ fullPath })),
    [settleImport],
  )

  /** 写请求回来的整个角色换进手里那份。 */
  const replaceCard = useCallback((updated: CharacterCardRecord) => {
    setCards((prev) => {
      const next = prev.map((card) => (card.id === updated.id ? updated : card))
      writeCardCache(CHARACTER_CARDS_CACHE_KEY, next)
      return next
    })
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
      const msg = response.error ?? t('characterCardUpdateFailed')
      setError(msg)
      toast.error(msg)
      return false
    },
    [replaceCard, t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await deleteCharacterCardAPI(id)
      if (response.success) {
        setError(null)
        setCards((prev) => {
          const next = prev.filter((c) => c.id !== id)
          writeCardCache(CHARACTER_CARDS_CACHE_KEY, next)
          return next
        })
        // Remove from active selection（连同她挑的图、选的造型）
        setActiveIds((prev) => prev.filter((cid) => cid !== id))
        setImagePicksState((prev) => withoutKey(prev, id))
        setLookIds((prev) => withoutKey(prev, id))
        toast.success(t('characterCardDeleted'))
        return true
      }
      const msg = response.error ?? t('characterCardDeleteFailed')
      setError(msg)
      toast.error(msg)
      return false
    },
    [t],
  )

  const duplicate = useCallback(
    async (
      card: CharacterCardRecord,
      name: string,
    ): Promise<CharacterCardRecord | null> => {
      const response = await duplicateCharacterCardAPI(card.id, name)
      if (!response.success || !response.data) {
        toast.error(response.error ?? t('characterCardCreateFailed'))
        return null
      }
      const copy = response.data
      setCards((prev) => {
        const next = [copy, ...prev]
        writeCardCache(CHARACTER_CARDS_CACHE_KEY, next)
        return next
      })
      toast.success(t('characterCardDuplicated', { name }))
      return copy
    },
    [t],
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
    remove,
    createLook,
    updateLook,
    removeLook,
    duplicate,
    refresh: fetchCards,
  }
}
