'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ARENA } from '@/constants/config'
import type { AspectRatio } from '@/constants/config'
import type {
  AdvancedParams,
  ArenaMatchRecord,
  ArenaModelSelection,
  EloUpdate,
} from '@/types'
import {
  createArenaMatchAPI,
  generateArenaEntryAPI,
  getArenaMatchAPI,
  submitArenaVoteAPI,
} from '@/lib/api-client'

type ArenaStep = 'idle' | 'creating' | 'generating' | 'voting' | 'revealed'

interface EntryProgress {
  modelId: string
  status: 'pending' | 'completed' | 'failed'
  error?: string
}

interface ArenaState {
  step: ArenaStep
  matchId: string | null
  match: ArenaMatchRecord | null
  eloUpdates: EloUpdate[]
  error: string | null
  entryProgress: EntryProgress[]
}

const INITIAL_STATE: ArenaState = {
  step: 'idle',
  matchId: null,
  match: null,
  eloUpdates: [],
  error: null,
  entryProgress: [],
}

export interface StartBattleInput {
  prompt: string
  aspectRatio: AspectRatio
  models?: ArenaModelSelection[]
  referenceImage?: string
  advancedParams?: AdvancedParams
}

export function useArena() {
  const [state, setState] = useState<ArenaState>(INITIAL_STATE)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling])

  const startBattle = useCallback(async (input: StartBattleInput) => {
    const models = input.models ?? []
    if (models.length < ARENA.MIN_MODELS_FOR_MATCH) return

    // Shuffle models for blind testing
    const shuffled = [...models].sort(() => Math.random() - 0.5)

    setState({
      step: 'creating',
      matchId: null,
      match: null,
      eloUpdates: [],
      error: null,
      entryProgress: shuffled.map((m) => ({
        modelId: m.modelId,
        status: 'pending',
      })),
    })

    // Step 1: Create match record (instant)
    const matchResult = await createArenaMatchAPI({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      referenceImage: input.referenceImage,
      advancedParams: input.advancedParams,
    })

    if (!matchResult.success || !matchResult.data) {
      setState((prev) => ({
        ...prev,
        step: 'idle',
        error: matchResult.error ?? 'Failed to create match',
      }))
      return
    }

    const matchId = matchResult.data.matchId

    setState((prev) => ({
      ...prev,
      step: 'generating',
      matchId,
    }))

    // Step 2: Fan out — generate all entries in parallel (each has own 240s timeout)
    const entryResults = await Promise.allSettled(
      shuffled.map(async (selection, index) => {
        const result = await generateArenaEntryAPI(matchId, {
          modelId: selection.modelId,
          apiKeyId: selection.apiKeyId,
          slotIndex: index,
          advancedParams: input.advancedParams,
        })

        // Update per-entry progress
        setState((prev) => ({
          ...prev,
          entryProgress: prev.entryProgress.map((ep) =>
            ep.modelId === selection.modelId
              ? {
                  ...ep,
                  status: result.success ? 'completed' : 'failed',
                  error: result.error,
                }
              : ep,
          ),
        }))

        if (!result.success) {
          throw new Error(result.error ?? 'Entry generation failed')
        }

        return result.data!
      }),
    )

    // Count successes
    const successCount = entryResults.filter(
      (r) => r.status === 'fulfilled',
    ).length

    if (successCount < ARENA.MIN_MODELS_FOR_MATCH) {
      const failedReasons = entryResults
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => r.reason?.message ?? 'Unknown error')
        .join('; ')

      setState((prev) => ({
        ...prev,
        step: 'idle',
        error: `Not enough models succeeded (${successCount}/${shuffled.length}). ${failedReasons}`,
      }))
      return
    }

    // Step 3: Fetch the completed match
    const fullMatch = await getArenaMatchAPI(matchId)

    if (fullMatch.success && fullMatch.data) {
      setState((prev) => ({
        ...prev,
        step: 'voting',
        match: fullMatch.data!,
      }))
    } else {
      setState((prev) => ({
        ...prev,
        step: 'idle',
        error: fullMatch.error ?? 'Failed to fetch match results',
      }))
    }
  }, [])

  const vote = useCallback(
    async (winnerEntryId: string) => {
      if (!state.matchId || state.step !== 'voting') return

      // Optimistically move to revealed to prevent double-click
      setState((prev) => ({ ...prev, step: 'revealed' }))

      const result = await submitArenaVoteAPI(state.matchId, {
        winnerEntryId,
      })

      if (result.success && result.data) {
        // Re-fetch match to get revealed model names
        const matchResult = await getArenaMatchAPI(state.matchId)

        setState((prev) => ({
          ...prev,
          step: 'revealed',
          match: matchResult.data ?? prev.match,
          eloUpdates: result.data!.eloUpdates,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          step: 'voting',
          error: result.error ?? 'Vote failed',
        }))
      }
    },
    [state.matchId, state.step],
  )

  const reset = useCallback(() => {
    stopPolling()
    setState(INITIAL_STATE)
  }, [stopPolling])

  return {
    ...state,
    startBattle,
    vote,
    reset,
  }
}
