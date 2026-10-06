/**
 * Comfy Runner (RunPod Serverless ComfyUI) checkpoint manifest.
 *
 * Single source of truth on the Next.js side for which model id maps to which
 * checkpoint and its own sampling defaults. LoRAs are not listed: any Civitai /
 * Hugging Face LoRA is fetched at request time (R2 → Volume).
 *
 * The Cloudflare Worker (`workers/execution/src/models/runner/checkpoints.ts`)
 * keeps an equivalent manifest — it's a separate package/build target and
 * can't import from `src/constants`, so the two are kept in sync by hand.
 * If you add/remove a checkpoint here, mirror the change there too.
 *
 * See docs/references/domains/runner.md.
 */

export const RUNNER_CHECKPOINT_FAMILIES = [
  'illustrious',
  'anima',
  'pony',
  'sdxl',
  // v4：DiT「Anima」（Cosmos-Predict2）——与 SDXL 的 anima_pencil（family 'anima'）
  // 是两套架构，独立家族。
  'anima-dit',
  // Z-Image（Tongyi-MAI，S3-DiT）——自己一套编码器 / VAE 的 DiT。
  'z-image',
  // Krea 2（from-scratch 12B DiT，Qwen3-VL 编码器）——与 Flux.1 Krea 无关。
  'krea2',
] as const

export type RunnerCheckpointFamily = (typeof RUNNER_CHECKPOINT_FAMILIES)[number]

export interface RunnerCheckpointManifestEntry {
  /** Matches the model's `externalModelId` — the ComfyUI `ckpt_name` minus extension. */
  id: string
  family: RunnerCheckpointFamily
  displayName: string
  /** Exact filename on the Volume. SDXL → `models/checkpoints/`; Anima DiT → `models/unet/`. */
  filename: string
  /** 缺省 = 官方权重不在 Civitai（Krea 2 只发在 HF 的 Comfy-Org/Krea-2）。 */
  civitaiModelVersionId?: number
  recommendedSampler: string
  recommendedScheduler: string
  /**
   * 这个底模自己的出图默认（步数蒸馏档、DiT 档与通用 SDXL 默认差得远）。缺省 =
   * `RUNNER_DEFAULT_STEPS` / `RUNNER_DEFAULT_CFG`。Worker 镜像同一份数。
   */
  recommendedSteps?: number
  recommendedCfg?: number
  /** ComfyUI `CLIPSetLastLayer` convention: 1 = no skip, 2 = stop at -2. Unused for Anima DiT. */
  clipSkip: number
  /** Prefixed onto the positive prompt for checkpoints with quality-tag conventions (e.g. Pony's score_9 tags). */
  recommendedPositivePrefix?: string
  /** Workflow architecture. Omitted = 'sdxl' (CheckpointLoaderSimple). 'anima' / 'zimage' / 'krea2' = DiT. */
  architecture?: 'sdxl' | 'anima' | 'zimage' | 'krea2'
}

export const RUNNER_CHECKPOINTS: readonly RunnerCheckpointManifestEntry[] = [
  {
    id: 'waiIllustriousSDXL_v150',
    family: 'illustrious',
    displayName: 'WAI-Illustrious-SDXL v15.0',
    filename: 'waiIllustriousSDXL_v150.safetensors',
    civitaiModelVersionId: 2167369,
    recommendedSampler: 'ddim',
    recommendedScheduler: 'normal',
    clipSkip: 2,
  },
  {
    id: 'animaPencilXL_v500',
    family: 'anima',
    displayName: 'Anima Pencil-XL v5.0.0',
    filename: 'animaPencilXL_v500.safetensors',
    civitaiModelVersionId: 597138,
    recommendedSampler: 'euler_ancestral',
    recommendedScheduler: 'normal',
    clipSkip: 1,
  },
  {
    id: 'ponyDiffusionV6XL',
    family: 'pony',
    displayName: 'Pony Diffusion V6 XL',
    filename: 'ponyDiffusionV6XL.safetensors',
    civitaiModelVersionId: 290640,
    recommendedSampler: 'dpmpp_2m_sde',
    recommendedScheduler: 'karras',
    clipSkip: 2,
    recommendedPositivePrefix: 'score_9, score_8_up, score_7_up',
  },
  {
    id: 'sdXL_v10VAEFix',
    family: 'sdxl',
    displayName: 'SDXL 1.0 (VAE Fix)',
    filename: 'sdXL_v10VAEFix.safetensors',
    civitaiModelVersionId: 128078,
    recommendedSampler: 'euler',
    recommendedScheduler: 'normal',
    clipSkip: 1,
  },
  // v4 Anima DiT 默认档（配方精确 Anima checkpoint 私有/下不到时的 T2 回退——LoRA
  // 本就在 Anima-Base 上训，用它近似很忠实）。落 models/unet/（配 UNETLoader）。
  {
    id: 'animaBase_v10',
    family: 'anima-dit',
    displayName: 'Anima Base v1.0',
    filename: 'anima-base-v1.0.safetensors',
    civitaiModelVersionId: 2945208,
    recommendedSampler: 'er_sde',
    recommendedScheduler: 'simple',
    // HF 卡：30–50 步、CFG 4–5。
    recommendedSteps: 30,
    recommendedCfg: 4,
    clipSkip: 1,
    architecture: 'anima',
  },
  // 步数蒸馏档（owner 09-28 定：euler · simple · 10 步 · CFG 1 · shift 3）。纯底模出图的
  // 默认；与 Base 同一套 Qwen 编码器 / VAE，同落 models/unet/。
  {
    id: 'animaTurbo_v11',
    family: 'anima-dit',
    displayName: 'Anima Turbo v1.1',
    filename: 'anima-turbo-v1.1.safetensors',
    civitaiModelVersionId: 3263843,
    recommendedSampler: 'euler',
    recommendedScheduler: 'simple',
    recommendedSteps: 10,
    recommendedCfg: 1,
    clipSkip: 1,
    architecture: 'anima',
  },
  // Z-Image Turbo 满精度（Comfy-Org 官方分包，与 Civitai 官方页同一文件）：采样照官方模板
  // res_multistep · simple · CFG 1 · shift 3，步数 owner 09-28 定 9。编码器 / VAE 另下。
  {
    id: 'zImageTurbo_bf16',
    family: 'z-image',
    displayName: 'Z-Image Turbo',
    filename: 'z_image_turbo_bf16.safetensors',
    civitaiModelVersionId: 2442439,
    recommendedSampler: 'res_multistep',
    recommendedScheduler: 'simple',
    recommendedSteps: 9,
    recommendedCfg: 1,
    clipSkip: 1,
    architecture: 'zimage',
  },
  // Krea 2 Turbo fp8（Comfy-Org/Krea-2 官方分包）：采样照官方模板 euler · simple ·
  // 8 步 · CFG 1。编码器 qwen3vl_4b 另下，VAE 与 Anima 共用。owner 2026-10-07 定接入，
  // 不加图片审核（许可证「合理内容过滤」的风险由 owner 承担，见 runner.md）。
  {
    id: 'krea2Turbo_fp8',
    family: 'krea2',
    displayName: 'Krea 2 Turbo',
    filename: 'krea2_turbo_fp8_scaled.safetensors',
    recommendedSampler: 'euler',
    recommendedScheduler: 'simple',
    recommendedSteps: 8,
    recommendedCfg: 1,
    clipSkip: 1,
    architecture: 'krea2',
  },
] as const

export const RUNNER_DEFAULT_STEPS = 30
export const RUNNER_DEFAULT_CFG = 7.5

export function getRunnerCheckpointById(
  id: string,
): RunnerCheckpointManifestEntry | undefined {
  return RUNNER_CHECKPOINTS.find((checkpoint) => checkpoint.id === id)
}

/**
 * 来源图配方的精确底模（Civitai 下载来的，不在清单里）借哪一档的出图默认：Anima 系
 * 版本名带 turbo 的是步数蒸馏档，照 Anima Turbo 出；其余不借（Worker 用 Anima 通用默认）。
 */
export function getRunnerSourceCheckpointDefaultsId(
  family: string,
  versionName: string,
): string | undefined {
  return family === 'anima-dit' && /turbo/i.test(versionName)
    ? 'animaTurbo_v11'
    : undefined
}

/** 这一档实际用的 CFG：用户填了用填的，没填用底模默认。 */
export function resolveRunnerCfg(
  checkpointId: string | undefined,
  cfgOverride?: number | null,
): number {
  if (cfgOverride != null && Number.isFinite(cfgOverride)) return cfgOverride
  const checkpoint = checkpointId
    ? getRunnerCheckpointById(checkpointId)
    : undefined
  return checkpoint?.recommendedCfg ?? RUNNER_DEFAULT_CFG
}

/**
 * CFG 恰好是 1 时 ComfyUI 整个跳过负面那一支（`cfg1_optimization`），负面词写了也不起作用。
 * 界面（负面 chip 让开）与助手（CFG 1 底模不推荐负面词）共用这一个判据。
 */
export function isRunnerNegativePromptInert(
  checkpointId: string | undefined,
  cfgOverride?: number | null,
): boolean {
  return Math.abs(resolveRunnerCfg(checkpointId, cfgOverride) - 1) < 1e-9
}
