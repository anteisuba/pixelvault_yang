import 'server-only'

import { determineRunnerCheckpointFidelity } from '@/lib/runner-checkpoint-fidelity'
import { resolveCivitaiCheckpointByReference } from '@/services/civitai-lora.service'
import type { RunnerCheckpointSpec } from '@/types'

/**
 * Runner v3 — 出图前把配方的底模引用（checkpointVersionId/Name）分级成一个可执行
 * 结果：T1 给 fork 下载的精确 checkpoint 规格、T2 标记近似、T3 抛错。
 *
 * checkpoint 下载走 **fork GPU 侧**（不像 LoRA 走 R2）：app 只解析出 Civitai 下载
 * URL + 目标文件名，fork 用它的 CIVITAI_KEY 直下到 Volume。设计：
 * docs/plans/comfy-runner-v3-checkpoint-ondemand.md §1/§6。
 */

export class RunnerCheckpointError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunnerCheckpointError'
  }
}

export interface PreparedRunnerCheckpoint {
  /** T1：fork 要下载的精确 checkpoint（缺省＝不覆盖预烤底模）。 */
  runnerCheckpoint?: RunnerCheckpointSpec
  /** T2：拿不到精确底模、用兼容预烤档近似出图（UI 提示可能有差异）。 */
  approximate: boolean
}

/**
 * checkpoint 落盘文件名——app / worker(workflow ckpt_name) / fork 三方共用的契约。
 * 用 `ckpt-` 前缀与 v2 的 LoRA 文件名（`civitai-<id>`）区分开。
 */
export function deriveRunnerCheckpointFilename(modelVersionId: number): string {
  return `civitai-ckpt-${modelVersionId}.safetensors`
}

export async function prepareRunnerCheckpoint(ref: {
  checkpointVersionId?: number | null
  checkpointName?: string | null
  /** LoRA 的 baseModel（权威架构信号）——无精确 checkpoint 时用它判 DiT/T2/T3。 */
  loraBaseModel?: string | null
}): Promise<PreparedRunnerCheckpoint> {
  const fidelity = await determineRunnerCheckpointFidelity(
    {
      checkpointVersionId: ref.checkpointVersionId,
      checkpointName: ref.checkpointName,
      loraBaseModel: ref.loraBaseModel,
    },
    resolveCivitaiCheckpointByReference,
  )

  switch (fidelity.tier) {
    case 'faithful':
      return {
        runnerCheckpoint: {
          filename: deriveRunnerCheckpointFilename(
            fidelity.checkpoint.modelVersionId,
          ),
          downloadUrl: fidelity.checkpoint.downloadUrl,
          // v4：DiT「Anima」底模是 UNET-only，落 diffusion_models/（fork→models/unet/）。
          ...(fidelity.family === 'anima-dit'
            ? { targetDir: 'diffusion_models' as const }
            : {}),
        },
        approximate: false,
      }
    case 'approximate':
      return { approximate: true }
    case 'unsupported':
      throw new RunnerCheckpointError(
        `此 LoRA 的底模架构${
          fidelity.baseModelRaw ? `（${fidelity.baseModelRaw}）` : ''
        }暂不支持自托管生成`,
      )
  }
}
