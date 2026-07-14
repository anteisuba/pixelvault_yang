/** Keep aligned with `src/constants/runner-sampling.ts`. */
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

export function isRunnerSampler(value: string): value is RunnerSampler {
  return (RUNNER_SAMPLERS as readonly string[]).includes(value)
}

export function isRunnerScheduler(value: string): value is RunnerScheduler {
  return (RUNNER_SCHEDULERS as readonly string[]).includes(value)
}
