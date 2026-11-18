/**
 * ComfyUI core sampler/scheduler values accepted by the managed Runner.
 * Keep this list aligned with `workers/execution/src/providers/runner/sampling.ts`.
 */
export const RUNNER_SAMPLERS = [
  'euler',
  'euler_ancestral',
  'heun',
  'dpm_2',
  'dpm_2_ancestral',
  'lms',
  'dpmpp_2s_ancestral',
  'dpmpp_sde',
  'dpmpp_sde_gpu',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde',
  'dpmpp_3m_sde_gpu',
  'ddpm',
  'lcm',
  'ipndm',
  'ipndm_v',
  'deis',
  'er_sde',
  'ddim',
  'uni_pc',
  'uni_pc_bh2',
  'res_multistep',
] as const

export type RunnerSampler = (typeof RUNNER_SAMPLERS)[number]

export const RUNNER_SCHEDULERS = [
  'normal',
  'karras',
  'exponential',
  'simple',
  'ddim_uniform',
  'sgm_uniform',
  'beta',
  'linear_quadratic',
  'kl_optimal',
] as const

export type RunnerScheduler = (typeof RUNNER_SCHEDULERS)[number]

/**
 * 配方 clip skip 的上限（A1111 口径 1 = 不跳）：ComfyUI `CLIPSetLastLayer` 在 SDXL 的
 * CLIP-L 上最多停到 -12。Worker 用相对路径读同一个数（本文件无 import）。
 */
export const RUNNER_CLIP_SKIP_MAX = 12

const SAMPLER_ALIASES: Readonly<Record<string, RunnerSampler>> = {
  euler: 'euler',
  'euler a': 'euler_ancestral',
  'euler ancestral': 'euler_ancestral',
  heun: 'heun',
  dpm2: 'dpm_2',
  'dpm 2': 'dpm_2',
  'dpm2 a': 'dpm_2_ancestral',
  'dpm 2 a': 'dpm_2_ancestral',
  lms: 'lms',
  'dpm++ 2s a': 'dpmpp_2s_ancestral',
  'dpm++ sde': 'dpmpp_sde',
  'dpm++ sde gpu': 'dpmpp_sde_gpu',
  'dpm++ 2m': 'dpmpp_2m',
  'dpm++ 2m sde': 'dpmpp_2m_sde',
  'dpm++ 2m sde gpu': 'dpmpp_2m_sde_gpu',
  'dpm++ 3m sde': 'dpmpp_3m_sde',
  'dpm++ 3m sde gpu': 'dpmpp_3m_sde_gpu',
  ddpm: 'ddpm',
  lcm: 'lcm',
  ipndm: 'ipndm',
  'ipndm v': 'ipndm_v',
  deis: 'deis',
  'er sde': 'er_sde',
  ddim: 'ddim',
  'uni pc': 'uni_pc',
  'uni pc bh2': 'uni_pc_bh2',
}

const SCHEDULER_ALIASES: Readonly<Record<string, RunnerScheduler>> = {
  normal: 'normal',
  karras: 'karras',
  exponential: 'exponential',
  simple: 'simple',
  'ddim uniform': 'ddim_uniform',
  'sgm uniform': 'sgm_uniform',
  beta: 'beta',
  'linear quadratic': 'linear_quadratic',
  'kl optimal': 'kl_optimal',
  // A1111 的 Uniform = k-diffusion 的均匀 sigma，即 ComfyUI 的 normal。
  uniform: 'normal',
}

/**
 * A1111 / Forge 1.9+ 导出的 `Schedule type: Automatic` = 「用这个采样器自己的默认」。
 * k-diffusion 系采样器的默认是均匀 sigma（ComfyUI normal）；DDIM 的默认是它自己的
 * 均匀 timestep 间隔（ComfyUI ddim_uniform）。
 */
const AUTOMATIC_SCHEDULER_LABEL = 'automatic'
const AUTOMATIC_SCHEDULER_DEFAULT: RunnerScheduler = 'normal'
const AUTOMATIC_SCHEDULER_BY_SAMPLER: Readonly<
  Partial<Record<RunnerSampler, RunnerScheduler>>
> = {
  ddim: 'ddim_uniform',
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

export interface NormalizedRunnerSampling {
  sampler?: RunnerSampler
  scheduler?: RunnerScheduler
}

/**
 * Converts common A1111/Civitai labels such as `DPM++ 2M Karras` into the
 * exact ComfyUI values. Unknown parts stay undefined so callers can report
 * them as unsupported instead of silently substituting a different sampler —
 * ⛔ never pass a raw label through: ComfyUI rejects an unknown scheduler
 * with a 400. `Automatic` resolves to the sampler's own default.
 */
export function normalizeCivitaiRunnerSampling(
  samplerRaw?: string,
  schedulerRaw?: string,
): NormalizedRunnerSampling {
  let samplerLabel = samplerRaw ? normalizeLabel(samplerRaw) : ''
  const schedulerLabel = schedulerRaw ? normalizeLabel(schedulerRaw) : ''
  const isAutomatic = schedulerLabel === AUTOMATIC_SCHEDULER_LABEL
  let scheduler = schedulerLabel ? SCHEDULER_ALIASES[schedulerLabel] : undefined

  if (samplerLabel) {
    for (const [alias, value] of Object.entries(SCHEDULER_ALIASES)) {
      if (samplerLabel === alias || samplerLabel.endsWith(` ${alias}`)) {
        scheduler ??= value
        samplerLabel = samplerLabel.slice(0, -alias.length).trim()
        break
      }
    }
  }

  const sampler = samplerLabel ? SAMPLER_ALIASES[samplerLabel] : undefined
  if (isAutomatic && !scheduler) {
    scheduler =
      (sampler ? AUTOMATIC_SCHEDULER_BY_SAMPLER[sampler] : undefined) ??
      AUTOMATIC_SCHEDULER_DEFAULT
  }
  return { sampler, scheduler }
}
