/**
 * Comfy Runner recipe → ComfyUI API-format workflow JSON — pure mapping
 * function (no fetch, no env access). Parameterizes the workflow template
 * validated end-to-end against the real RunPod endpoint (HANDOFF §7.1):
 * CheckpointLoaderSimple → 0+ chained LoraLoader → CLIPSetLastLayer →
 * CLIPTextEncode (positive/negative) + EmptyLatentImage → KSampler →
 * VAEDecode → SaveImage.
 */

export interface ComfyNode {
  class_type: string
  inputs: Record<string, unknown>
}

export type ComfyWorkflow = Record<string, ComfyNode>

export interface RunnerWorkflowLora {
  /** Exact filename on the Volume (`models/loras/<filename>`). */
  filename: string
  strengthModel: number
  strengthClip: number
}

export interface RunnerWorkflowInput {
  /** Exact filename on the Volume (`models/checkpoints/<filename>`). */
  checkpointFilename: string
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
  /** ComfyUI CLIPSetLastLayer convention: 1 = no skip, 2 = stop at -2. */
  clipSkip: number
  loras: readonly RunnerWorkflowLora[]
  /** SaveImage filename_prefix — defaults to 'pixelvault'. */
  filenamePrefix?: string
  /**
   * img2img: exact filename of a reference image uploaded alongside the
   * workflow (RunPod `input.images[].name`). When set, the graph swaps
   * EmptyLatentImage for LoadImage → ImageScale → VAEEncode, and the sampler
   * denoises from that latent instead of pure noise.
   */
  referenceImageName?: string
  /**
   * KSampler denoise (0.01–1.0). 1.0 = full txt2img (the default and the only
   * value used without a reference image). For img2img pass the
   * reference-strength-mapped value (lower = keep more of the reference).
   */
  denoise?: number
  /** Optional post-decode super-resolution model in models/upscale_models/. */
  upscalerModelFilename?: string
}

const NODE_ID = {
  checkpoint: 'checkpoint',
  clipSkip: 'clip-skip',
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

export function buildComfyWorkflow(input: RunnerWorkflowInput): ComfyWorkflow {
  const workflow: ComfyWorkflow = {
    [NODE_ID.checkpoint]: {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: input.checkpointFilename },
    },
  }

  // Chain zero or more LoraLoader nodes: each reads the previous node's
  // model/clip outputs. With zero LoRAs, modelSource/clipSource stay pointed
  // at the checkpoint's own outputs.
  let modelSource: [string, number] = [NODE_ID.checkpoint, 0]
  let clipSource: [string, number] = [NODE_ID.checkpoint, 1]

  input.loras.forEach((lora, index) => {
    const nodeId = loraNodeId(index)
    workflow[nodeId] = {
      class_type: 'LoraLoader',
      inputs: {
        model: modelSource,
        clip: clipSource,
        lora_name: lora.filename,
        strength_model: lora.strengthModel,
        strength_clip: lora.strengthClip,
      },
    }
    modelSource = [nodeId, 0]
    clipSource = [nodeId, 1]
  })

  workflow[NODE_ID.clipSkip] = {
    class_type: 'CLIPSetLastLayer',
    inputs: {
      clip: clipSource,
      stop_at_clip_layer: -Math.abs(input.clipSkip),
    },
  }

  workflow[NODE_ID.positivePrompt] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      clip: [NODE_ID.clipSkip, 0],
      text: input.positivePrompt,
    },
  }

  workflow[NODE_ID.negativePrompt] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      clip: [NODE_ID.clipSkip, 0],
      text: input.negativePrompt ?? '',
    },
  }

  // Latent source: img2img (LoadImage → ImageScale → VAEEncode) when a
  // reference image is supplied, else txt2img (EmptyLatentImage). The
  // reference is scaled to the requested dimensions so the output aspect
  // ratio matches the txt2img path regardless of the input's native size.
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
        vae: [NODE_ID.checkpoint, 2],
      },
    }
    latentSource = [NODE_ID.vaeEncode, 0]
    denoise = input.denoise ?? 1.0
  } else {
    workflow[NODE_ID.latent] = {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: input.width,
        height: input.height,
        batch_size: 1,
      },
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
      model: modelSource,
      positive: [NODE_ID.positivePrompt, 0],
      negative: [NODE_ID.negativePrompt, 0],
      latent_image: latentSource,
    },
  }

  workflow[NODE_ID.vaeDecode] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: [NODE_ID.sampler, 0],
      vae: [NODE_ID.checkpoint, 2],
    },
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
    class_type: 'SaveImage',
    inputs: {
      images: outputImageSource,
      filename_prefix: input.filenamePrefix ?? 'pixelvault',
    },
  }

  return workflow
}
