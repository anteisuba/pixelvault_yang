import 'server-only'

import JSZip from 'jszip'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { decryptApiKey } from '@/lib/crypto'
import {
  fetchAsBuffer,
  uploadToR2,
  streamUploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { LORA_TRAINING } from '@/constants/config'
import type { LoraTrainingRecord, SubmitLoraTrainingRequest } from '@/types'
import {
  submitReplicateLoraTraining,
  checkReplicateLoraTrainingStatus,
} from '@/services/providers/replicate.adapter'
import {
  submitFalLoraTraining,
  checkFalLoraTrainingStatus,
} from '@/services/providers/fal.adapter'
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

  // Submit to provider
  let externalId: string
  let statusUrl: string | undefined
  let responseUrl: string | undefined

  if (data.provider === 'fal') {
    const result = await withRetry(
      () =>
        submitFalLoraTraining({
          apiKey,
          inputImagesUrl: zipUrl,
          triggerWord: data.triggerWord,
          isStyle: data.loraType === 'style',
        }),
      { maxAttempts: 3, label: 'submitFalLoraTraining' },
    )
    externalId = result.requestId
    statusUrl = result.statusUrl
    // fal returns response_url via the submit schema; store in externalTrainingId as JSON
  } else {
    const result = await withRetry(
      () =>
        submitReplicateLoraTraining({
          apiKey,
          inputImagesUrl: zipUrl,
          triggerWord: data.triggerWord,
          loraType: data.loraType,
        }),
      { maxAttempts: 3, label: 'submitReplicateLoraTraining' },
    )
    externalId = result.trainingId
  }

  // Create DB record
  const job = await db.loraTrainingJob.create({
    data: {
      userId: dbUser.id,
      name: data.name,
      triggerWord: data.triggerWord,
      loraType: data.loraType,
      baseModel: data.provider === 'fal' ? 'flux-dev-fal' : 'flux-dev',
      trainingImageKeys: imageKeys,
      externalTrainingId: statusUrl
        ? JSON.stringify({ id: externalId, statusUrl, provider: 'fal' })
        : externalId,
      status: 'TRAINING',
      startedAt: new Date(),
      characterCardId: data.characterCardId ?? null,
    },
  })

  logger.info('LoRA training submitted', {
    jobId: job.id,
    userId: dbUser.id,
    externalId,
    provider: data.provider,
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

  // If already terminal
  if (
    job.status === 'COMPLETED' ||
    job.status === 'FAILED' ||
    job.status === 'CANCELED'
  ) {
    // If completed but not yet transferred to R2, do it now
    if (job.status === 'COMPLETED' && job.loraUrl && !job.loraStorageKey) {
      try {
        const ext = job.loraUrl.includes('.safetensors') ? 'safetensors' : 'tar'
        const loraKey = `lora-weights/${dbUser.id}/${jobId}.${ext}`
        const { publicUrl } = await streamUploadToR2({
          sourceUrl: job.loraUrl,
          key: loraKey,
          mimeType: 'application/octet-stream',
        })
        const updated = await db.loraTrainingJob.update({
          where: { id: jobId },
          data: { loraUrl: publicUrl, loraStorageKey: loraKey },
        })
        logger.info('LoRA weights retroactively transferred to R2', {
          jobId,
          loraKey,
        })
        return toRecord(updated)
      } catch (err) {
        logger.warn('Failed to retroactively transfer LoRA to R2', {
          jobId,
          error: err instanceof Error ? err.message : 'Unknown',
        })
      }
    }
    return toRecord(job)
  }

  if (!job.externalTrainingId) {
    throw new Error('Training job has no external ID')
  }

  // Detect provider from externalTrainingId format
  let isFalProvider = false
  let falMeta: { id: string; statusUrl: string } | null = null
  try {
    const parsed = JSON.parse(job.externalTrainingId) as {
      provider?: string
      id?: string
      statusUrl?: string
    }
    if (parsed.provider === 'fal' && parsed.statusUrl) {
      isFalProvider = true
      falMeta = { id: parsed.id!, statusUrl: parsed.statusUrl }
    }
  } catch {
    // Not JSON → Replicate training ID
  }

  // Find the right API key
  const adapterType = isFalProvider ? 'fal' : 'replicate'
  const apiKeyRecord = await db.userApiKey.findFirst({
    where: {
      userId: dbUser.id,
      adapterType,
      isActive: true,
    },
  })
  if (!apiKeyRecord) {
    throw new Error(`No active ${adapterType} API key found`)
  }
  const apiKey = decryptApiKey(apiKeyRecord.encryptedKey)

  // Poll the right provider
  let newStatus: string = job.status
  let loraUrl: string | null = null
  let errorMsg: string | null = null

  if (isFalProvider && falMeta) {
    const result = await checkFalLoraTrainingStatus({
      apiKey,
      statusUrl: falMeta.statusUrl,
      responseUrl: falMeta.statusUrl.replace('/status', ''),
    })
    const falStatusMap: Record<string, string> = {
      IN_QUEUE: 'TRAINING',
      IN_PROGRESS: 'TRAINING',
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
    }
    newStatus = falStatusMap[result.status] ?? job.status
    loraUrl = result.loraUrl
  } else {
    const result = await checkReplicateLoraTrainingStatus({
      apiKey,
      trainingId: job.externalTrainingId,
    })
    const repStatusMap: Record<string, string> = {
      starting: 'TRAINING',
      processing: 'TRAINING',
      succeeded: 'COMPLETED',
      failed: 'FAILED',
      canceled: 'CANCELED',
    }
    newStatus = repStatusMap[result.status] ?? job.status
    loraUrl = result.loraUrl
    errorMsg = result.error
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
  }

  if (newStatus === 'COMPLETED' && loraUrl) {
    // Transfer LoRA weights from provider CDN to R2 (provider URLs are temporary)
    let persistedLoraUrl = loraUrl
    try {
      const ext = loraUrl.includes('.safetensors') ? 'safetensors' : 'tar'
      const loraKey = `lora-weights/${dbUser.id}/${jobId}.${ext}`
      const { publicUrl } = await streamUploadToR2({
        sourceUrl: loraUrl,
        key: loraKey,
        mimeType: 'application/octet-stream',
      })
      persistedLoraUrl = publicUrl
      updateData.loraStorageKey = loraKey
      logger.info('LoRA weights transferred to R2', { jobId, loraKey })
    } catch (transferErr) {
      logger.warn('Failed to transfer LoRA to R2, using provider URL', {
        jobId,
        error: transferErr instanceof Error ? transferErr.message : 'Unknown',
      })
    }
    updateData.loraUrl = persistedLoraUrl
    updateData.completedAt = new Date()
    updateData.progress = 1
    loraUrl = persistedLoraUrl
  }

  if (newStatus === 'FAILED') {
    updateData.errorMessage = errorMsg
    updateData.completedAt = new Date()
  }

  if (newStatus === 'TRAINING') {
    updateData.progress = 0.5
  }

  const updated = await db.loraTrainingJob.update({
    where: { id: jobId },
    data: updateData,
  })

  // If completed and linked to a character card, auto-bind the LoRA
  if (newStatus === 'COMPLETED' && loraUrl && updated.characterCardId) {
    await db.characterCard.update({
      where: { id: updated.characterCardId },
      data: {
        loras: [{ url: loraUrl, scale: 1.0 }],
      },
    })
    logger.info('LoRA auto-bound to character card', {
      jobId,
      characterCardId: updated.characterCardId,
      loraUrl,
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
