import { describe, expect, it } from 'vitest'

import {
  normalizeCivitaiRunnerSampling,
  RUNNER_SCHEDULERS,
} from '@/constants/runner-sampling'

describe('normalizeCivitaiRunnerSampling', () => {
  it('maps A1111 "Automatic" to ComfyUI normal for k-diffusion samplers', () => {
    expect(normalizeCivitaiRunnerSampling('DPM++ 2M', 'Automatic')).toEqual({
      sampler: 'dpmpp_2m',
      scheduler: 'normal',
    })
    expect(normalizeCivitaiRunnerSampling('Euler a', 'automatic')).toEqual({
      sampler: 'euler_ancestral',
      scheduler: 'normal',
    })
  })

  it('maps "Automatic" on DDIM to its own uniform timestep spacing', () => {
    expect(normalizeCivitaiRunnerSampling('DDIM', 'Automatic')).toEqual({
      sampler: 'ddim',
      scheduler: 'ddim_uniform',
    })
  })

  it('maps A1111 "Uniform" to ComfyUI normal', () => {
    expect(normalizeCivitaiRunnerSampling('Euler', 'Uniform').scheduler).toBe(
      'normal',
    )
  })

  it('never passes an unknown scheduler through — it stays undefined (checkpoint default)', () => {
    for (const raw of ['Polyexponential', 'Align Your Steps', 'mystery']) {
      const out = normalizeCivitaiRunnerSampling('Euler', raw)
      expect(out.scheduler).toBeUndefined()
    }
  })

  it('only ever returns schedulers ComfyUI accepts', () => {
    for (const raw of ['Automatic', 'Uniform', 'Karras', 'SGM Uniform']) {
      const { scheduler } = normalizeCivitaiRunnerSampling('DPM++ 2M', raw)
      expect(RUNNER_SCHEDULERS).toContain(scheduler)
    }
  })
})
