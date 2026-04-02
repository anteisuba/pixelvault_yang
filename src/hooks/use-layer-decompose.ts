'use client'

import { useState, useCallback } from 'react'
import type { DecomposedLayer } from '@/types'
import { decomposeImageAPI } from '@/lib/api-client'

type DecomposeStep = 'idle' | 'decomposing' | 'done' | 'error'

interface LayerDecomposeState {
  step: DecomposeStep
  sourceImageUrl: string | null
  layers: DecomposedLayer[]
  psdUrl: string | null
  layerCount: number
  error: string | null
}

const INITIAL_STATE: LayerDecomposeState = {
  step: 'idle',
  sourceImageUrl: null,
  layers: [],
  psdUrl: null,
  layerCount: 0,
  error: null,
}

export function useLayerDecompose() {
  const [state, setState] = useState<LayerDecomposeState>(INITIAL_STATE)

  const startDecompose = useCallback(async (imageUrl: string) => {
    setState({
      ...INITIAL_STATE,
      step: 'decomposing',
      sourceImageUrl: imageUrl,
    })

    const result = await decomposeImageAPI(imageUrl)

    if (result.success && result.data) {
      setState((prev) => ({
        ...prev,
        step: 'done',
        layers: result.data!.layers,
        psdUrl: result.data!.psdUrl,
        layerCount: result.data!.layerCount,
      }))
    } else {
      setState((prev) => ({
        ...prev,
        step: 'error',
        error: result.error ?? 'Decomposition failed',
      }))
    }
  }, [])

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return {
    ...state,
    startDecompose,
    reset,
  }
}
