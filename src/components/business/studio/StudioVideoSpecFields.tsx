'use client'

import { useTranslations } from 'next-intl'

import type { AspectRatio } from '@/constants/config'
import { getModelById } from '@/constants/models'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { STUDIO_VIDEO_ASPECT_RATIOS } from '@/constants/studio'
import {
  getVideoModelParameterOptions,
  getVideoModelSendContract,
} from '@/constants/video-model-send-plan'
import { useStudioForm } from '@/contexts/studio-context'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  StudioRatioGlyph,
  studioChipActiveClass,
  studioSegButtonClass,
  studioSegInactiveClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

/** 超过这个档数就从药丸换成滑条。4 档并排还能一眼比完，再多就是一面墙。 */
const DURATION_SLIDER_THRESHOLD = 4

/** 触屏宿主（移动端 sheet）里同一组 chip 要撑到 44px 命中区。 */
const segTouchClass = 'min-h-11 text-sm'

/**
 * 视频「规格」四档（时长 · 分辨率 · 比例 · 原生出声）的**取值域**。
 *
 * ⭐ 抽出来的理由与 `StudioSpecFields` / `useStudioGenerateAction` 同：两个宿主
 * （桌面参数栏的 `StudioVideoSpecPopover` 与移动端底部的 `StudioMobileSpecSheet`）
 * 各写一份档位判据必然分叉 —— 用户会看到一处能选 10s、另一处不能。
 *
 * 三条判据原样保留（详见 `StudioVideoSpecPopover` 文件头）：
 * 1. 档位按型号实算（`getVideoModelParameterOptions`），空数组整组不渲染；
 * 2. 摘要里的值必须确实在候选里才印；
 * 3. 四样全空（含出声契约）时 `isEmpty` 为真，宿主整块不渲染。
 */
export function useStudioVideoSpec() {
  const { state } = useStudioForm()
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')

  const { durations, resolutions, aspectRatios } =
    getVideoModelParameterOptions(
      selectedModel?.modelId,
      selectedModel?.adapterType,
    )
  // 目录里可能声明了我们不提供的比例；谓词而不是 `as`，收窄到 `AspectRatio`
  // 才能直接 dispatch。
  const ratios = aspectRatios.filter((ratio): ratio is AspectRatio =>
    STUDIO_VIDEO_ASPECT_RATIOS.includes(ratio as AspectRatio),
  )

  /**
   * 原生出声支不支持按**选中的那条端点**的契约判（`parameters.generateAudio`）。
   * 显示值 = 用户设过就用他的，没设过用目录默认（多数模型是 true）—— 开关的
   * 位置从一开始就说实话，而不是先摆一个关着的开关再偷偷发 true。
   */
  const supportsGenerateAudio = Boolean(
    selectedModel &&
    getVideoModelSendContract(
      selectedModel.modelId,
      selectedModel.adapterType as AI_ADAPTER_TYPES,
    ).parameters.generateAudio,
  )
  const generateAudioValue =
    state.videoGenerateAudio ??
    (selectedModel
      ? (getModelById(selectedModel.modelId)?.videoDefaults?.generateAudio ??
        true)
      : true)

  const summary = [
    durations.includes(state.videoDuration) ? `${state.videoDuration}s` : null,
    state.videoResolution && resolutions.includes(state.videoResolution)
      ? state.videoResolution
      : null,
    ratios.includes(state.aspectRatio) ? state.aspectRatio : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    durations,
    resolutions,
    ratios,
    supportsGenerateAudio,
    generateAudioValue,
    summary,
    isEmpty:
      durations.length === 0 &&
      resolutions.length === 0 &&
      ratios.length === 0 &&
      !supportsGenerateAudio,
  }
}

interface StudioVideoSpecFieldsProps {
  /** 触屏宿主：chip 撑到 44px（移动端规格 sheet）。 */
  touch?: boolean
}

/** 四组档位的**唯一**实现，桌面浮层与移动端 sheet 共用。 */
export function StudioVideoSpecFields({ touch }: StudioVideoSpecFieldsProps) {
  const { state, dispatch } = useStudioForm()
  const tVideo = useTranslations('VideoGenerate')
  const {
    durations,
    resolutions,
    ratios,
    supportsGenerateAudio,
    generateAudioValue,
  } = useStudioVideoSpec()

  const chipClass = cn(studioSegButtonClass, touch && segTouchClass)

  /**
   * 药丸还是滑条 —— 判据是**档位有多少个**。目录里的实际跨度是 1 档到 27 档
   * （Seedance 2.5 到 30 秒）：≤4 档并排能一眼比完，再多就是一面墙。
   */
  const usesDurationSlider = durations.length > DURATION_SLIDER_THRESHOLD
  const durationIndex = Math.max(0, durations.indexOf(state.videoDuration))

  return (
    <div className="flex flex-col gap-3">
      {durations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {tVideo('durationLabel')}
            </span>
            {usesDurationSlider ? (
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {`${durations[durationIndex]}s`}
              </span>
            ) : null}
          </div>
          {usesDurationSlider ? (
            /* ⚠ 按 index 而不是按秒数：档位不一定连续（[6,8,10]），用秒数当
               min/max 会让滑条停在模型不支持的整数上。 */
            <Slider
              min={0}
              max={durations.length - 1}
              step={1}
              value={[durationIndex]}
              aria-label={tVideo('durationLabel')}
              onValueChange={([index]) => {
                const seconds = durations[index ?? 0]
                if (seconds !== undefined) {
                  dispatch({ type: 'SET_VIDEO_DURATION', payload: seconds })
                }
              }}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {durations.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  role="radio"
                  aria-checked={state.videoDuration === seconds}
                  onClick={() =>
                    dispatch({ type: 'SET_VIDEO_DURATION', payload: seconds })
                  }
                  className={cn(
                    chipClass,
                    state.videoDuration === seconds
                      ? studioChipActiveClass
                      : studioSegInactiveClass,
                  )}
                >
                  {`${seconds}s`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {resolutions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-muted-foreground/70">
            {tVideo('resolutionLabel')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {resolutions.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={state.videoResolution === value}
                // 再点一次清回 null = 交给 provider 默认。模型声明了档位不代表
                // 用户必须钉死一档。
                onClick={() =>
                  dispatch({
                    type: 'SET_VIDEO_RESOLUTION',
                    payload: state.videoResolution === value ? null : value,
                  })
                }
                className={cn(
                  chipClass,
                  state.videoResolution === value
                    ? studioChipActiveClass
                    : studioSegInactiveClass,
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}

      {ratios.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-muted-foreground/70">
            {tVideo('aspectRatioLabel')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ratios.map((ratio) => (
              <button
                key={ratio}
                type="button"
                role="radio"
                aria-checked={state.aspectRatio === ratio}
                onClick={() =>
                  dispatch({ type: 'SET_ASPECT_RATIO', payload: ratio })
                }
                className={cn(
                  chipClass,
                  state.aspectRatio === ratio
                    ? studioChipActiveClass
                    : studioSegInactiveClass,
                )}
              >
                <StudioRatioGlyph ratio={ratio} />
                {ratio}
              </button>
            ))}
          </div>
        </div>
      )}

      {supportsGenerateAudio && (
        <div
          className={cn(
            'flex items-center justify-between gap-2',
            touch && 'min-h-11',
          )}
        >
          <span className="text-2xs font-medium text-muted-foreground/70">
            {tVideo('generateAudioLabel')}
          </span>
          <Switch
            checked={generateAudioValue}
            onCheckedChange={(checked) =>
              dispatch({ type: 'SET_VIDEO_GENERATE_AUDIO', payload: checked })
            }
            aria-label={tVideo('generateAudioLabel')}
          />
        </div>
      )}
    </div>
  )
}
