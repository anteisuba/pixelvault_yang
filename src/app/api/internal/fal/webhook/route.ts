import 'server-only'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { FAL_WEBHOOK } from '@/constants/execution'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { verifyFalWebhookSignature } from '@/lib/signature-verifiers/fal-webhook'
import {
  handleExecutionCallback,
  type CallbackResult,
} from '@/services/execution-callback.service'

export const runtime = 'nodejs'

// ─── FAL payload extraction ──────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key]
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * Extract a completed video artifact from a FAL webhook body.
 * FAL sends the same JSON that the responseUrl returns:
 *   { video: { url, content_type, ... }, thumbnail: { url, ... }, ... }
 */
function extractFalVideoResult(body: Record<string, unknown>): {
  artifactUrl: string
  thumbnailUrl?: string
  mimeType?: string
} | null {
  const video = isRecord(body.video) ? body.video : null
  const artifactUrl = video ? readString(video, 'url') : null
  if (!artifactUrl) return null

  const thumbnail = isRecord(body.thumbnail) ? body.thumbnail : null
  const thumbnailUrl = thumbnail
    ? (readString(thumbnail, 'url') ?? undefined)
    : undefined
  const mimeType = video
    ? (readString(video, 'content_type') ?? undefined)
    : undefined

  return { artifactUrl, thumbnailUrl, mimeType }
}

function isFalErrorBody(body: Record<string, unknown>): boolean {
  return (
    typeof body.error === 'string' ||
    typeof body.detail === 'string' ||
    Array.isArray(body.detail)
  )
}

// ─── POST /api/internal/fal/webhook ─────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  const runId = url.searchParams.get(FAL_WEBHOOK.RUN_ID_PARAM)?.trim()

  if (!runId) {
    return NextResponse.json(
      { success: false, error: 'Missing runId query parameter.' },
      { status: 400 },
    )
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to read request body.' },
      { status: 400 },
    )
  }

  // Verify FAL Ed25519 signature
  try {
    await verifyFalWebhookSignature(rawBody, request)
  } catch (err) {
    if (err instanceof ApiRequestError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.httpStatus },
      )
    }
    return NextResponse.json(
      { success: false, error: 'Signature verification error.' },
      { status: 401 },
    )
  }

  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!isRecord(parsed)) throw new Error('Payload is not an object')
    body = parsed
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload.' },
      { status: 400 },
    )
  }

  const ts = new Date().toISOString()

  // Determine success vs failure from FAL's payload
  const isFailed = isFalErrorBody(body) && !isRecord(body.video)

  let result: CallbackResult
  try {
    if (isFailed) {
      const errorMessage =
        typeof body.error === 'string'
          ? body.error
          : typeof body.detail === 'string'
            ? body.detail
            : 'FAL generation failed.'

      result = await handleExecutionCallback({
        runId,
        kind: 'result',
        ts,
        data: { error: errorMessage },
      })
    } else {
      const extracted = extractFalVideoResult(body)
      if (!extracted) {
        logger.warn('FAL webhook: unrecognized payload shape', {
          runId,
          bodyKeys: Object.keys(body),
        })
        return NextResponse.json(
          { success: false, error: 'Unrecognized FAL payload shape.' },
          { status: 422 },
        )
      }

      result = await handleExecutionCallback({
        runId,
        kind: 'result',
        ts,
        data: {
          artifactUrl: extracted.artifactUrl,
          thumbnailUrl: extracted.thumbnailUrl,
          mimeType: extracted.mimeType,
          providerMetadata: {
            requestId: readString(body, 'request_id') ?? undefined,
            source: 'fal_webhook',
          },
        },
      })
    }
  } catch (err) {
    // Job-not-found: return 200 so FAL stops retrying a non-existent job
    if (err instanceof ApiRequestError && err.httpStatus === 404) {
      logger.warn('FAL webhook: job not found, acknowledging to stop retries', {
        runId,
      })
      return NextResponse.json({ success: true, action: 'not-found' })
    }

    logger.error('FAL webhook: callback handler error', {
      runId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, data: result })
}
