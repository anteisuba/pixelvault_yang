import 'server-only'

import { API_USAGE } from '@/constants/config'
import { db } from '@/lib/db'
import type {
  ApiUsageLedger,
  GenerationJob,
} from '@/lib/generated/prisma/client'

type UsageMutationClient = Pick<typeof db, 'generationJob' | 'apiUsageLedger'>

export interface CreateGenerationJobInput {
  userId: string
  adapterType: string
  provider: string
  modelId: string
  prompt?: string
  externalRequestId?: string
}

export interface UpdateGenerationJobInput {
  generationId?: string
  requestCount?: number
  errorMessage?: string
}

export interface CreateApiUsageEntryInput {
  userId: string
  generationId?: string
  generationJobId?: string
  adapterType: string
  provider: string
  modelId: string
  requestCount?: number
  inputImageCount?: number
  outputImageCount?: number
  width?: number
  height?: number
  durationMs?: number
  wasSuccessful: boolean
  errorMessage?: string
}

export interface UserUsageSummary {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  last30DaysRequests: number
  lastRequestAt: Date | null
}

export async function createGenerationJob(
  input: CreateGenerationJobInput,
  client: Pick<typeof db, 'generationJob'> = db,
): Promise<GenerationJob> {
  return client.generationJob.create({
    data: {
      userId: input.userId,
      adapterType: input.adapterType,
      provider: input.provider,
      modelId: input.modelId,
      status: 'RUNNING',
      prompt: input.prompt,
      externalRequestId: input.externalRequestId,
      startedAt: new Date(),
    },
  })
}

export async function completeGenerationJob(
  id: string,
  input: UpdateGenerationJobInput,
  client: UsageMutationClient = db,
): Promise<GenerationJob> {
  return client.generationJob.update({
    where: { id },
    data: {
      generationId: input.generationId,
      requestCount: input.requestCount,
      status: 'COMPLETED',
      completedAt: new Date(),
      errorMessage: null,
    },
  })
}

export async function failGenerationJob(
  id: string,
  input: UpdateGenerationJobInput,
  client: UsageMutationClient = db,
): Promise<GenerationJob> {
  return client.generationJob.update({
    where: { id },
    data: {
      requestCount: input.requestCount,
      status: 'FAILED',
      completedAt: new Date(),
      errorMessage: input.errorMessage,
    },
  })
}

export async function createApiUsageEntry(
  input: CreateApiUsageEntryInput,
  client: UsageMutationClient = db,
): Promise<ApiUsageLedger> {
  return client.apiUsageLedger.create({
    data: {
      userId: input.userId,
      generationId: input.generationId,
      generationJobId: input.generationJobId,
      adapterType: input.adapterType,
      provider: input.provider,
      modelId: input.modelId,
      requestCount:
        input.requestCount ?? API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      inputImageCount: input.inputImageCount ?? 0,
      outputImageCount: input.outputImageCount ?? 1,
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      wasSuccessful: input.wasSuccessful,
      errorMessage: input.errorMessage,
    },
  })
}

export async function attachUsageEntryToGeneration(
  usageEntryId: string,
  generationId: string,
): Promise<ApiUsageLedger> {
  return db.apiUsageLedger.update({
    where: { id: usageEntryId },
    data: {
      generationId,
    },
  })
}

export async function getUserUsageSummary(
  userId: string,
): Promise<UserUsageSummary> {
  const lookbackStart = new Date()
  lookbackStart.setDate(
    lookbackStart.getDate() - API_USAGE.SUMMARY_LOOKBACK_DAYS,
  )

  type Row = {
    total: bigint | null
    successful: bigint | null
    failed: bigint | null
    last30days: bigint | null
    last_request_at: Date | null
  }

  const rows = await db.$queryRaw<Row[]>`
    SELECT
      SUM("requestCount")                                                      AS total,
      SUM(CASE WHEN "wasSuccessful" THEN "requestCount" ELSE 0 END)           AS successful,
      SUM(CASE WHEN NOT "wasSuccessful" THEN "requestCount" ELSE 0 END)       AS failed,
      SUM(CASE WHEN "createdAt" >= ${lookbackStart} THEN "requestCount" ELSE 0 END) AS last30days,
      MAX("createdAt")                                                         AS last_request_at
    FROM "ApiUsageLedger"
    WHERE "userId" = ${userId}
  `

  const row = rows[0]
  return {
    totalRequests: Number(row?.total ?? 0),
    successfulRequests: Number(row?.successful ?? 0),
    failedRequests: Number(row?.failed ?? 0),
    last30DaysRequests: Number(row?.last30days ?? 0),
    lastRequestAt: row?.last_request_at ?? null,
  }
}
