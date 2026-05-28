import 'server-only'

import { z } from 'zod'

import { EXECUTION_OUTBOX, EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { createImagePreviewAssets, fetchAsBuffer } from '@/services/storage/r2'
import {
  completeExecutionOutbox,
  createExecutionOutbox,
  failExecutionOutbox,
} from '@/services/execution-outbox.service'

const IMAGE_PREVIEW_SOURCE_MAX_BYTES = 40 * 1024 * 1024
const DEFAULT_PROCESS_LIMIT = 2

const ImagePreviewDerivativePayloadSchema = z.object({
  generationId: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceStorageKey: z.string().min(1),
})

type ImagePreviewDerivativePayload = z.infer<
  typeof ImagePreviewDerivativePayloadSchema
>

type ImagePreviewDerivativeClient = Pick<typeof db, 'executionOutbox'>

export interface EnqueueImagePreviewDerivativesInput {
  generationJobId: string
  generationId: string
  sourceUrl: string
  sourceStorageKey: string
}

export type ImagePreviewDerivativeProcessStatus =
  | 'completed'
  | 'failed'
  | 'ignored'
  | 'not-found'
  | 'skipped'

export interface ImagePreviewDerivativeProcessResult {
  outboxId: string
  status: ImagePreviewDerivativeProcessStatus
  generationId?: string
  error?: string
}

function buildPayload(
  input: EnqueueImagePreviewDerivativesInput,
): Prisma.InputJsonObject {
  return {
    generationId: input.generationId,
    sourceUrl: input.sourceUrl,
    sourceStorageKey: input.sourceStorageKey,
  }
}

function parsePayload(value: Prisma.JsonValue): ImagePreviewDerivativePayload {
  return ImagePreviewDerivativePayloadSchema.parse(value)
}

async function claimImagePreviewDerivativeOutbox(
  outboxId: string,
): Promise<boolean> {
  const leaseExpiresAt = new Date(Date.now() + EXECUTION_OUTBOX.LEASE_MS)
  const result = await db.executionOutbox.updateMany({
    where: {
      id: outboxId,
      kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
      OR: [
        { status: 'PENDING' },
        {
          status: 'PROCESSING',
          leaseExpiresAt: { lt: new Date() },
        },
      ],
    },
    data: {
      status: 'PROCESSING',
      attemptCount: { increment: 1 },
      leaseExpiresAt,
      lastError: null,
    },
  })

  return result.count === 1
}

export async function enqueueImagePreviewDerivatives(
  input: EnqueueImagePreviewDerivativesInput,
  client: ImagePreviewDerivativeClient = db,
) {
  return createExecutionOutbox(
    {
      generationJobId: input.generationJobId,
      kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
      payload: buildPayload(input),
    },
    client,
  )
}

export async function processImagePreviewDerivativeOutbox(
  outboxId: string,
): Promise<ImagePreviewDerivativeProcessResult> {
  const outbox = await db.executionOutbox.findUnique({
    where: { id: outboxId },
  })

  if (!outbox) {
    return { outboxId, status: 'not-found' }
  }

  if (outbox.kind !== EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES) {
    return { outboxId, status: 'ignored' }
  }

  if (outbox.status === 'COMPLETED') {
    const payload = ImagePreviewDerivativePayloadSchema.safeParse(
      outbox.payload,
    )
    return {
      outboxId,
      status: 'completed',
      generationId: payload.success ? payload.data.generationId : undefined,
    }
  }

  if (outbox.status === 'FAILED') {
    return {
      outboxId,
      status: 'failed',
      error: outbox.lastError ?? 'Image preview derivative task failed',
    }
  }

  const claimed = await claimImagePreviewDerivativeOutbox(outboxId)
  if (!claimed) {
    return { outboxId, status: 'skipped' }
  }

  let payload: ImagePreviewDerivativePayload
  try {
    payload = parsePayload(outbox.payload)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid derivative payload'
    await failExecutionOutbox(outboxId, { lastError: message })
    return { outboxId, status: 'failed', error: message }
  }

  try {
    const generation = await db.generation.findUnique({
      where: { id: payload.generationId },
      select: {
        id: true,
        outputType: true,
        thumbnailUrl: true,
        previewUrl: true,
      },
    })

    if (!generation || generation.outputType !== 'IMAGE') {
      const message = 'Image generation for derivative task was not found'
      await failExecutionOutbox(outboxId, {
        lastError: message,
        result: buildPayload({
          generationJobId: outbox.generationJobId,
          generationId: payload.generationId,
          sourceUrl: payload.sourceUrl,
          sourceStorageKey: payload.sourceStorageKey,
        }),
      })
      return {
        outboxId,
        status: 'failed',
        generationId: payload.generationId,
        error: message,
      }
    }

    if (generation.thumbnailUrl && generation.previewUrl) {
      await completeExecutionOutbox(outboxId, {
        result: {
          generationId: generation.id,
          thumbnailUrl: generation.thumbnailUrl,
          previewUrl: generation.previewUrl,
          alreadyCompleted: true,
        },
      })
      return {
        outboxId,
        status: 'completed',
        generationId: generation.id,
      }
    }

    const source = await fetchAsBuffer(payload.sourceUrl, {
      maxBytes: IMAGE_PREVIEW_SOURCE_MAX_BYTES,
    })
    const previewAssets = await createImagePreviewAssets({
      sourceBuffer: source.buffer,
      sourceStorageKey: payload.sourceStorageKey,
    })

    await db.$transaction(async (tx) => {
      await tx.generation.update({
        where: { id: generation.id },
        data: {
          thumbnailUrl: previewAssets.thumbnailUrl,
          thumbnailStorageKey: previewAssets.thumbnailStorageKey,
          previewUrl: previewAssets.previewUrl,
          previewStorageKey: previewAssets.previewStorageKey,
        },
      })

      await completeExecutionOutbox(
        outboxId,
        {
          result: {
            generationId: generation.id,
            thumbnailUrl: previewAssets.thumbnailUrl,
            thumbnailStorageKey: previewAssets.thumbnailStorageKey,
            previewUrl: previewAssets.previewUrl,
            previewStorageKey: previewAssets.previewStorageKey,
          },
        },
        tx,
      )
    })

    logger.info('Image preview derivatives completed', {
      outboxId,
      generationId: generation.id,
    })

    return {
      outboxId,
      status: 'completed',
      generationId: generation.id,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Image preview derivative processing failed'
    await failExecutionOutbox(outboxId, { lastError: message })
    logger.warn('Image preview derivative processing failed', {
      outboxId,
      generationId: payload.generationId,
      error: message,
    })
    return {
      outboxId,
      status: 'failed',
      generationId: payload.generationId,
      error: message,
    }
  }
}

export async function processPendingImagePreviewDerivativeOutboxes(
  options: { limit?: number } = {},
): Promise<ImagePreviewDerivativeProcessResult[]> {
  const limit = options.limit ?? DEFAULT_PROCESS_LIMIT
  const outboxes = await db.executionOutbox.findMany({
    where: {
      kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
      OR: [
        { status: 'PENDING' },
        {
          status: 'PROCESSING',
          leaseExpiresAt: { lt: new Date() },
        },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  const results: ImagePreviewDerivativeProcessResult[] = []
  for (const outbox of outboxes) {
    results.push(await processImagePreviewDerivativeOutbox(outbox.id))
  }

  return results
}
