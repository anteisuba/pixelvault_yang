'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

import { useStudioForm } from '@/contexts/studio-context'

const VALID_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number]

function isAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value)
}

/**
 * Hydrate the studio form from `?prompt= &seed= &negativePrompt= &aspectRatio=`
 * URL params produced by the "Use this image" replay flow. Runs exactly
 * once per Studio mount — the user can then edit freely without us
 * re-stomping their input on every searchParams change.
 *
 * Pairs with `useActiveLoraStack`'s own `?style=` URL parser; together
 * they form the full "reproduce that exact generation" path that
 * landing 1C promises.
 */
export function useStudioReplayFromUrl(): void {
  const searchParams = useSearchParams()
  const { state, dispatch } = useStudioForm()
  // Once-per-mount guard: a second searchParams change should NOT
  // re-apply replay params (the user may have edited the prompt in the
  // meantime; clobbering it would be very rude).
  const hasApplied = useRef(false)

  useEffect(() => {
    if (hasApplied.current) return

    const promptParam = searchParams.get('prompt')
    const seedParam = searchParams.get('seed')
    const negativePromptParam = searchParams.get('negativePrompt')
    const aspectRatioParam = searchParams.get('aspectRatio')

    const hasAnyReplayParam =
      promptParam || seedParam || negativePromptParam || aspectRatioParam
    if (!hasAnyReplayParam) {
      // No replay payload — leave the guard un-set so a later navigation
      // to the same Studio with replay params still hydrates.
      return
    }

    hasApplied.current = true

    // Prompt: only dispatch when non-empty — an explicit empty string
    // in the URL is more likely a serialisation accident than intent.
    if (promptParam && promptParam.trim().length > 0) {
      dispatch({ type: 'SET_PROMPT', payload: promptParam })
    }

    if (aspectRatioParam && isAspectRatio(aspectRatioParam)) {
      dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatioParam })
    }

    // Seed + negative prompt live inside advancedParams. Merge instead
    // of replace so any prior values (e.g. user-saved defaults in
    // FormContext) aren't lost.
    const seed =
      seedParam !== null && /^-?\d+$/.test(seedParam) ? Number(seedParam) : null
    const negativePrompt =
      negativePromptParam && negativePromptParam.trim().length > 0
        ? negativePromptParam
        : null

    if (seed !== null || negativePrompt !== null) {
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          ...(seed !== null ? { seed } : {}),
          ...(negativePrompt !== null ? { negativePrompt } : {}),
        },
      })
    }
    // state intentionally not in deps: this effect must run on mount
    // only. `state` snapshot is OK here because we apply once and lock
    // — subsequent edits go through normal user-driven dispatches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
}
