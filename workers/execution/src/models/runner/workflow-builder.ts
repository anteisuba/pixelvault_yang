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
  seed: number
  steps: number
  cfg: number
  samplerName: string
  scheduler: string
  /** ComfyUI CLIPSetLastLayer convention: 1 = no skip, 2 = stop at -2. */
  clipSkip: number
  loras: readonly RunnerWorkflowLora[]
  /** SaveImage filename_prefix — defaults to 'pixelvault'. */
  filenamePrefix?: string
}

const NODE_ID = {
  checkpoint: 'checkpoint',
  clipSkip: 'clip-skip',
  positivePrompt: 'positive-prompt',
  negativePrompt: 'negative-prompt',
  latent: 'latent',
  sampler: 'sampler',
  vaeDecode: 'vae-decode',
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

  workflow[NODE_ID.latent] = {
    class_type: 'EmptyLatentImage',
    inputs: {
      width: input.width,
      height: input.height,
      batch_size: 1,
    },
  }

  workflow[NODE_ID.sampler] = {
    class_type: 'KSampler',
    inputs: {
      seed: input.seed,
      steps: input.steps,
      cfg: input.cfg,
      sampler_name: input.samplerName,
      scheduler: input.scheduler,
      denoise: 1.0,
      model: modelSource,
      positive: [NODE_ID.positivePrompt, 0],
      negative: [NODE_ID.negativePrompt, 0],
      latent_image: [NODE_ID.latent, 0],
    },
  }

  workflow[NODE_ID.vaeDecode] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: [NODE_ID.sampler, 0],
      vae: [NODE_ID.checkpoint, 2],
    },
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
