'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { AspectRatio } from '@/constants/config'
import type { ArenaMatchRecord, ArenaModelSelection, EloUpdate } from '@/types'
import {
  createArenaMatchAPI,
  getArenaMatchAPI,
  submitArenaVoteAPI,
} from '@/lib/api-client'

type ArenaStep = 'idle' | 'creating' | 'battling' | 'voting' | 'revealed'

interface ArenaState {
  step: ArenaStep
  matchId: string | null
  match: ArenaMatchRecord | null
  eloUpdates: EloUpdate[]
  error: string | null
}

const INITIAL_STATE: ArenaState = {
  step: 'idle',
  matchId: null,
  match: null,
  eloUpdates: [],
  error: null,
}

export interface StartBattleInput {
  prompt: string
  aspectRatio: AspectRatio
  models?: ArenaModelSelection[]
  referenceImage?: string
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
    setState({
      step: 'creating',
      matchId: null,
      match: null,
      eloUpdates: [],
      error: null,
    })

    const result = await createArenaMatchAPI({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      models: input.models,
      referenceImage: input.referenceImage,
    })

    if (!result.success || !result.data) {
      setState((prev) => ({
        ...prev,
        step: 'idle',
        error: result.error ?? 'Failed to create match',
      }))
      return
    }

    const matchId = result.data.matchId

    // Fetch the completed match
    const matchResult = await getArenaMatchAPI(matchId)

    if (matchResult.success && matchResult.data) {
      setState({
        step: 'voting',
        matchId,
        match: matchResult.data,
        eloUpdates: [],
        error: null,
      })
    } else {
      setState((prev) => ({
        ...prev,
        step: 'idle',
        error: matchResult.error ?? 'Failed to fetch match results',
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
