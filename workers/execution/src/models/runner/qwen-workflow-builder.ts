import type { ComfyWorkflow } from './workflow-builder'

export const QWEN_IMAGE_21_MODEL = 'qwen-image-2.1'

export function readQwenPngDimensions(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (
    bytes.length < 24 ||
    signature.some((value, index) => bytes[index] !== value)
  )
    throw new Error('Qwen output is not a PNG image.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (!width || !height) throw new Error('Qwen output dimensions are invalid.')
  return { width, height }
}

export function buildQwenImage21Workflow(input: {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  seed: number | string
  steps?: number
  cfg?: number
  referenceImageNames: readonly string[]
}): ComfyWorkflow {
  const steps = input.steps ?? 25
  const cfg = input.cfg ?? 1
  if (!Number.isInteger(steps) || steps < 1 || steps > 100)
    throw new Error('Qwen steps must be between 1 and 100.')
  if (!Number.isFinite(cfg) || cfg < 1 || cfg > 10)
    throw new Error('Qwen CFG must be between 1 and 10.')
  if (input.referenceImageNames.length > 10)
    throw new Error('Qwen supports at most 10 reference images.')
  const workflow: ComfyWorkflow = {
    model: {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: 'qwen_image_2.1_int8_convrot.safetensors',
        weight_dtype: 'default',
      },
    },
    clip: {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen3vl_8b_int8_convrot.safetensors',
        type: 'qwen_image',
        device: 'default',
      },
    },
    vae: {
      class_type: 'VAELoader',
      inputs: { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' },
    },
    encode: {
      class_type: 'TextEncodeQwenImage21',
      inputs: {
        clip: ['clip', 0],
        prompt: input.prompt,
        negative_prompt: input.negativePrompt ?? '',
        resolution: 1024,
      },
    },
    sampler: {
      class_type: 'KSampler',
      inputs: {
        model: ['model', 0],
        positive: ['encode', 0],
        negative: ['encode', 1],
        latent_image: ['latent', 0],
        seed: input.seed,
        steps,
        cfg,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    decode: {
      class_type: 'VAEDecode',
      inputs: { samples: ['sampler', 0], vae: ['vae', 0] },
    },
    save: {
      class_type: 'SaveImage',
      inputs: { images: ['decode', 0], filename_prefix: 'qwen21-evaluation' },
    },
  }
  if (input.referenceImageNames.length) {
    workflow.encode.inputs.vae = ['vae', 0]
    input.referenceImageNames.forEach((name, index) => {
      const id = `reference-${index + 1}`
      workflow[id] = { class_type: 'LoadImage', inputs: { image: name } }
      workflow.encode.inputs[`images.image_${index + 1}`] = [id, 0]
    })
    workflow.cache = {
      class_type: 'QwenImage21Cache',
      inputs: {
        model: ['model', 0],
        device: 'auto',
        dtype: 'default',
      },
    }
    workflow.sampler.inputs.model = ['cache', 0]
    workflow.sampler.inputs.latent_image = ['encode', 2]
  } else {
    workflow.latent = {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: input.width,
        height: input.height,
        batch_size: 1,
      },
    }
  }
  return workflow
}
