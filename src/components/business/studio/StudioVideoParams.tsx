'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { getVideoModelParameterOptions } from '@/constants/video-model-send-plan'
import { OptionGroup } from '@/components/ui/option-group'

/**
 * StudioVideoParams — video-mode panel body. Rendered inside the centred
 * Dialog from StudioDockPanelArea, which owns the title + close button —
 * this component renders only the controls.
 *
 * ⚠ 档位**按选中模型收窄**，不是写死的全集。写死过一版（时长 `[3,5,10]` +
 * 分辨率 `['480p','720p','1080p']`），后果是选中的模型不支持时**必 400**，而
 * 默认值恰好落在安全区 —— 于是表现成「不动参数能跑、一动就报错」，最难归因的
 * 那种。实例：`SEEDANCE_20_REFERENCE` 时长只到 [4..15]，选 3 秒必炸；
 * `SEEDANCE_25_REFERENCE` 只到 720p、`MINIMAX_H3_REFERENCE` 只有 2k，选 1080p
 * 必炸。
 *
 * `getVideoModelParameterOptions` 就是为这件事写的：它把「支不支持这个参数」
 * 与「支持哪些档」两问合成一问，不支持时返回空数组 —— 按契约 R3，**整栏不渲染**
 * （而不是渲染一颗点了不起作用的按钮）。
 */
export const StudioVideoParams = memo(function StudioVideoParams() {
  const { state, dispatch } = useStudioForm()
  const tVideo = useTranslations('VideoGenerate')
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')
  const { durations, resolutions } = getVideoModelParameterOptions(
    selectedModel?.modelId,
    selectedModel?.adapterType,
  )

  const negativePrompt = state.advancedParams.negativePrompt ?? ''

  const setNegative = (value: string) =>
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, negativePrompt: value || undefined },
    })

  return (
    <div className="space-y-4">
      {/* Duration — 空数组 = 该模型不支持这个参数，整栏不渲染（契约 R3）。 */}
      {durations.length > 0 ? (
        <div>
          <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
            {tVideo('durationLabel')}
          </label>
          <OptionGroup
            options={durations.map((d) => ({
              value: String(d),
              label: `${d}s`,
            }))}
            value={String(state.videoDuration)}
            onChange={(v) =>
              dispatch({ type: 'SET_VIDEO_DURATION', payload: Number(v) })
            }
            variant="neutral"
          />
        </div>
      ) : null}

      {/* Resolution — 同上。 */}
      {resolutions.length > 0 ? (
        <div>
          <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
            {tVideo('resolutionLabel')}
          </label>
          <OptionGroup
            options={resolutions.map((r) => r)}
            value={state.videoResolution ?? ''}
            onChange={(v) =>
              dispatch({
                type: 'SET_VIDEO_RESOLUTION',
                payload: v || null,
              })
            }
            allowDeselect
            variant="neutral"
          />
        </div>
      ) : null}

      {/* Long Video pipeline — UI re-entry deferred to a follow-up WP
          (canvas-level pipeline progress needs wiring before re-exposing here). */}

      {/* Negative Prompt */}
      <div>
        <label className="mb-2 block text-2xs font-medium text-muted-foreground/70">
          {tVideo('negativePromptLabel')}
        </label>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegative(e.target.value)}
          placeholder={tVideo('negativePromptPlaceholder')}
          rows={2}
          className="w-full min-h-16 rounded-lg border border-border/60 bg-background/60 p-2 text-sm focus:border-primary/40 focus:outline-none"
        />
      </div>
    </div>
  )
})
