import 'server-only'

import JSZip from 'jszip'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { decryptApiKey } from '@/lib/crypto'
import { fetchAsBuffer, uploadToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { LORA_TRAINING } from '@/constants/config'
import type { LoraTrainingRecord, SubmitLoraTrainingRequest } from '@/types'
import {
  submitReplicateLoraTraining,
  checkReplicateLoraTrainingStatus,
} from '@/services/providers/replicate.adapter'
import { withRetry } from '@/lib/with-retry'

// ─── Helpers ──────────────────────────────────────────────────────

function toRecord(job: {
  id: string
  name: string
  triggerWord: string
  loraType: string
  status: string
  progress: number
  loraUrl: string | null
  errorMessage: string | null
  characterCardId: string | null
  createdAt: Date
  completedAt: Date | null
}): LoraTrainingRecord {
  return {
    id: job.id,
    name: job.name,
    triggerWord: job.triggerWord,
    loraType: job.loraType,
    status: job.status,
    progress: job.progress,
    loraUrl: job.loraUrl,
    errorMessage: job.errorMessage,
    characterCardId: job.characterCardId,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  }
}

async function getDecryptedApiKey(
  userId: string,
  apiKeyId: string,
): Promise<string> {
  const record = await db.userApiKey.findUnique({ where: { id: apiKeyId } })
  if (!record || record.userId !== userId) {
    throw new Error('API key not found or access denied')
  }
  return decryptApiKey(record.encryptedKey)
}

// ─── Submit Training ──────────────────────────────────────────────

export async function submitLoraTraining(
  clerkId: string,
  data: SubmitLoraTrainingRequest,
): Promise<LoraTrainingRecord> {
  const dbUser = await ensureUser(clerkId)

  // Check per-user limit
  const existingCount = await db.loraTrainingJob.count({
    where: { userId: dbUser.id },
  })
  if (existingCount >= LORA_TRAINING.MAX_PER_USER) {
    throw new Error(
      `Maximum ${LORA_TRAINING.MAX_PER_USER} LoRA training jobs per user`,
    )
  }

  // Decrypt user's Replicate API key
  const apiKey = await getDecryptedApiKey(dbUser.id, data.apiKeyId)

  // Upload training images to R2 and package as ZIP
  const imageKeys: string[] = []
  const zip = new JSZip()

  for (let i = 0; i < data.trainingImages.length; i++) {
    const { buffer, mimeType } = await fetchAsBuffer(data.trainingImages[i])
    const key = `lora-training/${dbUser.id}/${Date.now()}-${i}.png`
    await uploadToR2({ data: buffer, key, mimeType })
    imageKeys.push(key)
    zip.file(`image_${i}.png`, buffer)
  }

  // Upload ZIP to R2
  const zipBuffer = Buffer.from(
    await zip.generateAsync({ type: 'arraybuffer' }),
  )
  const zipKey = `lora-training/${dbUser.id}/${Date.now()}-dataset.zip`
  const zipUrl = await uploadToR2({
    data: zipBuffer,
    key: zipKey,
    mimeType: 'application/zip',
  })

  // Submit to Replicate
  const { trainingId } = await withRetry(
    () =>
      submitReplicateLoraTraining({
        apiKey,
        inputImagesUrl: zipUrl,
        triggerWord: data.triggerWord,
        loraType: data.loraType,
      }),
    { maxAttempts: 3, label: 'submitReplicateLoraTraining' },
  )

  // Create DB record
  const job = await db.loraTrainingJob.create({
    data: {
      userId: dbUser.id,
      name: data.name,
      triggerWord: data.triggerWord,
      loraType: data.loraType,
      trainingImageKeys: imageKeys,
      externalTrainingId: trainingId,
      status: 'TRAINING',
      startedAt: new Date(),
      characterCardId: data.characterCardId ?? null,
    },
  })

  logger.info('LoRA training submitted', {
    jobId: job.id,
    userId: dbUser.id,
    trainingId,
    imageCount: data.trainingImages.length,
  })

  return toRecord(job)
}

// ─── Check Status ─────────────────────────────────────────────────

export async function checkLoraTrainingStatus(
  clerkId: string,
  jobId: string,
): Promise<LoraTrainingRecord> {
  const dbUser = await ensureUser(clerkId)

  const job = await db.loraTrainingJob.findUnique({ where: { id: jobId } })
  if (!job || job.userId !== dbUser.id) {
    throw new Error('Training job not found')
  }

  // If already terminal, return as-is
  if (
    job.status === 'COMPLETED' ||
    job.status === 'FAILED' ||
    job.status === 'CANCELED'
  ) {
    return toRecord(job)
  }

  if (!job.externalTrainingId) {
    throw new Error('Training job has no external ID')
  }

  // Decrypt API key to poll Replicate
  const apiKeyRecord = await db.userApiKey.findFirst({
    where: {
      userId: dbUser.id,
      adapterType: 'replicate',
      isActive: true,
    },
  })
  if (!apiKeyRecord) {
    throw new Error('No active Replicate API key found')
  }
  const apiKey = decryptApiKey(apiKeyRecord.encryptedKey)

  const result = await checkReplicateLoraTrainingStatus({
    apiKey,
    trainingId: job.externalTrainingId,
  })

  // Map Replicate status → DB status
  const statusMap: Record<string, string> = {
    starting: 'TRAINING',
    processing: 'TRAINING',
    succeeded: 'COMPLETED',
    failed: 'FAILED',
    canceled: 'CANCELED',
  }

  const newStatus = statusMap[result.status] ?? job.status

  const updateData: Record<string, unknown> = {
    status: newStatus,
  }

  if (result.status === 'succeeded' && result.loraUrl) {
    updateData.loraUrl = result.loraUrl
    updateData.completedAt = new Date()
    updateData.progress = 1
  }

  if (result.status === 'failed') {
    updateData.errorMessage = result.error
    updateData.completedAt = new Date()
  }

  if (result.status === 'processing') {
    updateData.progress = 0.5 // Approximate — Replicate doesn't report granular progress
  }

  const updated = await db.loraTrainingJob.update({
    where: { id: jobId },
    data: updateData,
  })

  // If completed and linked to a character card, auto-bind the LoRA
  if (newStatus === 'COMPLETED' && result.loraUrl && updated.characterCardId) {
    await db.characterCard.update({
      where: { id: updated.characterCardId },
      data: {
        loras: [{ url: result.loraUrl, scale: 1.0 }],
      },
    })
    logger.info('LoRA auto-bound to character card', {
      jobId,
      characterCardId: updated.characterCardId,
      loraUrl: result.loraUrl,
    })
  }

  return toRecord(updated)
}

// ─── List Jobs ────────────────────────────────────────────────────

export async function listLoraTrainingJobs(
  clerkId: string,
): Promise<LoraTrainingRecord[]> {
  const dbUser = await ensureUser(clerkId)

  const jobs = await db.loraTrainingJob.findMany({
    where: { userId: dbUser.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return jobs.map(toRecord)
}

// ─── Get Single Job ───────────────────────────────────────────────

export async function getLoraTrainingJob(
  clerkId: string,
  jobId: string,
): Promise<LoraTrainingRecord> {
  const dbUser = await ensureUser(clerkId)

  const job = await db.loraTrainingJob.findUnique({ where: { id: jobId } })
  if (!job || job.userId !== dbUser.id) {
    throw new Error('Training job not found')
  }

  return toRecord(job)
}
