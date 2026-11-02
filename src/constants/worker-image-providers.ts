/**
 * 执行 Worker 出图服务商的**共享契约**（o-worker 第 3 步）。
 *
 * Next 侧「哪些服务商可以派给 Worker」和 Worker 侧「哪些服务商有驱动」读的是同一份
 * 名单：在这里加一家，两边一起变；Worker 那边少写一个驱动，类型检查直接报错，
 * ⛔ 不会再出现「Next 派过去了、Worker 说 not migrated」。
 *
 * ⚠ 这个文件**不 import 任何东西**：Worker 单独打包，只认相对路径，不认 `@/`。
 *
 * - `single-step`：一次请求拿回图（Worker 里就是一个 `generate-<x>-image` 步骤，
 *   通用分支统一处理）。
 * - `multi-step`：先提交再轮询（fal / Ideogram / Replicate / Runner），Worker 里走
 *   通用的「提交 → 轮询 → 落 R2」流程（`runMultiStepImageDriver`）。
 */
export const WORKER_IMAGE_PROVIDER_MODES = {
  openai: 'single-step',
  gemini: 'single-step',
  huggingface: 'single-step',
  novelai: 'single-step',
  pixai: 'single-step',
  volcengine: 'single-step',
  // BytePlus ModelArk = 同一套 Ark 出图 API 的国际站，站点按 providerBaseUrl 区分。
  byteplus: 'single-step',
  fal: 'multi-step',
  ideogram: 'multi-step',
  replicate: 'multi-step',
  // Runner 冷启动以分钟计，只能异步。
  runner: 'multi-step',
} as const

export type WorkerImageProviderId = keyof typeof WORKER_IMAGE_PROVIDER_MODES

export type WorkerSingleStepImageProviderId = {
  [K in WorkerImageProviderId]: (typeof WORKER_IMAGE_PROVIDER_MODES)[K] extends 'single-step'
    ? K
    : never
}[WorkerImageProviderId]

export type WorkerMultiStepImageProviderId = Exclude<
  WorkerImageProviderId,
  WorkerSingleStepImageProviderId
>

export const WORKER_IMAGE_PROVIDER_IDS = Object.keys(
  WORKER_IMAGE_PROVIDER_MODES,
) as WorkerImageProviderId[]

export function isWorkerImageProviderId(
  value: string,
): value is WorkerImageProviderId {
  return Object.prototype.hasOwnProperty.call(
    WORKER_IMAGE_PROVIDER_MODES,
    value,
  )
}
