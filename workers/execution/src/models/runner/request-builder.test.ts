import { describe, expect, it } from 'vitest'

import {
  buildRunnerWorkflowFromRequest,
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

  it('preserves an exact uint64 seed string for fork-side conversion', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({ seed: '5536891017203' }),
      fixedRandomSeed,
    )
    expect(workflow.sampler.inputs.seed).toBe('5536891017203')
  })

  it('applies allowlisted sampler and scheduler overrides', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({ sampler: 'dpmpp_2m', scheduler: 'karras' }),
      fixedRandomSeed,
    )
    expect(workflow.sampler.inputs.sampler_name).toBe('dpmpp_2m')
    expect(workflow.sampler.inputs.scheduler).toBe('karras')
  })

  it('applies default steps/cfg when not provided', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest(),
      fixedRandomSeed,
    )
    expect(workflow.sampler.inputs.steps).toBe(30)
    expect(workflow.sampler.inputs.cfg).toBe(7.5)
  })

  it('applies the app-provided LoRA filename + scale (v2: no allowlist resolve)', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({
        loras: [{ filename: 'civitai-3118200.safetensors', scale: 0.9 }],
      }),
      fixedRandomSeed,
    )

    expect(workflow['lora-0'].inputs).toMatchObject({
      lora_name: 'civitai-3118200.safetensors',
      strength_model: 0.9,
      strength_clip: 0.9,
    })
  })

  it('defaults LoRA strength to 1 when scale is omitted', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({
        loras: [{ filename: 'civitai-3118200.safetensors' }],
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

  it('v3 T1: checkpointOverrideFilename overrides the baked checkpoint (any externalModelId) + uses SDXL override defaults', () => {
    const workflow = buildRunnerWorkflowFromRequest(
      baseRequest({
        // Bogus baked id — the override must bypass the manifest lookup, not throw.
        externalModelId: 'not-a-baked-checkpoint',
        checkpointOverrideFilename: 'civitai-ckpt-597138.safetensors',
      }),
      fixedRandomSeed,
    )

    expect(workflow.checkpoint.inputs.ckpt_name).toBe(
      'civitai-ckpt-597138.safetensors',
    )
    // Override defaults, not WAI's manifest ddim.
    expect(workflow.sampler.inputs.sampler_name).toBe('euler_ancestral')
    expect(workflow.sampler.inputs.scheduler).toBe('normal')
  })

  describe('v4 Anima DiT dispatch (architecture: "anima")', () => {
    it('builds the DiT graph (UNETLoader + Qwen CLIP/VAE + ModelSamplingAuraFlow), not CheckpointLoaderSimple', () => {
      const workflow = buildRunnerWorkflowFromRequest(
        baseRequest({
          architecture: 'anima',
          externalModelId: 'animaBase_v10',
        }),
        fixedRandomSeed,
      )
      // DiT loaders present, SDXL nodes absent.
      expect(workflow.unet.class_type).toBe('UNETLoader')
      expect(workflow.unet.inputs.unet_name).toBe('anima-base-v1.0.safetensors')
      expect(workflow['clip-loader'].class_type).toBe('CLIPLoader')
      expect(workflow['clip-loader'].inputs.clip_name).toBe(
        'qwen_3_06b_base.safetensors',
      )
      expect(workflow['clip-loader'].inputs.type).toBe('stable_diffusion')
      expect(workflow['vae-loader'].inputs.vae_name).toBe(
        'qwen_image_vae.safetensors',
      )
      expect(workflow['model-sampling'].class_type).toBe(
        'ModelSamplingAuraFlow',
      )
      expect(workflow['model-sampling'].inputs.shift).toBe(3.0)
      expect(workflow.checkpoint).toBeUndefined()
      expect(workflow['clip-skip']).toBeUndefined()
      // Anima sampler defaults from the manifest entry.
      expect(workflow.sampler.inputs.sampler_name).toBe('er_sde')
      expect(workflow.sampler.inputs.scheduler).toBe('simple')
      expect(workflow.sampler.inputs.cfg).toBe(4)
    })

    it('supports pure Anima Base generation with an empty LoRA list', () => {
      const workflow = buildRunnerWorkflowFromRequest(
        baseRequest({
          architecture: 'anima',
          externalModelId: 'animaBase_v10',
          loras: [],
        }),
        fixedRandomSeed,
      )

      expect(workflow['lora-0']).toBeUndefined()
      expect(workflow['model-sampling'].inputs.model).toEqual(['unet', 0])
      expect(workflow.sampler.inputs.model).toEqual(['model-sampling', 0])
    })

    it('applies 4x-AnimeSharp after Anima VAE decode when requested', () => {
      const workflow = buildRunnerWorkflowFromRequest(
        baseRequest({
          architecture: 'anima',
          externalModelId: 'animaBase_v10',
          upscalerModelFilename: '4x-AnimeSharp.pth',
        }),
        fixedRandomSeed,
      )

      expect(workflow['upscale-model'].inputs.model_name).toBe(
        '4x-AnimeSharp.pth',
      )
      expect(workflow['upscale-image'].inputs.image).toEqual(['vae-decode', 0])
      expect(workflow['save-image'].inputs.images).toEqual(['upscale-image', 0])
    })

    it('T1 override: downloaded Anima checkpoint feeds UNETLoader + Anima override sampler', () => {
      const workflow = buildRunnerWorkflowFromRequest(
        baseRequest({
          architecture: 'anima',
          externalModelId: 'animaBase_v10',
          checkpointOverrideFilename: 'civitai-ckpt-3108589.safetensors',
        }),
        fixedRandomSeed,
      )
      expect(workflow.unet.inputs.unet_name).toBe(
        'civitai-ckpt-3108589.safetensors',
      )
      expect(workflow.sampler.inputs.sampler_name).toBe('er_sde')
    })

    it('chains the Anima LoRA model-only (LoraLoaderModelOnly, no clip strength)', () => {
      const workflow = buildRunnerWorkflowFromRequest(
        baseRequest({
          architecture: 'anima',
          externalModelId: 'animaBase_v10',
          loras: [{ filename: 'civitai-3076650.safetensors', scale: 0.6 }],
        }),
        fixedRandomSeed,
      )
      expect(workflow['lora-0'].class_type).toBe('LoraLoaderModelOnly')
      expect(workflow['lora-0'].inputs.lora_name).toBe(
        'civitai-3076650.safetensors',
      )
      expect(workflow['lora-0'].inputs.strength_model).toBe(0.6)
      expect(workflow['lora-0'].inputs.strength_clip).toBeUndefined()
      // ModelSamplingAuraFlow wraps the LoRA-patched model.
      expect(workflow['model-sampling'].inputs.model).toEqual(['lora-0', 0])
    })
  })
})
