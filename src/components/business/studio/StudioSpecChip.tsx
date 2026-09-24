'use client'

/**
 * 工作台的规格 chip —— 把 `SpecChip` 接到 `StudioFormContext` 上（D2 ④，第 12 项）。
 *
 * 它替掉了四份东西：图片的 `StudioSpecFields` + `StudioSpecPopover`、视频的
 * `StudioVideoSpecFields` + `StudioVideoSpecPopover`，以及移动端那张
 * `StudioMobileSpecSheet`（同一颗 chip 在触屏上自己就是底部抽屉，⛔ 不再写第二条
 * 手机分支）。
 *
 * ⚠ 画质 / 透明底 / 生成预览**不回规格**（第 11 项把它们搬去了
 * `StudioModelCapabilityChips`）：规格回答的是三模态同形的「下一版长什么样」，
 * 那三样是逐模型的专属能力。
 */

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

import type { AspectRatio } from '@/constants/config'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { IMAGE_BATCH_COUNTS } from '@/constants/studio'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import { useStudioForm } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useStudioVideoAssets } from '@/hooks/use-studio-video-assets'
import { useStudioVideoAudio } from '@/hooks/use-studio-video-audio'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import {
  asVideoResolution,
  buildImageSpecChipModel,
  buildVideoSpecChipModel,
} from '@/lib/spec-chip-model'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { SpecChip } from '@/components/business/studio-shared/spec'
import type { AdvancedParams } from '@/types'

interface StudioSpecChipProps {
  readonly disabled?: boolean
  readonly triggerClassName?: string
}

const moreTierClass =
  'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border px-2.5 text-xs transition-colors duration-fast ease-standard md:h-7.5'

/** 图片档：比例 · 尺寸 / 清晰度，「更多」里是张数。 */
function StudioImageSpecChip({
  disabled,
  triggerClassName,
}: StudioSpecChipProps) {
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useImageModelOptions()
  const t = useTranslations('StudioSpecChip')

  const resolution = state.advancedParams.resolution ?? null
  const model = buildImageSpecChipModel({
    adapterType: selectedModel?.adapterType,
    modelId: selectedModel?.modelId,
    aspectRatio: state.aspectRatio,
    resolution,
  })
  if (model.isEmpty) return null

  const setResolution = (next: string) => {
    if (next !== 'auto' && next !== '1K' && next !== '2K' && next !== '4K') {
      return
    }
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: {
        ...state.advancedParams,
        resolution: next,
      } satisfies AdvancedParams,
    })
  }

  return (
    <SpecChip
      model={model}
      ariaLabel={t('chipLabel')}
      resolutionLabel={t('imageResolutionLabel')}
      aspectRatio={state.aspectRatio}
      onAspectRatioChange={(next) =>
        dispatch({ type: 'SET_ASPECT_RATIO', payload: next as AspectRatio })
      }
      resolution={resolution}
      onResolutionChange={setResolution}
      data-testid="studio-spec-chip"
      {...(triggerClassName ? { triggerClassName } : {})}
      {...(disabled === undefined ? {} : { disabled })}
      more={
        <div className="flex flex-col gap-1.5" data-assistant-field="count">
          <span className="text-2xs font-medium text-muted-foreground/70">
            {t('moreItem.batchCount')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {IMAGE_BATCH_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={state.imageBatchCount === count}
                disabled={disabled}
                onClick={() =>
                  dispatch({ type: 'SET_IMAGE_BATCH_COUNT', payload: count })
                }
                className={cn(
                  moreTierClass,
                  state.imageBatchCount === count
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-foreground hover:border-foreground/40',
                )}
              >
                {`×${count}`}
              </button>
            ))}
          </div>
        </div>
      }
    />
  )
}

/** 视频档：比例 · 清晰度 · 时长，「更多」里是原生出声。 */
function StudioVideoSpecChip({
  disabled,
  triggerClassName,
}: StudioSpecChipProps) {
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')
  /**
   * ⭐ 档位按**这一枪实际跑的端点**给（owner 09-24 去掉模式）：挂了参考项时发的是
   * 参考端点，它的时长 / 比例表可能与关键帧端点不同。
   */
  const { send } = useStudioVideoAssets()
  const sendModelId = send?.modelId ?? selectedModel?.modelId
  const t = useTranslations('StudioSpecChip')
  const tSlots = useTranslations('StudioVideoSlots')
  const tVideo = useTranslations('VideoGenerate')
  const { supported: supportsGenerateAudio, value: generateAudioValue } =
    useStudioVideoAudio()

  const contract =
    selectedModel && sendModelId
      ? getVideoModelSendContract(
          sendModelId,
          selectedModel.adapterType as AI_ADAPTER_TYPES,
        )
      : null

  /**
   * **首帧锁自适应**（owner 2026-09-06 定，原样从 `StudioVideoSpecFields` 搬来）。
   * 两条判据必须同时成立：① 这条线路带图时上游把 `ratio` 钉死；② 这一枪真的按
   * **首帧**发（有首帧、没挂参考项）—— 纯文生视频不受限，只看模型会把纯文生的比例也一起锁掉。
   */
  const aspectLockedByFirstFrame = Boolean(
    contract &&
    send &&
    !send.hasReference &&
    state.videoFrameSlots.first !== null &&
    contract.imageAspectRatioLock !== null,
  )

  const model = buildVideoSpecChipModel({
    modelId: sendModelId,
    ...(selectedModel
      ? { adapterType: selectedModel.adapterType as AI_ADAPTER_TYPES }
      : {}),
    aspectRatio: state.aspectRatio,
    resolution: state.videoResolution,
    durationSeconds: state.videoDuration,
    aspectLocked: aspectLockedByFirstFrame,
  })

  /**
   * 切模型把不兼容的值吸附回该模型的档位 —— 写回状态并让 chip 闪一次
   * （画板「非法组合回默认并在 chip 上闪一次」）。⛔ 不提示、不给撤销：切模型
   * 就是直接切（owner 批注 36）。
   *
   * ⚠ 「该吸附成什么」在**渲染中**算完，effect 只负责把它写回 —— 这样闪的信号
   * 是一个纯派生值（⛔ 不是 effect 里 bump 的计数器：那既要读 ref 又要多滚一轮）。
   */
  const snapDuration =
    model.durationSeconds !== null &&
    model.durationSeconds !== state.videoDuration
      ? model.durationSeconds
      : null
  const snapResolution =
    state.videoResolution &&
    model.resolutions.length > 0 &&
    !model.resolutions.some((tier) => tier.value === state.videoResolution)
      ? (model.resolutions.find((tier) => tier.supported)?.value ?? null)
      : null
  const snapRatio =
    model.ratios.length > 0 &&
    !model.ratios.some(
      (tier) => tier.value === state.aspectRatio && tier.supported,
    )
      ? (model.ratios.find((tier) => tier.supported)?.value ?? null)
      : null
  /**
   * 非 null = 这一帧有值被吸附回默认。`SpecChip` 只在它**从空变成非空**时闪一次，
   * 所以 dispatch 生效后它回到 null 不会再闪第二下。
   */
  const flashSignal =
    snapDuration === null && snapResolution === null && snapRatio === null
      ? null
      : `${selectedModel?.modelId ?? ''}:${snapRatio ?? ''}:${snapResolution ?? ''}:${snapDuration ?? ''}`

  useEffect(() => {
    if (snapDuration !== null) {
      dispatch({ type: 'SET_VIDEO_DURATION', payload: snapDuration })
    }
    if (snapResolution !== null) {
      dispatch({
        type: 'SET_VIDEO_RESOLUTION',
        payload: asVideoResolution(snapResolution),
      })
    }
    if (snapRatio !== null) {
      dispatch({
        type: 'SET_ASPECT_RATIO',
        payload: snapRatio as AspectRatio,
      })
    }
  }, [snapDuration, snapResolution, snapRatio, dispatch])

  if (model.isEmpty) return null

  return (
    <SpecChip
      model={model}
      ariaLabel={t('chipLabel')}
      resolutionLabel={t('videoResolutionLabel')}
      aspectRatio={state.aspectRatio}
      onAspectRatioChange={(next) =>
        dispatch({ type: 'SET_ASPECT_RATIO', payload: next as AspectRatio })
      }
      resolution={state.videoResolution}
      onResolutionChange={(next) =>
        dispatch({
          type: 'SET_VIDEO_RESOLUTION',
          // 再点一次清回 null = 交给 provider 默认。
          payload:
            state.videoResolution === next ? null : asVideoResolution(next),
        })
      }
      onDurationChange={(seconds) =>
        dispatch({ type: 'SET_VIDEO_DURATION', payload: seconds })
      }
      ratioLockedHint={tSlots('aspectLockedByFirstFrame')}
      flashSignal={flashSignal}
      data-testid="studio-spec-chip"
      {...(triggerClassName ? { triggerClassName } : {})}
      {...(disabled === undefined ? {} : { disabled })}
      {...(supportsGenerateAudio
        ? {
            more: (
              <div className="flex min-h-11 items-center justify-between gap-2">
                <span className="text-2xs font-medium text-muted-foreground/70">
                  {tVideo('generateAudioLabel')}
                </span>
                <Switch
                  checked={generateAudioValue}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    dispatch({
                      type: 'SET_VIDEO_GENERATE_AUDIO',
                      payload: checked,
                    })
                  }
                  aria-label={tVideo('generateAudioLabel')}
                />
              </div>
            ),
          }
        : {})}
    />
  )
}

/** 三模态共用的入口：图片 / 视频各走一套档位，其余模态没有「规格」这一说。 */
export function StudioSpecChip(props: StudioSpecChipProps) {
  const { state } = useStudioForm()
  if (state.outputType === 'image') return <StudioImageSpecChip {...props} />
  if (state.outputType === 'video') return <StudioVideoSpecChip {...props} />
  return null
}
