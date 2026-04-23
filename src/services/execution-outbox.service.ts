import 'server-only'

import type { ExecutionOutbox, Prisma } from '@/lib/generated/prisma/client'

import { EXECUTION_OUTBOX } from '@/constants/execution'
import { db } from '@/lib/db'

type ExecutionOutboxMutationClient = Pick<typeof db, 'executionOutbox'>

export interface CreateExecutionOutboxInput {
  generationJobId: string
  kind: string
  payload: Prisma.InputJsonValue
}

export interface CompleteExecutionOutboxInput {
  result?: Prisma.InputJsonValue
  lastError?: string | null
}

export interface FailExecutionOutboxInput {
  lastError: string
  result?: Prisma.InputJsonValue
}

export async function createExecutionOutbox(
  input: CreateExecutionOutboxInput,
  client: ExecutionOutboxMutationClient = db,
): Promise<ExecutionOutbox> {
  return client.executionOutbox.create({
    data: {
      generationJobId: input.generationJobId,
      kind: input.kind,
      payload: input.payload,
    },
  })
}

export async function tryClaimExecutionOutbox(
  id: string,
  client: ExecutionOutboxMutationClient = db,
): Promise<boolean> {
  const leaseExpiresAt = new Date(Date.now() + EXECUTION_OUTBOX.LEASE_MS)
  const result = await client.executionOutbox.updateMany({
    where: {
      id,
      status: 'PENDING',
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

export async function completeExecutionOutbox(
  id: string,
  input: CompleteExecutionOutboxInput,
  client: ExecutionOutboxMutationClient = db,
): Promise<ExecutionOutbox> {
  return client.executionOutbox.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      result: input.result,
      lastError: input.lastError ?? null,
      leaseExpiresAt: null,
      processedAt: new Date(),
    },
  })
}

export async function failExecutionOutbox(
  id: string,
  input: FailExecutionOutboxInput,
  client: ExecutionOutboxMutationClient = db,
): Promise<ExecutionOutbox> {
  return client.executionOutbox.update({
    where: { id },
    data: {
      status: 'FAILED',
      result: input.result,
      lastError: input.lastError,
      leaseExpiresAt: null,
      processedAt: new Date(),
    },
  })
}

export async function annotateExecutionOutbox(
  id: string,
  input: CompleteExecutionOutboxInput,
  client: ExecutionOutboxMutationClient = db,
): Promise<ExecutionOutbox> {
  return client.executionOutbox.update({
    where: { id },
    data: {
      result: input.result,
      lastError: input.lastError,
    },
  })
}

export async function failExpiredExecutionOutbox(
  id: string,
  lastError: string,
  client: ExecutionOutboxMutationClient = db,
): Promise<boolean> {
  const result = await client.executionOutbox.updateMany({
    where: {
      id,
      status: 'PROCESSING',
      leaseExpiresAt: {
        lt: new Date(),
      },
    },
    data: {
      status: 'FAILED',
      lastError,
      leaseExpiresAt: null,
      processedAt: new Date(),
    },
  })

  return result.count === 1
}
