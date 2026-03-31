'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type {
  CharacterCardRecord,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
  RefineCharacterCardRequest,
  RefineGenerationResult,
} from '@/types'
import { CHARACTER_CARD } from '@/constants/character-card'
import {
  listCharacterCardsAPI,
  createCharacterCardAPI,
  updateCharacterCardAPI,
  deleteCharacterCardAPI,
  refineCharacterCardAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'

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
  refine: (
    id: string,
    params: RefineCharacterCardRequest,
  ) => Promise<{
    results: RefineGenerationResult[]
    improved: boolean
    newStabilityScore: number | null
  } | null>
  isRefining: boolean
}

export function useCharacterCards(): UseCharacterCardsReturn {
  const [cards, setCards] = useState<CharacterCardRecord[]>([])
  const [activeCardIds, setActiveCardIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefining, setIsRefining] = useState(false)
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

  const toggleCardSelection = useCallback((id: string) => {
    setActiveCardIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((cid) => cid !== id)
      }
      if (prev.length >= CHARACTER_CARD.MAX_ACTIVE_CARDS) {
        return prev
      }
      return [...prev, id]
    })
  }, [])

  // ─── Backward compat: single card setter ────────────────────

  const setActiveCardId = useCallback((id: string | null) => {
    setActiveCardIds(id ? [id] : [])
  }, [])

  const activeCardId = activeCardIds[0] ?? null

  // ─── Card CRUD ────────────────────────────────────────────────

  const fetchCards = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const response = await listCharacterCardsAPI()
    if (response.success && response.data) {
      setCards(response.data)
    } else {
      setError(response.error ?? 'Failed to load character cards')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    return deferEffectTask(() => {
      void fetchCards()
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
        if (newCard.parentId) {
          // Variant created — add to parent's variants array
          setCards((prev) =>
            prev.map((c) =>
              c.id === newCard.parentId
                ? { ...c, variants: [newCard, ...c.variants] }
                : c,
            ),
          )
        } else {
          // Root card created
          setCards((prev) => [newCard, ...prev])
        }
        toast.success(t('characterCardCreated'))
        return newCard
      }
      const msg = response.error ?? 'Failed to create character card'
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
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = updated
            return next
          }
          // Must be a variant — update inside parent
          return prev.map((c) => ({
            ...c,
            variants: c.variants.map((v) => (v.id === id ? updated : v)),
          }))
        })
        toast.success(t('characterCardUpdated'))
        return true
      }
      const msg = response.error ?? 'Failed to update character card'
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
          if (filtered.length < prev.length) return filtered
          // Must be a variant — remove from parent
          return prev.map((c) => ({
            ...c,
            variants: c.variants.filter((v) => v.id !== id),
          }))
        })
        // Remove from active selection
        setActiveCardIds((prev) => prev.filter((cid) => cid !== id))
        toast.success(t('characterCardDeleted'))
        return true
      }
      const msg = response.error ?? 'Failed to delete character card'
      setError(msg)
      toast.error(msg)
      return false
    },
    [t],
  )

  // ─── Refine ──────────────────────────────────────────────────

  const refine = useCallback(
    async (
      id: string,
      params: RefineCharacterCardRequest,
    ): Promise<{
      results: RefineGenerationResult[]
      improved: boolean
      newStabilityScore: number | null
    } | null> => {
      setIsRefining(true)
      setError(null)
      const response = await refineCharacterCardAPI(id, params)
      setIsRefining(false)

      if (response.success && response.data) {
        // Refresh the card list to get updated status/score
        await fetchCards()
        if (response.data.improved) {
          toast.success(t('characterCardStable'))
        }
        return response.data
      }

      const msg = response.error ?? 'Refinement failed'
      setError(msg)
      toast.error(msg)
      return null
    },
    [fetchCards, t],
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
    findCard,
    activeCards,
    create,
    update,
    remove,
    refresh: fetchCards,
    refine,
    isRefining,
  }
}
