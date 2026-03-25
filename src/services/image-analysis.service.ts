import 'server-only'

import { db } from '@/lib/db'
import type { AspectRatio } from '@/constants/config'
import type { GenerationRecord, GenerateVariationsModel } from '@/types'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { generateImageForUser } from '@/services/generate-image.service'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { getUserByClerkId } from '@/services/user.service'

const REVERSE_ENGINEER_SYSTEM_PROMPT = `You are an expert at describing images for AI image generation. Analyze the provided image and generate a detailed prompt that could recreate it. Include: subject matter, composition, style, lighting, color palette, mood, textures, and any notable artistic qualities. Return ONLY the prompt text, no explanation or preamble.`

export async function analyzeImage(
  clerkId: string,
  imageData: string,
): Promise<{ id: string; generatedPrompt: string; sourceImageUrl: string }> {
  const dbUser = await getUserByClerkId(clerkId)
  if (!dbUser) throw new Error('User not found')

  // Upload source image to R2
  const dataUrlMatch = imageData.match(/^data:([^;]+);base64,(.+)$/)
  if (!dataUrlMatch) throw new Error('Invalid image data format')

  const mimeType = dataUrlMatch[1]
  const buffer = Buffer.from(dataUrlMatch[2], 'base64')
  const storageKey = generateStorageKey('IMAGE')
  const sourceImageUrl = await uploadToR2({
    data: buffer,
    key: storageKey,
    mimeType,
  })

  // Analyze with LLM
  const route = await resolveLlmTextRoute(dbUser.id)
  const generatedPrompt = await llmTextCompletion({
    systemPrompt: REVERSE_ENGINEER_SYSTEM_PROMPT,
    userPrompt: 'Describe this image as a detailed AI image generation prompt.',
    imageData,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Save to DB
  const analysis = await db.imageAnalysis.create({
    data: {
      userId: dbUser.id,
      sourceImageUrl,
      sourceStorageKey: storageKey,
      generatedPrompt,
      modelUsed: route.adapterType,
    },
  })

  return {
    id: analysis.id,
    generatedPrompt: analysis.generatedPrompt,
    sourceImageUrl: analysis.sourceImageUrl,
  }
}

export async function getAnalysisById(
  analysisId: string,
  clerkId: string,
): Promise<{
  id: string
  generatedPrompt: string
  sourceImageUrl: string
} | null> {
  const dbUser = await getUserByClerkId(clerkId)
  if (!dbUser) return null

  const analysis = await db.imageAnalysis.findUnique({
    where: { id: analysisId },
  })

  if (!analysis || analysis.userId !== dbUser.id) return null

  return {
    id: analysis.id,
    generatedPrompt: analysis.generatedPrompt,
    sourceImageUrl: analysis.sourceImageUrl,
  }
}

export async function generateVariations(
  clerkId: string,
  analysisId: string,
  models: GenerateVariationsModel[],
  aspectRatio: AspectRatio,
): Promise<{ variations: GenerationRecord[]; failed: string[] }> {
  const dbUser = await getUserByClerkId(clerkId)
  if (!dbUser) throw new Error('User not found')

  const analysis = await db.imageAnalysis.findUnique({
    where: { id: analysisId },
  })

  if (!analysis || analysis.userId !== dbUser.id) {
    throw new Error('Analysis not found')
  }

  const results = await Promise.allSettled(
    models.map((model) =>
      generateImageForUser(clerkId, {
        prompt: analysis.generatedPrompt,
        modelId: model.modelId,
        aspectRatio,
        apiKeyId: model.apiKeyId,
      }),
    ),
  )

  const variations: GenerationRecord[] = []
  const failed: string[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      variations.push(result.value)
    } else {
      failed.push(models[index].modelId)
    }
  })

  return { variations, failed }
}
