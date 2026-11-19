/**
 * Map an SDXL recipe to a ComfyUI workflow. Loader audit outputs follow the
 * same model chain to the PNG; optional Latent hires runs before VAE decode.
 */

export interface ComfyNode {
  class_type: string
  inputs: Record<string, unknown>
}

export type ComfyWorkflow = Record<string, ComfyNode>

/**
 * 非 eps 训练的 SDXL 底模。ComfyUI 只在 state dict 带 `v_pred` 键时自动认 v-pred，
 * 社区合并版大多丢了这个键；Rectified-Flow 的 SDXL 则从来不会被自动认出（文件头还写着
 * epsilon），按 eps 采样出来是一团噪点。所以由 app 按名字判、这里显式声明。
 */
export type RunnerPredictionType = 'v_prediction' | 'flow'

// NoobAI-XL V-Pred 系按 zero-terminal-SNR 训练（官方权重带 `ztsnr` 键）。
const V_PREDICTION_ZSNR = true
// Rectified-Flow SDXL 作者给的 shift 区间 3–8（ChenkinNoob-XL RF / AstolfoRF 都推荐 3）。
const FLOW_SHIFT = 3

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
   * workflow (runner `input.images[].name`). When set, the graph swaps
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
  /** Optional Latent second sampling, before VAE decode. */
  hires?: {
    width: number
    height: number
    denoise: number
    steps?: number
    cfg?: number
  }
  /** Optional post-decode super-resolution model in models/upscale_models/. */
  upscalerModelFilename?: string
  /** 底模不是 eps 训练时，在 LoRA 链之后、采样器之前声明采样方式。缺省 = eps。 */
  predictionType?: RunnerPredictionType
}

const NODE_ID = {
  checkpoint: 'checkpoint',
  modelSampling: 'model-sampling',
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
      class_type: 'PixelVaultCheckpointLoader',
      inputs: { ckpt_name: input.checkpointFilename },
    },
  }

  // Chain zero or more LoraLoader nodes: each reads the previous node's
  // model/clip outputs. With zero LoRAs, modelSource/clipSource stay pointed
  // at the checkpoint's own outputs.
  let modelSource: [string, number] = [NODE_ID.checkpoint, 0]
  let clipSource: [string, number] = [NODE_ID.checkpoint, 1]
  let auditSource: [string, number] = [NODE_ID.checkpoint, 3]

  input.loras.forEach((lora, index) => {
    const nodeId = loraNodeId(index)
    workflow[nodeId] = {
      class_type: 'PixelVaultLoraLoader',
      inputs: {
        model: modelSource,
        clip: clipSource,
        audit: auditSource,
        lora_name: lora.filename,
        strength_model: lora.strengthModel,
        strength_clip: lora.strengthClip,
      },
    }
    modelSource = [nodeId, 0]
    clipSource = [nodeId, 1]
    auditSource = [nodeId, 2]
  })

  // 包在 LoRA 之后：LoRA 改的是权重，采样方式是包在模型外面的一层，两个 KSampler
  // （含来源精修第二遍）都从这里取模型。
  if (input.predictionType === 'v_prediction') {
    workflow[NODE_ID.modelSampling] = {
      class_type: 'ModelSamplingDiscrete',
      inputs: {
        model: modelSource,
        sampling: 'v_prediction',
        zsnr: V_PREDICTION_ZSNR,
      },
    }
    modelSource = [NODE_ID.modelSampling, 0]
  } else if (input.predictionType === 'flow') {
    workflow[NODE_ID.modelSampling] = {
      class_type: 'ModelSamplingSD3',
      inputs: { model: modelSource, shift: FLOW_SHIFT },
    }
    modelSource = [NODE_ID.modelSampling, 0]
  }

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

  let decodedLatent: [string, number] = [NODE_ID.sampler, 0]
  if (input.hires) {
    workflow['hires-latent'] = {
      class_type: 'LatentUpscale',
      inputs: {
        samples: decodedLatent,
        upscale_method: 'bilinear',
        width: input.hires.width,
        height: input.hires.height,
        crop: 'disabled',
      },
    }
    workflow['hires-sampler'] = {
      class_type: 'KSampler',
      inputs: {
        ...workflow[NODE_ID.sampler]!.inputs,
        latent_image: ['hires-latent', 0],
        steps: input.hires.steps ?? input.steps,
        cfg: input.hires.cfg ?? input.cfg,
        denoise: input.hires.denoise,
      },
    }
    decodedLatent = ['hires-sampler', 0]
  }

  workflow[NODE_ID.vaeDecode] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: decodedLatent,
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
    class_type: 'PixelVaultSaveImage',
    inputs: {
      images: outputImageSource,
      audit: auditSource,
      filename_prefix: input.filenamePrefix ?? 'pixelvault',
    },
  }

  return workflow
}
