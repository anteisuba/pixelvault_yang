'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type {
  CharacterCardRecord,
  CharacterImagePick,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
} from '@/types'
import { CHARACTER_CARD } from '@/constants/cards/character-card'
import {
  listCharacterCardsAPI,
  createCharacterCardAPI,
  updateCharacterCardAPI,
  deleteCharacterCardAPI,
} from '@/lib/api-client'
import {
  makeCardCacheKey,
  readCardCache,
  writeCardCache,
} from '@/lib/card-cache'
import { deferEffectTask } from '@/lib/defer-effect-task'

const CHARACTER_CARDS_CACHE_KEY = makeCardCacheKey('character')

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
  /** Find a card (root or variant) by ID from the tree */
  findCard: (id: string) => CharacterCardRecord | null
  /** Get all currently active cards as records */
  activeCards: CharacterCardRecord[]
  create: (
    data: CreateCharacterCardRequest,
  ) => Promise<CharacterCardRecord | null>
  update: (id: string, data: UpdateCharacterCardRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
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
  const [isLoading, setIsLoading] = useState(
    () =>
      readCardCache<CharacterCardRecord[]>(CHARACTER_CARDS_CACHE_KEY) ===
      undefined,
  )
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations('Toasts')

  // ─── Find card in tree ───────────────────────────────────────

  const findCard = useCallback(
    (id: string): CharacterCardRecord | null => {
      for (const card of cards) {
        if (card.id === id) return card
        const variant = card.variants.find((v) => v.id === id)
        if (variant) return variant
      }
      return null
    },
    [cards],
  )

  // ─── Active cards resolved ──────────────────────────────────

  const activeCards = activeCardIds
    .map((id) => findCard(id))
    .filter((c): c is CharacterCardRecord => c !== null)

  // ─── Toggle selection ───────────────────────────────────────

  /** 换了在场的角色就把不在场的那几位挑的图一起清掉。 */
  const setActiveCardIds = useCallback((ids: string[]) => {
    setActiveIds(ids)
    setImagePicksState((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([cardId]) => ids.includes(cardId)),
      ),
    )
  }, [])

  const toggleCardSelection = useCallback((id: string) => {
    setActiveIds((prev) => {
      if (prev.includes(id)) {
        setImagePicksState((prev) => withoutKey(prev, id))
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
          const next = newCard.parentId
            ? // Variant created — add to parent's variants array
              prev.map((c) =>
                c.id === newCard.parentId
                  ? { ...c, variants: [newCard, ...c.variants] }
                  : c,
              )
            : // Root card created
              [newCard, ...prev]
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

  const update = useCallback(
    async (id: string, data: UpdateCharacterCardRequest): Promise<boolean> => {
      const response = await updateCharacterCardAPI(id, data)
      if (response.success && response.data) {
        setError(null)
        const updated = response.data
        setCards((prev) => {
          // Try root-level update
          const idx = prev.findIndex((c) => c.id === id)
          let next: CharacterCardRecord[]
          if (idx >= 0) {
            next = [...prev]
            next[idx] = updated
          } else {
            // Must be a variant — update inside parent
            next = prev.map((c) => ({
              ...c,
              variants: c.variants.map((v) => (v.id === id ? updated : v)),
            }))
          }
          writeCardCache(CHARACTER_CARDS_CACHE_KEY, next)
          return next
        })
        toast.success(t('characterCardUpdated'))
        return true
      }
      const msg = response.error ?? t('characterCardUpdateFailed')
      setError(msg)
      toast.error(msg)
      return false
    },
    [t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const response = await deleteCharacterCardAPI(id)
      if (response.success) {
        setError(null)
        // Remove from root or from parent's variants
        setCards((prev) => {
          // Try root-level first
          const filtered = prev.filter((c) => c.id !== id)
          const next =
            filtered.length < prev.length
              ? filtered
              : // Must be a variant — remove from parent
                prev.map((c) => ({
                  ...c,
                  variants: c.variants.filter((v) => v.id !== id),
                }))
          writeCardCache(CHARACTER_CARDS_CACHE_KEY, next)
          return next
        })
        // Remove from active selection（连同她挑的图）
        setActiveIds((prev) => prev.filter((cid) => cid !== id))
        setImagePicksState((prev) => withoutKey(prev, id))
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
    findCard,
    activeCards,
    create,
    update,
    remove,
    refresh: fetchCards,
  }
}
