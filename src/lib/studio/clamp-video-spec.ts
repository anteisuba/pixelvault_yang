/**
 * 换视频型号时，把停留在上一个型号档位上的规格收窄到新型号真支持的那一档。
 *
 * ⚠ 这不是锦上添花，是堵一条**静默 400**：`SET_OPTION_ID` 只换 optionId，
 * `videoDuration` / `videoResolution` 原样留着。从 Seedance 2.5（到 30 秒）切到
 * 一个只到 10 秒的型号，时长仍是 24 —— 服务端
 * `video-generation-validation.service.ts` 按 `supportedDurations` 精确比对，
 * 于是「什么都没动，只换了个模型」就报错。`StudioVideoParams` 当年那条注释记的
 * 「不动参数能跑、一动就报错」是同一个病的另一面。
 *
 * 收窄规则刻意保守：
 * - 时长取**最接近**旧值的那一档（并列时取小的）—— 用户挑 24 秒是想要长的，
 *   落到新型号的上限比落回默认值更贴近意图；
 * - 分辨率不做「最接近」，新型号没有这一档就**清空**（null = 交给 provider
 *   默认）。分辨率是离散的画质档，猜一个相邻值等于替用户改了画质。
 * - 比例同理：不在候选里就清回 `16:9`（`VIDEO_GENERATION.DEFAULT_ASPECT_RATIO`
 *   由调用方传入，这里不 import 常量，保持纯函数无依赖）。
 */
export interface VideoSpecClampInput {
  durations: readonly number[]
  resolutions: readonly string[]
  aspectRatios: readonly string[]
  current: {
    duration: number
    resolution: string | null
    aspectRatio: string
  }
  fallbackAspectRatio: string
}

export interface VideoSpecClampResult {
  duration?: number
  resolution?: string | null
  aspectRatio?: string
}

/**
 * 返回**需要改的那些字段**；不需要改就不出现在结果里 —— 调用方据此决定要不要
 * 派发，空对象 = 一个 action 都不发（避免每次选型号都刷一遍 state）。
 */
export function clampVideoSpecToModel({
  durations,
  resolutions,
  aspectRatios,
  current,
  fallbackAspectRatio,
}: VideoSpecClampInput): VideoSpecClampResult {
  const result: VideoSpecClampResult = {}

  if (durations.length > 0 && !durations.includes(current.duration)) {
    // 并列时取小的：`reduce` 只在**严格更近**时才换，天然保住先出现的那个，
    // 而档位表本身是升序的。
    result.duration = durations.reduce((best, candidate) =>
      Math.abs(candidate - current.duration) < Math.abs(best - current.duration)
        ? candidate
        : best,
    )
  }

  if (
    current.resolution !== null &&
    resolutions.length > 0 &&
    !resolutions.includes(current.resolution)
  ) {
    result.resolution = null
  }

  if (aspectRatios.length > 0 && !aspectRatios.includes(current.aspectRatio)) {
    result.aspectRatio = aspectRatios.includes(fallbackAspectRatio)
      ? fallbackAspectRatio
      : aspectRatios[0]
  }

  return result
}
