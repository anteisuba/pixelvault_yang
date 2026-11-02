'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { NovelAiCharacterLayoutSchema } from '@/types/novelai'
import { isAspectRatio } from '@/constants/config'
import { STUDIO_AUTOGENERATE_QUERY } from '@/constants/routes'

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
  const { imageUpload } = useStudioData()
  // Once-per-mount guard: a second searchParams change should NOT
  // re-apply replay params (the user may have edited the prompt in the
  // meantime; clobbering it would be very rude).
  const hasApplied = useRef(false)
  const autoGenerateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (autoGenerateTimer.current) clearTimeout(autoGenerateTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (hasApplied.current) return

    const promptParam = searchParams.get('prompt')
    const seedParam = searchParams.get('seed')
    const negativePromptParam = searchParams.get('negativePrompt')
    const layoutParam = searchParams.get('novelAiLayout')
    let novelAiLayout
    try {
      const parsed = NovelAiCharacterLayoutSchema.safeParse(
        JSON.parse(layoutParam ?? 'null'),
      )
      if (parsed.success) novelAiLayout = parsed.data
    } catch {
      /* Ignore malformed external URL input. */
    }
    const aspectRatioParam = searchParams.get('aspectRatio')
    const referenceImages = searchParams
      .getAll('referenceImage')
      .filter((url) => {
        try {
          return ['http:', 'https:'].includes(new URL(url).protocol)
        } catch {
          return false
        }
      })

    const hasAnyReplayParam =
      novelAiLayout ||
      promptParam ||
      seedParam ||
      negativePromptParam ||
      aspectRatioParam ||
      referenceImages.length
    if (!hasAnyReplayParam) {
      // No replay payload — leave the guard un-set so a later navigation
      // to the same Studio with replay params still hydrates.
      return
    }

    hasApplied.current = true
    let autoGenerate = false

    if (referenceImages.length > 0) {
      imageUpload.clearAllImages()
      referenceImages.forEach((url) => imageUpload.addReferenceImage(url))
    }

    // Prompt: only dispatch when non-empty — an explicit empty string
    // in the URL is more likely a serialisation accident than intent.
    if (promptParam && promptParam.trim().length > 0) {
      dispatch({ type: 'SET_PROMPT', payload: promptParam })
      // 手机 ＋ 面板那一句话（`studioImageGeneratePath`）：填完直接出图。
      if (searchParams.get(STUDIO_AUTOGENERATE_QUERY) === '1') {
        autoGenerate = true
      }
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

    if (seed !== null || negativePrompt !== null || novelAiLayout) {
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          novelAiLayout,
          ...(seed !== null ? { seed } : {}),
          ...(negativePrompt !== null ? { negativePrompt } : {}),
        },
      })
    }

    const consumedUrl = new URL(window.location.href)
    for (const key of [
      'prompt',
      'seed',
      'negativePrompt',
      'novelAiLayout',
      'aspectRatio',
      'referenceImage',
      STUDIO_AUTOGENERATE_QUERY,
    ]) {
      consumedUrl.searchParams.delete(key)
    }
    window.history.replaceState(window.history.state, '', consumedUrl)

    // ⚠ 推到下一拍再扣扳机：首帧 `useIsMobile()` 还是 false，挂着的是桌面输入框；
    // 量完视口才换成手机那颗。`REQUEST_GENERATE` 的执行端只认挂载之后的新请求，
    // 这一枪若赶在换挂载之前发出，新挂上的那颗会把它当旧账吞掉。
    if (autoGenerate) {
      autoGenerateTimer.current = setTimeout(() => {
        dispatch({ type: 'REQUEST_GENERATE' })
      }, 0)
    }
    // state intentionally not in deps: this effect must run on mount
    // only. `state` snapshot is OK here because we apply once and lock
    // — subsequent edits go through normal user-driven dispatches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
}
