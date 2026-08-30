'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { AspectRatio } from '@/constants/config'
import { STUDIO_VIDEO_ASPECT_RATIOS } from '@/constants/studio'
import { getModelById } from '@/constants/models'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
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
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioSegButtonClass,
  studioSegInactiveClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

/** 超过这个档数就从药丸换成滑条。4 档并排还能一眼比完，再多就是一面墙。 */
const DURATION_SLIDER_THRESHOLD = 4

interface StudioVideoSpecPopoverProps {
  disabled?: boolean
}

/**
 * StudioVideoSpecPopover —— 视频参数栏的「规格」单一触发器：时长 · 分辨率 ·
 * 宽高比收进一个下拉，触发器上写全（`5s · 720p · 16:9`）。
 *
 * 与图片的 `StudioSpecPopover` 是**同一个形态**（参数栏三种披露里的形态 2），
 * 药丸样式与比例线框都从 `tool-surface` 共用，观感逐像素一致 —— 两处各写一份
 * 是漂移的起点。
 *
 * 它替掉了三样东西（2026-08-23 切片 B）：
 * - 「视频设置」对话框（`StudioVideoParams` + `panels.videoParams`）—— 时长与
 *   分辨率藏在弹层里，不点开看不见当前值；
 * - 视频栏里那颗独立的 `StudioAspectRatioPopover`；
 * - 对话框里的反向提示词输入框 —— 改由参数栏的折叠行承担，与图片同一条。
 *
 * ## 三条判据
 *
 * 1. **档位按型号实算，空数组整组不渲染**（契约 R3）。写死过一版全集，后果是
 *    选中的模型不支持时必 400，且默认值恰好落在安全区 —— 表现成「不动参数能跑、
 *    一动就报错」。`getVideoModelParameterOptions` 就是为这件事写的。
 * 2. **摘要里的值必须确实在候选里才印**。照图片那颗的守卫：印一个弹层里根本
 *    点不回去的值，比不印更糟。
 * 3. **三组全空就整块不渲染**（含标签）—— 没选模型时就是这种情形，留一个
 *    「规格」标签配一个空下拉是纯噪音。
 */
export function StudioVideoSpecPopover({
  disabled,
}: StudioVideoSpecPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')
  const t = useTranslations('StudioV2')
  const tVideo = useTranslations('VideoGenerate')

  const open = state.panels.videoSpec
  const { durations, resolutions, aspectRatios } =
    getVideoModelParameterOptions(
      selectedModel?.modelId,
      selectedModel?.adapterType,
    )
  // 目录里可能声明了我们不提供的比例；与旧的 `StudioAspectRatioPopover` 同一道
  // 过滤，保证下拉里的每一个都是产品支持的。
  // 谓词而不是 `as`：`getVideoModelParameterOptions` 声明的是 `readonly string[]`，
  // 收窄到 `AspectRatio` 才能直接 dispatch，不用在下面每个 onClick 里再断言一次。
  const ratios = aspectRatios.filter((ratio): ratio is AspectRatio =>
    STUDIO_VIDEO_ASPECT_RATIOS.includes(ratio as AspectRatio),
  )

  /**
   * 原生出声（台账 A「顺带」，owner 2026-08-29）。工作台此前**没有开关**，最终值
   * 一律吃模型目录的 `videoDefaults.generateAudio`，用户完全不可控 —— 画布那边
   * 早有两处 Switch。
   *
   * ⚠ 支不支持按**选中的那条端点**的契约判（`parameters.generateAudio`），与
   * 上面三档参数同一份真相。
   * ⚠ 显示值 = 用户设过就用他的，没设过用目录默认（多数模型是 true）。这样开关
   * 的位置从一开始就说的是实话，而不是先摆一个关着的开关再偷偷发 true。
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

  if (
    durations.length === 0 &&
    resolutions.length === 0 &&
    ratios.length === 0 &&
    !supportsGenerateAudio
  )
    return null

  /**
   * 药丸还是滑条 —— 判据是**档位有多少个**，不是模态也不是好不好看。
   * 目录里的实际跨度是 1 档到 27 档（Seedance 2.5 到 30 秒）：≤4 档并排能一眼
   * 比完，再多就是一面墙。
   */
  const usesDurationSlider = durations.length > DURATION_SLIDER_THRESHOLD
  // 当前值不在档位里时落到 0 —— 只影响滑条把手的落点，摘要那边照旧不印
  // （见下面的守卫），换模型带来的过期值由 `clampVideoSpecToModel` 在选型号
  // 那一刻收窄，不靠这里兜。
  const durationIndex = Math.max(0, durations.indexOf(state.videoDuration))

  const summary = [
    durations.includes(state.videoDuration) ? `${state.videoDuration}s` : null,
    state.videoResolution && resolutions.includes(state.videoResolution)
      ? state.videoResolution
      : null,
    ratios.includes(state.aspectRatio) ? state.aspectRatio : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('specLabel')}
      </span>
      <StudioToolSurface
        open={open}
        onOpenChange={(nextOpen) =>
          dispatch({
            type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'videoSpec',
          })
        }
      >
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('specLabel')}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
              'transition-colors duration-fast ease-standard hover:border-primary/25',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:pointer-events-none disabled:opacity-50',
              open && 'border-primary/30 bg-muted/45',
            )}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown
              className={cn(
                'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
                open && 'rotate-180',
              )}
            />
          </button>
        </StudioToolSurfaceTrigger>
        <StudioToolPopoverContent
          size="small"
          className="w-64"
          side="bottom"
          align="start"
          label={t('specLabel')}
        >
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
                  /* 档位多的型号（Seedance 2.5 到 30 秒 = 27 档）铺成药丸就是一面
                     墙，一屏放不下还得滚。滑条按 **index** 走模型自己声明的那串
                     秒数 —— 与画布 `VideoComposer` 同一条路数，不另发明。
                     ⚠ 按 index 而不是按秒数：档位不一定连续（[6,8,10]），
                     用秒数当 min/max 会让滑条停在模型不支持的整数上。 */
                  <Slider
                    min={0}
                    max={durations.length - 1}
                    step={1}
                    value={[durationIndex]}
                    aria-label={tVideo('durationLabel')}
                    onValueChange={([index]) => {
                      const seconds = durations[index ?? 0]
                      if (seconds !== undefined) {
                        dispatch({
                          type: 'SET_VIDEO_DURATION',
                          payload: seconds,
                        })
                      }
                    }}
                  />
                ) : (
                  /* 少数几档时药丸更好：一眼看全、一次点中，且当前值不在档位里时
                     天然表现成「一个都没选中」—— 滑条做不到这件事。 */
                  <div className="flex flex-wrap gap-1.5">
                    {durations.map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        role="radio"
                        aria-checked={state.videoDuration === seconds}
                        onClick={() =>
                          dispatch({
                            type: 'SET_VIDEO_DURATION',
                            payload: seconds,
                          })
                        }
                        className={cn(
                          studioSegButtonClass,
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
                      // 再点一次清回 null = 交给 provider 默认。旧的 OptionGroup
                      // 带 `allowDeselect`，这条出路不能在换形态时丢掉：模型声明了
                      // 档位不代表用户必须钉死一档。
                      onClick={() =>
                        dispatch({
                          type: 'SET_VIDEO_RESOLUTION',
                          payload:
                            state.videoResolution === value ? null : value,
                        })
                      }
                      className={cn(
                        studioSegButtonClass,
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
                        studioSegButtonClass,
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-medium text-muted-foreground/70">
                  {tVideo('generateAudioLabel')}
                </span>
                <Switch
                  checked={generateAudioValue}
                  onCheckedChange={(checked) =>
                    dispatch({
                      type: 'SET_VIDEO_GENERATE_AUDIO',
                      payload: checked,
                    })
                  }
                  aria-label={tVideo('generateAudioLabel')}
                />
              </div>
            )}
          </div>
        </StudioToolPopoverContent>
      </StudioToolSurface>
    </div>
  )
}
