import { z } from 'zod'

import {
  STUDIO_NODE_HANDOFF_MAX_REFERENCES,
  STUDIO_NODE_HANDOFF_STORAGE_KEY,
  STUDIO_NODE_RESULT_STORAGE_KEY,
} from '@/constants/studio'

/**
 * Typed sessionStorage bridge for the Open-Image-Studio round-trip between a
 * canvas image node and the Studio workspace. Outbound = HANDOFF (node →
 * Studio); return = RESULT (Studio → node). All reads are Zod-validated and
 * window-guarded so a malformed/stale payload is ignored rather than throwing.
 */

const StudioNodeHandoffSchema = z.object({
  originNodeId: z.string().trim().min(1),
  prompt: z.string().default(''),
  characterName: z.string().trim().min(1).optional(),
  referenceUrls: z
    .array(z.string().trim().min(1))
    .max(STUDIO_NODE_HANDOFF_MAX_REFERENCES)
    .default([]),
  styleCode: z.string().trim().min(1).optional(),
})

export type StudioNodeHandoff = z.infer<typeof StudioNodeHandoffSchema>

const StudioNodeResultSchema = z.object({
  originNodeId: z.string().trim().min(1),
  url: z.string().trim().min(1),
  generationId: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
})

export type StudioNodeResult = z.infer<typeof StudioNodeResultSchema>

function readValidated<T>(key: string, schema: z.ZodType<T>): T | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeValue(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, JSON.stringify(value))
}

function clearValue(key: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(key)
}

export function writeStudioNodeHandoff(handoff: StudioNodeHandoff): void {
  writeValue(
    STUDIO_NODE_HANDOFF_STORAGE_KEY,
    StudioNodeHandoffSchema.parse(handoff),
  )
}

export function readStudioNodeHandoff(): StudioNodeHandoff | null {
  return readValidated(STUDIO_NODE_HANDOFF_STORAGE_KEY, StudioNodeHandoffSchema)
}

export function clearStudioNodeHandoff(): void {
  clearValue(STUDIO_NODE_HANDOFF_STORAGE_KEY)
}

export function writeStudioNodeResult(result: StudioNodeResult): void {
  writeValue(
    STUDIO_NODE_RESULT_STORAGE_KEY,
    StudioNodeResultSchema.parse(result),
  )
}

export function readStudioNodeResult(): StudioNodeResult | null {
  return readValidated(STUDIO_NODE_RESULT_STORAGE_KEY, StudioNodeResultSchema)
}

export function clearStudioNodeResult(): void {
  clearValue(STUDIO_NODE_RESULT_STORAGE_KEY)
}
