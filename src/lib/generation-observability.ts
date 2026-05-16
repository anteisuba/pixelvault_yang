import { logger } from '@/lib/logger'
import type { Prisma } from '@/lib/generated/prisma/client'

export const GENERATION_STAGE = {
  AUTH_ROUTE_RESOLVE: 'auth_route_resolve',
  JOB_CREATE: 'job_create',
  PROVIDER_SUBMIT: 'provider_submit',
  PROVIDER_WAIT_POLL: 'provider_wait_poll',
  WORKER_DISPATCH: 'worker_dispatch',
  REFERENCE_UPLOAD: 'reference_upload',
  RESULT_DOWNLOAD: 'result_download',
  R2_UPLOAD: 'r2_upload',
  THUMBNAIL_GENERATION: 'thumbnail_generation',
  DB_FINALIZE: 'db_finalize',
} as const

export type GenerationStage =
  (typeof GENERATION_STAGE)[keyof typeof GENERATION_STAGE]

export type GenerationStageDurations = Partial<Record<GenerationStage, number>>

export interface GenerationObservabilityContext {
  outputType: string
  jobId?: string
  generationId?: string
  modelId?: string
  adapterType?: string
  provider?: string
  routeKind?: string
}

export interface GenerationObservabilitySnapshot {
  version: 1
  startedAt: string
  completedAt: string
  totalMs: number
  stageDurationsMs: GenerationStageDurations
  notes?: string[]
}

function normalizeDuration(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.round(ms)
}

function toJsonSafeObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

export class GenerationStageTimer {
  private readonly startedAtMs = Date.now()
  private readonly startedAt = new Date(this.startedAtMs).toISOString()
  private readonly stageDurationsMs: GenerationStageDurations = {}
  private readonly notes = new Set<string>()
  private context: GenerationObservabilityContext

  constructor(context: GenerationObservabilityContext) {
    this.context = context
  }

  setContext(context: Partial<GenerationObservabilityContext>): void {
    this.context = {
      ...this.context,
      ...context,
    }
  }

  addNote(note: string): void {
    const trimmed = note.trim()
    if (trimmed) {
      this.notes.add(trimmed)
    }
  }

  addDuration(stage: GenerationStage, durationMs: number): void {
    const current = this.stageDurationsMs[stage] ?? 0
    this.stageDurationsMs[stage] = normalizeDuration(current + durationMs)
  }

  setDuration(stage: GenerationStage, durationMs: number): void {
    this.stageDurationsMs[stage] = normalizeDuration(durationMs)
  }

  getDuration(stage: GenerationStage): number | undefined {
    return this.stageDurationsMs[stage]
  }

  elapsedMs(): number {
    return normalizeDuration(Date.now() - this.startedAtMs)
  }

  async measure<T>(
    stage: GenerationStage,
    action: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now()
    try {
      return await action()
    } finally {
      this.addDuration(stage, Date.now() - startedAt)
    }
  }

  measureSync<T>(stage: GenerationStage, action: () => T): T {
    const startedAt = Date.now()
    try {
      return action()
    } finally {
      this.addDuration(stage, Date.now() - startedAt)
    }
  }

  snapshot(): GenerationObservabilitySnapshot {
    const notes = Array.from(this.notes)
    return {
      version: 1,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      totalMs: this.elapsedMs(),
      stageDurationsMs: { ...this.stageDurationsMs },
      ...(notes.length > 0 ? { notes } : {}),
    }
  }

  log(extra?: Record<string, unknown>): void {
    const snapshot = this.snapshot()
    logger.info('Generation stage timings', {
      event: 'generation_stage_timings',
      ...this.context,
      ...extra,
      totalMs: snapshot.totalMs,
      stageDurationsMs: snapshot.stageDurationsMs,
      notes: snapshot.notes,
    })
  }
}

export function withGenerationObservability(
  snapshot: Record<string, unknown>,
  timer: GenerationStageTimer,
): Prisma.InputJsonValue {
  return toJsonSafeObject({
    ...snapshot,
    observability: timer.snapshot(),
  }) as Prisma.InputJsonValue
}
