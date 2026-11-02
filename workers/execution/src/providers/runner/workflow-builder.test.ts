import { describe, expect, it } from 'vitest'

import {
  buildComfyWorkflow,
  type RunnerWorkflowInput,
} from './workflow-builder'

function baseInput(
  overrides: Partial<RunnerWorkflowInput> = {},
): RunnerWorkflowInput {
  return {
    checkpointFilename: 'waiIllustriousSDXL_v150.safetensors',
    positivePrompt: 'a cat in a garden',
    width: 1024,
    height: 1024,
    seed: 30224931,
    steps: 30,
    cfg: 7.5,
    samplerName: 'ddim',
    scheduler: 'normal',
    clipSkip: 2,
    loras: [],
    ...overrides,
  }
}

describe('buildComfyWorkflow', () => {
  it('adds bilinear latent upscale and a second sampler before decoding', () => {
    const workflow = buildComfyWorkflow(
      baseInput({
        hires: { width: 968, height: 1424, denoise: 0.45, steps: 18, cfg: 6 },
      }),
    )
    expect(workflow['hires-latent']).toEqual({
      class_type: 'LatentUpscale',
      inputs: {
        samples: ['sampler', 0],
        upscale_method: 'bilinear',
        width: 968,
        height: 1424,
        crop: 'disabled',
      },
    })
    expect(workflow['hires-sampler']).toEqual({
      class_type: 'KSampler',
      inputs: {
        ...workflow.sampler.inputs,
        latent_image: ['hires-latent', 0],
        steps: 18,
        cfg: 6,
        denoise: 0.45,
      },
    })
    expect(workflow['vae-decode'].inputs.samples).toEqual(['hires-sampler', 0])
  })

  it('keeps the original single-pass graph when hires is absent', () => {
    const workflow = buildComfyWorkflow(baseInput())
    expect(workflow['hires-latent']).toBeUndefined()
    expect(workflow['hires-sampler']).toBeUndefined()
    expect(workflow['vae-decode'].inputs.samples).toEqual(['sampler', 0])
  })
  it('builds the validated §7.1 template shape with zero LoRAs', () => {
    const workflow = buildComfyWorkflow(baseInput())

    expect(workflow.checkpoint).toEqual({
      class_type: 'PixelVaultCheckpointLoader',
      inputs: { ckpt_name: 'waiIllustriousSDXL_v150.safetensors' },
    })

    // No LoraLoader node — CLIPSetLastLayer reads the checkpoint's own clip.
    expect(workflow['lora-0']).toBeUndefined()
    expect(workflow['clip-skip']).toEqual({
      class_type: 'CLIPSetLastLayer',
      inputs: { clip: ['checkpoint', 1], stop_at_clip_layer: -2 },
    })

    expect(workflow['positive-prompt']).toEqual({
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['clip-skip', 0], text: 'a cat in a garden' },
    })
    expect(workflow['negative-prompt']).toEqual({
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['clip-skip', 0], text: '' },
    })
    expect(workflow.latent).toEqual({
      class_type: 'EmptyLatentImage',
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    })
    expect(workflow.sampler).toEqual({
      class_type: 'KSampler',
      inputs: {
        seed: 30224931,
        steps: 30,
        cfg: 7.5,
        sampler_name: 'ddim',
        scheduler: 'normal',
        denoise: 1.0,
        // Zero LoRAs → sampler reads the checkpoint's model output directly.
        model: ['checkpoint', 0],
        positive: ['positive-prompt', 0],
        negative: ['negative-prompt', 0],
        latent_image: ['latent', 0],
      },
    })
    expect(workflow['vae-decode']).toEqual({
      class_type: 'VAEDecode',
      inputs: { samples: ['sampler', 0], vae: ['checkpoint', 2] },
    })
    expect(workflow['save-image']).toEqual({
      class_type: 'PixelVaultSaveImage',
      inputs: {
        images: ['vae-decode', 0],
        filename_prefix: 'pixelvault',
        audit: ['checkpoint', 3],
      },
    })
  })

  it('uses a custom filename_prefix when provided', () => {
    const workflow = buildComfyWorkflow(baseInput({ filenamePrefix: 'clone' }))
    expect(workflow['save-image'].inputs.filename_prefix).toBe('clone')
  })

  it('routes the decoded image through an optional upscale model', () => {
    const workflow = buildComfyWorkflow(
      baseInput({ upscalerModelFilename: '4x-AnimeSharp.pth' }),
    )

    expect(workflow['upscale-model']).toEqual({
      class_type: 'UpscaleModelLoader',
      inputs: { model_name: '4x-AnimeSharp.pth' },
    })
    expect(workflow['upscale-image']).toEqual({
      class_type: 'ImageUpscaleWithModel',
      inputs: {
        upscale_model: ['upscale-model', 0],
        image: ['vae-decode', 0],
      },
    })
    expect(workflow['save-image'].inputs.images).toEqual(['upscale-image', 0])
  })

  it('chains a single LoRA between the checkpoint and CLIPSetLastLayer/KSampler', () => {
    const workflow = buildComfyWorkflow(
      baseInput({
        loras: [
          {
            filename: 'tutenstein-cleo-carter-v1.safetensors',
            strengthModel: 1.0,
            strengthClip: 1.0,
          },
        ],
      }),
    )

    expect(workflow['lora-0']).toEqual({
      class_type: 'PixelVaultLoraLoader',
      inputs: {
        model: ['checkpoint', 0],
        clip: ['checkpoint', 1],
        lora_name: 'tutenstein-cleo-carter-v1.safetensors',
        strength_model: 1.0,
        strength_clip: 1.0,
        audit: ['checkpoint', 3],
      },
    })
    // clip-skip and the sampler's model input now read from the LoRA node.
    expect(workflow['clip-skip'].inputs.clip).toEqual(['lora-0', 1])
    expect(workflow.sampler.inputs.model).toEqual(['lora-0', 0])
  })

  it('chains multiple LoRAs in order', () => {
    const workflow = buildComfyWorkflow(
      baseInput({
        loras: [
          { filename: 'a.safetensors', strengthModel: 1, strengthClip: 1 },
          { filename: 'b.safetensors', strengthModel: 0.8, strengthClip: 0.8 },
        ],
      }),
    )

    expect(workflow['lora-0'].inputs).toMatchObject({
      model: ['checkpoint', 0],
      clip: ['checkpoint', 1],
      lora_name: 'a.safetensors',
    })
    expect(workflow['lora-1'].inputs).toMatchObject({
      model: ['lora-0', 0],
      clip: ['lora-0', 1],
      lora_name: 'b.safetensors',
      strength_model: 0.8,
      strength_clip: 0.8,
    })
    expect(workflow['clip-skip'].inputs.clip).toEqual(['lora-1', 1])
    expect(workflow.sampler.inputs.model).toEqual(['lora-1', 0])
    expect(workflow['lora-0'].inputs.audit).toEqual(['checkpoint', 3])
    expect(workflow['lora-1'].inputs.audit).toEqual(['lora-0', 2])
    expect(workflow['save-image'].class_type).toBe('PixelVaultSaveImage')
    expect(workflow['save-image'].inputs.audit).toEqual(['lora-1', 2])
  })

  it('maps clipSkip 1 (no skip) to stop_at_clip_layer -1', () => {
    const workflow = buildComfyWorkflow(baseInput({ clipSkip: 1 }))
    expect(workflow['clip-skip'].inputs.stop_at_clip_layer).toBe(-1)
  })

  it('swaps EmptyLatentImage for a LoadImage→ImageScale→VAEEncode img2img chain when a reference image is given', () => {
    const workflow = buildComfyWorkflow(
      baseInput({ referenceImageName: 'reference.png', denoise: 0.3 }),
    )

    // txt2img EmptyLatentImage is gone; the sampler denoises from the encoded
    // reference latent instead of pure noise.
    expect(workflow.latent).toBeUndefined()
    expect(workflow['load-image']).toEqual({
      class_type: 'LoadImage',
      inputs: { image: 'reference.png', upload: 'image' },
    })
    expect(workflow['image-scale']).toEqual({
      class_type: 'ImageScale',
      inputs: {
        image: ['load-image', 0],
        upscale_method: 'lanczos',
        width: 1024,
        height: 1024,
        crop: 'center',
      },
    })
    expect(workflow['vae-encode']).toEqual({
      class_type: 'VAEEncode',
      inputs: { pixels: ['image-scale', 0], vae: ['checkpoint', 2] },
    })
    expect(workflow.sampler.inputs.latent_image).toEqual(['vae-encode', 0])
    expect(workflow.sampler.inputs.denoise).toBe(0.3)
  })

  it('keeps txt2img (EmptyLatentImage, denoise 1.0) and ignores denoise without a reference image', () => {
    const workflow = buildComfyWorkflow(baseInput({ denoise: 0.3 }))
    expect(workflow.latent.class_type).toBe('EmptyLatentImage')
    expect(workflow['load-image']).toBeUndefined()
    expect(workflow['vae-encode']).toBeUndefined()
    expect(workflow.sampler.inputs.denoise).toBe(1.0)
  })

  it('defaults img2img denoise to 1.0 when none is supplied', () => {
    const workflow = buildComfyWorkflow(
      baseInput({ referenceImageName: 'reference.png' }),
    )
    expect(workflow.sampler.inputs.denoise).toBe(1.0)
  })
})
