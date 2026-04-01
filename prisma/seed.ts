import { PrismaClient } from '@/lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

// Ordered by quality ranking — sortOrder = array index
const MODEL_OPTIONS = [
  // ═══ Image Models (ranked by 2026 quality) ═══
  {
    id: 'gpt-image-1.5',
    externalModelId: 'gpt-image-1.5',
    adapterType: 'openai',
    outputType: 'IMAGE' as const,
    cost: 3,
    available: true,
    officialUrl: 'https://platform.openai.com/docs/models#gpt-image',
    providerConfig: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1/images',
    },
  },
  {
    id: 'gemini-3-pro-image-preview',
    externalModelId: 'gemini-3-pro-image-preview',
    adapterType: 'gemini',
    outputType: 'IMAGE' as const,
    cost: 3,
    available: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini-v3',
    providerConfig: {
      label: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
  },
  {
    id: 'flux-2-pro',
    externalModelId: 'fal-ai/flux-2-pro/v1.1',
    adapterType: 'fal',
    outputType: 'IMAGE' as const,
    cost: 2,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-pro',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'seedream-4.5',
    externalModelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    adapterType: 'fal',
    outputType: 'IMAGE' as const,
    cost: 2,
    available: true,
    officialUrl: 'https://seed.bytedance.com/en/seedream4_5',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'ideogram-3',
    externalModelId: 'fal-ai/ideogram/v3',
    adapterType: 'fal',
    outputType: 'IMAGE' as const,
    cost: 2,
    available: true,
    officialUrl: 'https://developer.ideogram.ai/ideogram-api/api-overview',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'recraft-v3',
    externalModelId: 'fal-ai/recraft/v3/text-to-image',
    adapterType: 'fal',
    outputType: 'IMAGE' as const,
    cost: 2,
    available: true,
    officialUrl: 'https://www.recraft.ai/docs/api-reference/getting-started',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    externalModelId: 'gemini-3.1-flash-image-preview',
    adapterType: 'gemini',
    outputType: 'IMAGE' as const,
    cost: 2,
    available: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    providerConfig: {
      label: 'Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
  },
  {
    id: 'flux-2-dev',
    externalModelId: 'fal-ai/flux-2-dev',
    adapterType: 'fal',
    outputType: 'IMAGE' as const,
    cost: 1,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-dev',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'flux-2-schnell',
    externalModelId: 'fal-ai/flux/schnell',
    adapterType: 'fal',
    outputType: 'IMAGE' as const,
    cost: 1,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux/schnell',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'animagine-xl-4.0',
    externalModelId: 'cagliostrolab/animagine-xl-4.0',
    adapterType: 'huggingface',
    outputType: 'IMAGE' as const,
    cost: 1,
    available: true,
    officialUrl: 'https://huggingface.co/cagliostrolab/animagine-xl-4.0',
    providerConfig: {
      label: 'HuggingFace',
      baseUrl: 'https://router.huggingface.co/hf-inference/models',
    },
  },
  {
    id: 'sdxl',
    externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
    adapterType: 'huggingface',
    outputType: 'IMAGE' as const,
    cost: 1,
    available: true,
    officialUrl:
      'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
    providerConfig: {
      label: 'HuggingFace',
      baseUrl: 'https://router.huggingface.co/hf-inference/models',
    },
  },
  // ═══ Video Models — Premium ═══
  {
    id: 'kling-v3-pro',
    externalModelId: 'fal-ai/kling-video/v3/pro/text-to-video',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 6,
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video',
    timeoutMs: 300000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/kling-video/v3/pro/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
      generateAudio: true,
    },
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'veo-3',
    externalModelId: 'fal-ai/veo3',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 8,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/veo3',
    timeoutMs: 300000,
    qualityTier: 'premium',
    i2vModelId: 'fal-ai/veo3/image-to-video',
    videoDefaults: { resolution: '1080p', generateAudio: true },
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'sora-2',
    externalModelId: 'sora-2',
    adapterType: 'openai',
    outputType: 'VIDEO' as const,
    cost: 6,
    available: true,
    officialUrl: 'https://platform.openai.com/docs/models/sora-2',
    timeoutMs: 300000,
    qualityTier: 'premium',
    videoDefaults: { resolution: '720p' },
    providerConfig: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1/images',
    },
  },
  // ═══ Video Models — Standard ═══
  {
    id: 'seedance-pro',
    externalModelId: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 4,
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/bytedance/seedance/v1/pro/text-to-video',
    timeoutMs: 300000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'minimax-video',
    externalModelId: 'fal-ai/minimax/hailuo-02',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 3,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/minimax/hailuo-02',
    timeoutMs: 180000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/minimax/hailuo-02/image-to-video',
    videoDefaults: { enablePromptOptimizer: true },
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'luma-ray-2',
    externalModelId: 'fal-ai/luma-dream-machine/ray-2',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 4,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/luma-dream-machine/ray-2',
    timeoutMs: 120000,
    qualityTier: 'standard',
    videoDefaults: { resolution: '720p' },
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'pika-v2.2',
    externalModelId: 'fal-ai/pika/v2.2/text-to-video',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 3,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/pika/v2.2/text-to-video',
    timeoutMs: 180000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/pika/v2.2/image-to-video',
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'kling-video',
    externalModelId: 'fal-ai/kling-video/v2/master',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 5,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/kling-video/v2/master',
    timeoutMs: 300000,
    qualityTier: 'standard',
    i2vModelId: 'fal-ai/kling-video/v2/master/image-to-video',
    videoDefaults: {
      negativePrompt: 'blur, distort, and low quality',
      cfgScale: 0.5,
    },
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  // ═══ Video Models — Budget ═══
  {
    id: 'wan-video',
    externalModelId: 'fal-ai/wan/v2.2-a14b/text-to-video',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 2,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-video',
    timeoutMs: 180000,
    qualityTier: 'budget',
    videoDefaults: {
      negativePrompt:
        'bright colors, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy background, three legs, many people in the background, walking backwards',
      resolution: '720p',
    },
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
  {
    id: 'hunyuan-video',
    externalModelId: 'fal-ai/hunyuan-video',
    adapterType: 'fal',
    outputType: 'VIDEO' as const,
    cost: 3,
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/hunyuan-video',
    timeoutMs: 300000,
    qualityTier: 'budget',
    i2vModelId: 'fal-ai/hunyuan-video-image-to-video',
    videoDefaults: { resolution: '720p' },
    providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  },
]

async function main() {
  console.log('Seeding ModelConfig table...')

  for (let i = 0; i < MODEL_OPTIONS.length; i++) {
    const model = MODEL_OPTIONS[i]

    await db.modelConfig.upsert({
      where: { modelId: model.id },
      update: {
        externalModelId: model.externalModelId,
        adapterType: model.adapterType,
        outputType: model.outputType,
        cost: model.cost,
        available: model.available,
        officialUrl: model.officialUrl ?? null,
        timeoutMs: model.timeoutMs ?? null,
        qualityTier: model.qualityTier ?? null,
        i2vModelId: model.i2vModelId ?? null,
        videoDefaults: model.videoDefaults ?? undefined,
        providerConfig: model.providerConfig,
        sortOrder: i,
      },
      create: {
        modelId: model.id,
        externalModelId: model.externalModelId,
        adapterType: model.adapterType,
        outputType: model.outputType,
        cost: model.cost,
        available: model.available,
        officialUrl: model.officialUrl ?? null,
        timeoutMs: model.timeoutMs ?? null,
        qualityTier: model.qualityTier ?? null,
        i2vModelId: model.i2vModelId ?? null,
        videoDefaults: model.videoDefaults ?? undefined,
        providerConfig: model.providerConfig,
        sortOrder: i,
      },
    })

    console.log(`  ✓ ${model.id}`)
  }

  console.log(`\nSeeded ${MODEL_OPTIONS.length} model configs.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
