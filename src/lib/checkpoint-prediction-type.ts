/**
 * SDXL 底模的训练目标（采样方式）。同是 SDXL 架构、Civitai 上 baseModel 都写
 * NoobAI / Illustrious，但 v-pred 与 Rectified-Flow 的底模必须在工作流里显式声明，
 * 按默认 eps 采样会出灰白发糊（v-pred）或一团噪点色块（RF）。
 *
 * 只能看名字：文件头不可信——ChenkinNoob-XL Rectified-Flow v0.3 的
 * `modelspec.prediction_type` 写的是 `epsilon`，也没有 ComfyUI 认的 `v_pred` 键
 * （2026-11-19 实测）；Civitai 的 baseModelType 全是 "Standard"。作者都把它写进
 * 模型名 / 版本名 / 文件名（`… Rectified-Flow`、`3EP (RF)`、`… V-Pred`）。
 */

export type CheckpointPredictionType = 'epsilon' | 'v_prediction' | 'flow'

// 「Rectified Flow」或独立的 RF 记号。单写 Rectified 不算：NoobAIXL-Rectified-6 Steps
// 是 Rectified Diffusion 蒸馏，仍是 eps。
const FLOW_PATTERN = /rectified[\s_-]*flow|(?:^|[^a-z0-9])rf(?:[^a-z0-9]|$)/i
const V_PRED_PATTERN = /v[\s_-]?pred/i
const EPSILON_PATTERN = /(?:^|[^a-z0-9])eps(?:ilon)?(?:[^a-z0-9]|$)/i

function readSignal(text: string | null | undefined) {
  if (!text) return null
  const signals = new Set<CheckpointPredictionType>()
  if (FLOW_PATTERN.test(text)) signals.add('flow')
  if (V_PRED_PATTERN.test(text)) signals.add('v_prediction')
  if (EPSILON_PATTERN.test(text)) signals.add('epsilon')
  // 一个名字里同时写了两种（「从 vpred 版继续训成 RF」之类）就不从它判，看下一个。
  return signals.size === 1 ? [...signals][0]! : null
}

/**
 * 版本名最具体（同一个 model 下 `2.5EP (vpred)` 与 `3EP (RF)` 并存），其次文件名，
 * 最后模型名。都没写就是普通 eps。
 */
export function inferCheckpointPredictionType(names: {
  versionName?: string | null
  fileName?: string | null
  modelName?: string | null
}): CheckpointPredictionType {
  return (
    readSignal(names.versionName) ??
    readSignal(names.fileName) ??
    readSignal(names.modelName) ??
    'epsilon'
  )
}
