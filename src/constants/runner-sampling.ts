/**
 * ComfyUI core sampler/scheduler values accepted by the managed Runner.
 * Keep this list aligned with `workers/execution/src/models/runner/sampling.ts`.
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
 * them as unsupported instead of silently substituting a different sampler.
 */
export function normalizeCivitaiRunnerSampling(
  samplerRaw?: string,
  schedulerRaw?: string,
): NormalizedRunnerSampling {
  let samplerLabel = samplerRaw ? normalizeLabel(samplerRaw) : ''
  let scheduler = schedulerRaw
    ? SCHEDULER_ALIASES[normalizeLabel(schedulerRaw)]
    : undefined

  if (samplerLabel) {
    for (const [alias, value] of Object.entries(SCHEDULER_ALIASES)) {
      if (samplerLabel === alias || samplerLabel.endsWith(` ${alias}`)) {
        scheduler ??= value
        samplerLabel = samplerLabel.slice(0, -alias.length).trim()
        break
      }
    }
  }

  return {
    sampler: samplerLabel ? SAMPLER_ALIASES[samplerLabel] : undefined,
    scheduler,
  }
}
