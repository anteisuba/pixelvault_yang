import { describe, expect, it } from 'vitest'

import {
  buildRunnerWorkflowFromRequest,
  RunnerLoraUnavailableError,
  RunnerUnknownCheckpointError,
  type RunnerGenerationRequestInput,
} from './request-builder'

const FIXED_SEED = 30224931
const fixedRandomSeed = () => FIXED_SEED

function baseRequest(
  overrides: Partial<RunnerGenerationRequestInput> = {},
): RunnerGenerationRequestInput {
  return {
    externalModelId: 'waiIllustriousSDXL_v150',
    prompt: 'a cat in a garden',
    width: 1024,
    height: 1024,
    loras: [],
    ...overrides,
  }
}

describe('buildRunnerWorkflowFromRequest', () => {
  it('resolves the checkpoint manifest and applies its recommended defaults', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest(),
      fixedRandomSeed,
    )

    expect(workflow.checkpoint.inputs.ckpt_name).toBe(
      'waiIllustriousSDXL_v150.safetensors',
    )
    // WAI's recommended sampler/scheduler/clipSkip from the manifest.
    expect(workflow.sampler.inputs.sampler_name).toBe('ddim')
    expect(workflow.sampler.inputs.scheduler).toBe('normal')
    expect(workflow['clip-skip'].inputs.stop_at_clip_layer).toBe(-2)
  })

  it('falls back to the injected random seed when none is provided', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest(),
      fixedRandomSeed,
    )
    expect(workflow.sampler.inputs.seed).toBe(FIXED_SEED)
  })

  it('uses an explicit seed over the random fallback', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({ seed: 42 }),
      fixedRandomSeed,
    )
    expect(workflow.sampler.inputs.seed).toBe(42)
  })

  it('applies default steps/cfg when not provided', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest(),
      fixedRandomSeed,
    )
    expect(workflow.sampler.inputs.steps).toBe(30)
    expect(workflow.sampler.inputs.cfg).toBe(7.5)
  })

  it('resolves an allowlisted LoRA URL to its Volume filename', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({
        loras: [
          {
            url: 'https://civitai.com/api/download/models/1672783?type=Model',
            scale: 0.9,
          },
        ],
      }),
      fixedRandomSeed,
    )

    expect(workflow['lora-0'].inputs).toMatchObject({
      lora_name: 'tutenstein-cleo-carter-v1.safetensors',
      strength_model: 0.9,
      strength_clip: 0.9,
    })
  })

  it('defaults LoRA strength to 1 when scale is omitted', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({
        loras: [{ url: 'https://civitai.com/api/download/models/1672783' }],
      }),
      fixedRandomSeed,
    )
    expect(workflow['lora-0'].inputs.strength_model).toBe(1)
  })

  it('throws RunnerUnknownCheckpointError for an unrecognized checkpoint id', () => {
    expect(() =>
      buildRunnerWorkflowFromRequest(
        baseRequest({ externalModelId: 'not-a-real-checkpoint' }),
        fixedRandomSeed,
      ),
    ).toThrow(RunnerUnknownCheckpointError)
  })

  it('throws RunnerLoraUnavailableError for a LoRA not on the runner allowlist', () => {
    expect(() =>
      buildRunnerWorkflowFromRequest(
        baseRequest({
          loras: [{ url: 'https://civitai.com/api/download/models/9999999' }],
        }),
        fixedRandomSeed,
      ),
    ).toThrow(RunnerLoraUnavailableError)
  })

  it('forwards referenceImageName + denoise into an img2img workflow', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({ referenceImageName: 'reference.png', denoise: 0.3 }),
      fixedRandomSeed,
    )

    expect(workflow['load-image'].inputs.image).toBe('reference.png')
    expect(workflow['vae-encode']).toBeDefined()
    expect(workflow.latent).toBeUndefined()
    expect(workflow.sampler.inputs.denoise).toBe(0.3)
    expect(workflow.sampler.inputs.latent_image).toEqual(['vae-encode', 0])
  })

  it('stays txt2img (EmptyLatentImage) when no reference image is given', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest(),
      fixedRandomSeed,
    )
    expect(workflow.latent.class_type).toBe('EmptyLatentImage')
    expect(workflow['load-image']).toBeUndefined()
    expect(workflow.sampler.inputs.denoise).toBe(1.0)
  })
})
