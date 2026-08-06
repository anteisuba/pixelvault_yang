'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { NodeAssistantRouteSelection } from '@/components/business/node/CanvasAssistantRouteSelector'

interface StudioAssistantControlsState {
  route: NodeAssistantRouteSelection
  researchEnabled: boolean
}

const INITIAL_STATE: StudioAssistantControlsState = {
  route: {
    optionId: NODE_STUDIO_ASSISTANT_ROUTE_OPTION_IDS.auto,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  },
  researchEnabled: false,
}

let state = INITIAL_STATE
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(next: StudioAssistantControlsState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function useStudioAssistantControls() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL_STATE,
  )

  const setRoute = useCallback((route: NodeAssistantRouteSelection) => {
    emit({ ...state, route })
  }, [])
  const setResearchEnabled = useCallback((researchEnabled: boolean) => {
    emit({ ...state, researchEnabled })
  }, [])

  return {
    ...snapshot,
    setRoute,
    setResearchEnabled,
  }
}
