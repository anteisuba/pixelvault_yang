/**
 * Anima (DiT) recipe → ComfyUI API-format workflow — pure mapping function.
 *
 * Anima (circlestone-labs/Anima) is a Cosmos-Predict2-2B DiT, NOT SDXL: the
 * weights are UNET/diffusion-model-only (no baked CLIP/VAE), so it needs a
 * different graph than `buildComfyWorkflow` (which uses CheckpointLoaderSimple):
 *
 *   UNETLoader(diffusion_models/<anima>) ─MODEL─▶ LoraLoaderModelOnly chain
 *     ─▶ ModelSamplingAuraFlow(shift) ─MODEL─▶ KSampler
 *   CLIPLoader(text_encoders/qwen_3_06b, type="stable_diffusion") ─CLIP─▶ CLIPTextEncode ×2
 *   VAELoader(vae/qwen_image_vae) ─VAE─▶ VAEDecode
 *   EmptyLatentImage (or img2img LoadImage→ImageScale→VAEEncode) ─LATENT─▶ KSampler
 *
 * Node graph + exact params mirror circlestone-labs/Anima's `anima_comparison.json`
 * ComfyUI workflow. Design: docs/plans/comfy-runner-v4-anima-dit.md §4.
 */

import type { ComfyWorkflow } from './workflow-builder'

/** Anima LoRAs patch the diffusion model only (README: don't train the LLM adapter). */
export interface AnimaWorkflowLora {
  /** Exact filename on the Volume (`models/loras/<filename>`). */
  filename: string
  strengthModel: number
}

export interface AnimaWorkflowInput {
  /** Exact filename on the Volume (`models/diffusion_models/<filename>`). */
  diffusionModelFilename: string
  /** Shared companion in `models/text_encoders/` (Qwen3 0.6B). */
  textEncoderFilename: string
  /** Shared companion in `models/vae/` (Qwen-Image VAE). */
  vaeFilename: string
  positivePrompt: string
  negativePrompt?: string
  width: number
  height: number
  seed: number
  steps: number
  cfg: number
  samplerName: string
  scheduler: string
  /** ModelSamplingAuraFlow shift — Anima default 3.0. */
  modelSamplingShift: number
  loras: readonly AnimaWorkflowLora[]
  /** SaveImage filename_prefix — defaults to 'pixelvault'. */
  filenamePrefix?: string
  /** img2img: reference image filename (RunPod `input.images[].name`). */
  referenceImageName?: string
  /** KSampler denoise (0.01–1.0). 1.0 = full txt2img. */
  denoise?: number
}

/**
 * ComfyUI CLIPLoader `type` for Anima's Qwen text encoder. Counter-intuitive
 * ("stable_diffusion" for a Qwen encoder) but this is what the authored Anima
 * workflow uses — ComfyUI packages qwen_3_06b_base to load under this type.
 */
export const ANIMA_CLIP_TYPE = 'stable_diffusion'
export const ANIMA_MODEL_SAMPLING_SHIFT = 3.0
/** Shared companion filenames on the Volume (seeded once, reused by every Anima gen). */
export const ANIMA_TEXT_ENCODER_FILENAME = 'qwen_3_06b_base.safetensors'
export const ANIMA_VAE_FILENAME = 'qwen_image_vae.safetensors'

const NODE_ID = {
  unet: 'unet',
  modelSampling: 'model-sampling',
  clip: 'clip-loader',
  vae: 'vae-loader',
  positivePrompt: 'positive-prompt',
  negativePrompt: 'negative-prompt',
  latent: 'latent',
  loadImage: 'load-image',
  imageScale: 'image-scale',
  vaeEncode: 'vae-encode',
  sampler: 'sampler',
  vaeDecode: 'vae-decode',
  saveImage: 'save-image',
} as const

function loraNodeId(index: number): string {
  return `lora-${index}`
}

export function buildAnimaWorkflow(input: AnimaWorkflowInput): ComfyWorkflow {
  const workflow: ComfyWorkflow = {
    [NODE_ID.unet]: {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: input.diffusionModelFilename,
        weight_dtype: 'default',
      },
    },
    [NODE_ID.clip]: {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: input.textEncoderFilename,
        type: ANIMA_CLIP_TYPE,
        device: 'default',
      },
    },
    [NODE_ID.vae]: {
      class_type: 'VAELoader',
      inputs: { vae_name: input.vaeFilename },
    },
  }

  // LoRA chain patches the diffusion model only (CLIP comes from the separate
  // CLIPLoader, so LoraLoaderModelOnly — not LoraLoader — is correct here).
  let modelSource: [string, number] = [NODE_ID.unet, 0]
  input.loras.forEach((lora, index) => {
    const nodeId = loraNodeId(index)
    workflow[nodeId] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: modelSource,
        lora_name: lora.filename,
        strength_model: lora.strengthModel,
      },
    }
    modelSource = [nodeId, 0]
  })

  // Anima's AuraFlow-style sampling shift wraps the (LoRA-patched) model.
  workflow[NODE_ID.modelSampling] = {
    class_type: 'ModelSamplingAuraFlow',
    inputs: { model: modelSource, shift: input.modelSamplingShift },
  }

  workflow[NODE_ID.positivePrompt] = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: [NODE_ID.clip, 0], text: input.positivePrompt },
  }
  workflow[NODE_ID.negativePrompt] = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: [NODE_ID.clip, 0], text: input.negativePrompt ?? '' },
  }

  // Latent source: img2img (LoadImage → ImageScale → VAEEncode with the Qwen
  // VAE) when a reference is supplied, else txt2img (EmptyLatentImage). Mirrors
  // the SDXL builder's reference handling.
  let latentSource: [string, number]
  let denoise: number
  if (input.referenceImageName) {
    workflow[NODE_ID.loadImage] = {
      class_type: 'LoadImage',
      inputs: { image: input.referenceImageName, upload: 'image' },
    }
    workflow[NODE_ID.imageScale] = {
      class_type: 'ImageScale',
      inputs: {
        image: [NODE_ID.loadImage, 0],
        upscale_method: 'lanczos',
        width: input.width,
        height: input.height,
        crop: 'center',
      },
    }
    workflow[NODE_ID.vaeEncode] = {
      class_type: 'VAEEncode',
      inputs: {
        pixels: [NODE_ID.imageScale, 0],
        vae: [NODE_ID.vae, 0],
      },
    }
    latentSource = [NODE_ID.vaeEncode, 0]
    denoise = input.denoise ?? 1.0
  } else {
    workflow[NODE_ID.latent] = {
      class_type: 'EmptyLatentImage',
      inputs: { width: input.width, height: input.height, batch_size: 1 },
    }
    latentSource = [NODE_ID.latent, 0]
    denoise = 1.0
  }

  workflow[NODE_ID.sampler] = {
    class_type: 'KSampler',
    inputs: {
      seed: input.seed,
      steps: input.steps,
      cfg: input.cfg,
      sampler_name: input.samplerName,
      scheduler: input.scheduler,
      denoise,
      model: [NODE_ID.modelSampling, 0],
      positive: [NODE_ID.positivePrompt, 0],
      negative: [NODE_ID.negativePrompt, 0],
      latent_image: latentSource,
    },
  }

  workflow[NODE_ID.vaeDecode] = {
    class_type: 'VAEDecode',
    inputs: { samples: [NODE_ID.sampler, 0], vae: [NODE_ID.vae, 0] },
  }

  workflow[NODE_ID.saveImage] = {
    class_type: 'SaveImage',
    inputs: {
      images: [NODE_ID.vaeDecode, 0],
      filename_prefix: input.filenamePrefix ?? 'pixelvault',
    },
  }

  return workflow
}
