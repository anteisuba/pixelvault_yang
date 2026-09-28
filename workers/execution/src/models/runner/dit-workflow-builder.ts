/**
 * DiT recipe (Anima · Z-Image) → ComfyUI API-format workflow — pure mapping function.
 *
 * Both are UNET/diffusion-model-only weights (no baked CLIP/VAE), so they need a
 * different graph than `buildComfyWorkflow` (which uses CheckpointLoaderSimple):
 *
 *   PixelVaultUNETLoader(diffusion_models/<model>) ─MODEL─▶ PixelVaultLoraLoaderModelOnly chain
 *     ─▶ ModelSamplingAuraFlow(shift) ─MODEL─▶ KSampler
 *   (the PixelVault loaders also thread a load-evidence STRING into PixelVaultSaveImage —
 *    same contract as the SDXL graph; nodes live in the fork's model_evidence.py)
 *   CLIPLoader(text_encoders/<encoder>, type=<profile>) ─CLIP─▶ CLIPTextEncode
 *   VAELoader(vae/<vae>) ─VAE─▶ VAEDecode
 *   <empty latent> (or img2img LoadImage→ImageScale→VAEEncode) ─LATENT─▶ KSampler
 *
 * The per-family pieces live in `DIT_WORKFLOW_PROFILES`: Anima mirrors
 * circlestone-labs/Anima's `anima_comparison.json`; Z-Image mirrors Comfy-Org's
 * `image_z_image_turbo.json` template (lumina2 CLIP type, EmptySD3LatentImage, an
 * empty negative zeroed out instead of encoded). Runner infrastructure:
 * docs/references/domains/runner.md.
 */

import type { ComfyWorkflow } from './workflow-builder'

/** DiT LoRAs patch the diffusion model only (Anima README: don't train the LLM adapter). */
export interface DitWorkflowLora {
  /** Exact filename on the Volume (`models/loras/<filename>`). */
  filename: string
  strengthModel: number
}

export interface DitWorkflowProfile {
  /** ComfyUI CLIPLoader `type` for the family's text encoder. */
  clipType: string
  /** Shared companion in `models/text_encoders/`. */
  textEncoderFilename: string
  /** Shared companion in `models/vae/`. */
  vaeFilename: string
  /** txt2img latent node. */
  emptyLatentClass: 'EmptyLatentImage' | 'EmptySD3LatentImage'
  /** No negative text: encode an empty string, or zero out the positive conditioning. */
  emptyNegative: 'encode' | 'zero-out'
  /** ModelSamplingAuraFlow shift. */
  modelSamplingShift: number
}

export const DIT_WORKFLOW_PROFILES = {
  // ⚠ "stable_diffusion" for a Qwen encoder is counter-intuitive, but it is what the
  // authored Anima workflow uses — ComfyUI packages qwen_3_06b_base to load under it.
  anima: {
    clipType: 'stable_diffusion',
    textEncoderFilename: 'qwen_3_06b_base.safetensors',
    vaeFilename: 'qwen_image_vae.safetensors',
    emptyLatentClass: 'EmptyLatentImage',
    emptyNegative: 'encode',
    modelSamplingShift: 3.0,
  },
  zimage: {
    clipType: 'lumina2',
    textEncoderFilename: 'qwen_3_4b.safetensors',
    vaeFilename: 'ae.safetensors',
    emptyLatentClass: 'EmptySD3LatentImage',
    emptyNegative: 'zero-out',
    modelSamplingShift: 3.0,
  },
} as const satisfies Record<string, DitWorkflowProfile>

export type DitArchitecture = keyof typeof DIT_WORKFLOW_PROFILES

export interface DitWorkflowInput {
  profile: DitWorkflowProfile
  /** Exact filename on the Volume (`models/diffusion_models/<filename>`). */
  diffusionModelFilename: string
  positivePrompt: string
  negativePrompt?: string
  width: number
  height: number
  /** Decimal strings preserve full uint64 seeds across JavaScript JSON. */
  seed: number | string
  steps: number
  cfg: number
  samplerName: string
  scheduler: string
  loras: readonly DitWorkflowLora[]
  /** SaveImage filename_prefix — defaults to 'pixelvault'. */
  filenamePrefix?: string
  /** img2img: reference image filename (RunPod `input.images[].name`). */
  referenceImageName?: string
  /** KSampler denoise (0.01–1.0). 1.0 = full txt2img. */
  denoise?: number
  /** Optional post-decode super-resolution model in models/upscale_models/. */
  upscalerModelFilename?: string
}

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
  upscaleModel: 'upscale-model',
  upscaleImage: 'upscale-image',
  saveImage: 'save-image',
} as const

function loraNodeId(index: number): string {
  return `lora-${index}`
}

export function buildDitWorkflow(input: DitWorkflowInput): ComfyWorkflow {
  const { profile } = input
  const workflow: ComfyWorkflow = {
    [NODE_ID.unet]: {
      class_type: 'PixelVaultUNETLoader',
      inputs: {
        unet_name: input.diffusionModelFilename,
        weight_dtype: 'default',
      },
    },
    [NODE_ID.clip]: {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: profile.textEncoderFilename,
        type: profile.clipType,
        device: 'default',
      },
    },
    [NODE_ID.vae]: {
      class_type: 'VAELoader',
      inputs: { vae_name: profile.vaeFilename },
    },
  }

  // LoRA chain patches the diffusion model only (CLIP comes from the separate
  // CLIPLoader, so the model-only loader — not LoraLoader — is correct here).
  let modelSource: [string, number] = [NODE_ID.unet, 0]
  let auditSource: [string, number] = [NODE_ID.unet, 1]
  input.loras.forEach((lora, index) => {
    const nodeId = loraNodeId(index)
    workflow[nodeId] = {
      class_type: 'PixelVaultLoraLoaderModelOnly',
      inputs: {
        model: modelSource,
        audit: auditSource,
        lora_name: lora.filename,
        strength_model: lora.strengthModel,
      },
    }
    modelSource = [nodeId, 0]
    auditSource = [nodeId, 1]
  })

  // AuraFlow-style sampling shift wraps the (LoRA-patched) model.
  workflow[NODE_ID.modelSampling] = {
    class_type: 'ModelSamplingAuraFlow',
    inputs: { model: modelSource, shift: profile.modelSamplingShift },
  }

  workflow[NODE_ID.positivePrompt] = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: [NODE_ID.clip, 0], text: input.positivePrompt },
  }
  // Z-Image's template zeroes the positive conditioning when there is no negative
  // (it runs at CFG 1, where the negative branch is skipped anyway); a written
  // negative — only sent when CFG is above 1 — is encoded like everywhere else.
  const negativeText = input.negativePrompt?.trim() ?? ''
  workflow[NODE_ID.negativePrompt] =
    !negativeText && profile.emptyNegative === 'zero-out'
      ? {
          class_type: 'ConditioningZeroOut',
          inputs: { conditioning: [NODE_ID.positivePrompt, 0] },
        }
      : {
          class_type: 'CLIPTextEncode',
          inputs: { clip: [NODE_ID.clip, 0], text: input.negativePrompt ?? '' },
        }

  // Latent source: img2img (LoadImage → ImageScale → VAEEncode with the family's
  // VAE) when a reference is supplied, else txt2img (the profile's empty latent).
  // Mirrors the SDXL builder's reference handling.
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
      class_type: profile.emptyLatentClass,
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

  let outputImageSource: [string, number] = [NODE_ID.vaeDecode, 0]
  if (input.upscalerModelFilename) {
    workflow[NODE_ID.upscaleModel] = {
      class_type: 'UpscaleModelLoader',
      inputs: { model_name: input.upscalerModelFilename },
    }
    workflow[NODE_ID.upscaleImage] = {
      class_type: 'ImageUpscaleWithModel',
      inputs: {
        upscale_model: [NODE_ID.upscaleModel, 0],
        image: [NODE_ID.vaeDecode, 0],
      },
    }
    outputImageSource = [NODE_ID.upscaleImage, 0]
  }

  workflow[NODE_ID.saveImage] = {
    class_type: 'PixelVaultSaveImage',
    inputs: {
      images: outputImageSource,
      audit: auditSource,
      filename_prefix: input.filenamePrefix ?? 'pixelvault',
    },
  }

  return workflow
}
