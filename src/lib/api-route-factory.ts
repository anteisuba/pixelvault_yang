import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { z } from 'zod'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import {
  AuthError,
  ApiRequestError,
  GenerationError,
  RateLimitError,
  GenerationValidationError,
  isGenerationError,
} from '@/lib/errors'
import { isGenerateImageServiceError } from '@/services/generate-image.service'

// ─── Types ───────────────────────────────────────────────────────

interface RouteConfig<TSchema extends z.ZodType, TResult> {
  /** Zod schema for request body validation */
  schema: TSchema
  /** Optional rate limit config */
  rateLimit?: { limit: number; windowSeconds: number }
  /** Route name for logging (e.g. 'POST /api/generate') */
  routeName: string
  /** The service function: receives (clerkId, validatedData) */
  handler: (clerkId: string, data: z.infer<TSchema>) => Promise<TResult>
}

interface GetRouteConfig<TSchema extends z.ZodType, TResult> {
  /** Zod schema for query string validation */
  schema: TSchema
  /** Route name for logging (e.g. 'GET /api/images') */
  routeName: string
  /** Whether Clerk auth is required */
  requireAuth?: boolean
  /** Optional rate limit config (auth-bound routes only) */
  rateLimit?: { limit: number; windowSeconds: number }
  /** Handler receives the validated query object */
  handler: (args: {
    clerkId: string | null
    data: z.infer<TSchema>
    request: NextRequest
  }) => Promise<TResult>
}

// ─── Consistent Error Response ───────────────────────────────────

export interface ErrorResponse {
  success: false
  error: string
  errorCode?: string
  i18nKey?: string
}

export interface SuccessResponse<T> {
  success: true
  data: T
}

function buildRateLimitHeaders(
  limit: number,
  remaining: number,
  windowSeconds?: number,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
  }

  if (windowSeconds !== undefined) {
    headers['Retry-After'] = String(windowSeconds)
  }

  return headers
}

function buildJsonErrorResponse(error: GenerationError): NextResponse<ErrorResponse> {
  return NextResponse.json<ErrorResponse>(error.toJSON(), {
    status: error.httpStatus,
  })
}

function toJsonSafe<T>(value: T): T {
  const serialized = JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === 'bigint') {
      const asNumber = Number(currentValue)
      return Number.isSafeInteger(asNumber)
        ? asNumber
        : currentValue.toString()
    }

    return currentValue
  })

  return serialized === undefined ? value : (JSON.parse(serialized) as T)
}

async function getClerkId(required: boolean): Promise<string | null> {
  const authResult = (await auth()) ?? { userId: null }
  const clerkId = authResult.userId ?? null

  if (required && !clerkId) {
    throw new AuthError()
  }

  return clerkId
}

async function applyUserRateLimit(
  routeName: string,
  clerkId: string,
  config: { limit: number; windowSeconds: number },
): Promise<{
  errorResponse: NextResponse<ErrorResponse> | null
  remaining: number
}> {
  const rateLimitKey = `${routeName}:${clerkId}`
  const { success: allowed, remaining } = await rateLimit(rateLimitKey, config)

  if (!allowed) {
    return {
      errorResponse: NextResponse.json<ErrorResponse>(
        new RateLimitError(config.limit, config.windowSeconds).toJSON(),
        {
          status: 429,
          headers: buildRateLimitHeaders(config.limit, 0, config.windowSeconds),
        },
      ),
      remaining: 0,
    }
  }

  return {
    errorResponse: null,
    remaining,
  }
}

function handleRouteError(
  routeName: string,
  startedAt: number,
  error: unknown,
): NextResponse<ErrorResponse> {
  if (isGenerationError(error)) {
    logger.warn(`${routeName} error`, {
      errorCode: error.errorCode,
      httpStatus: error.httpStatus,
      durationMs: Date.now() - startedAt,
    })
    return buildJsonErrorResponse(error)
  }

  if (isGenerateImageServiceError(error)) {
    logger.warn(`${routeName} legacy service error`, {
      code: error.code,
      status: error.status,
    })
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: error.message,
        errorCode: error.code,
      },
      { status: error.status },
    )
  }

  logger.error(`${routeName} unhandled error`, {
    error: error instanceof Error ? error.message : String(error),
    durationMs: Date.now() - startedAt,
  })

  return buildJsonErrorResponse(
    new ApiRequestError(
      'INTERNAL_ERROR',
      500,
      'errors.common.unexpected',
      'An unexpected error occurred. Please try again.',
    ),
  )
}

// ─── Factory ─────────────────────────────────────────────────────

/**
 * Creates a standardized POST route handler.
 *
 * Handles in order:
 * 1. Clerk auth
 * 2. Rate limiting (with consistent X-RateLimit-* headers)
 * 3. JSON body parsing
 * 4. Zod validation (ALL field errors, not just first)
 * 5. Handler invocation
 * 6. Unified error handling (GenerationError + legacy + unknown)
 */
export function createApiRoute<TSchema extends z.ZodType, TResult>(
  config: RouteConfig<TSchema, TResult>,
) {
  return async function handler(
    request: NextRequest,
  ): Promise<NextResponse<SuccessResponse<TResult> | ErrorResponse>> {
    const startedAt = Date.now()

    try {
      // 1. Auth
      const clerkId = await getClerkId(true)
      if (!clerkId) throw new AuthError()

      // 2. Rate limit
      let remaining = 0

      if (config.rateLimit) {
        const rateLimitResult = await applyUserRateLimit(
          config.routeName,
          clerkId,
          config.rateLimit,
        )

        remaining = rateLimitResult.remaining

        if (rateLimitResult.errorResponse) {
          return rateLimitResult.errorResponse
        }
      }

      // 3. Parse JSON body
      const body = await request.json().catch(() => null)
      if (!body) {
        return buildJsonErrorResponse(
          new ApiRequestError(
            'INVALID_JSON',
            400,
            'errors.validation.invalidJson',
            'Invalid JSON body',
          ),
        )
      }

      // 4. Zod validation (all field errors, consistent format)
      const parseResult = config.schema.safeParse(body)
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.issues.map((issue) => ({
          field: String(issue.path?.join('.') ?? ''),
          message: issue.message,
        }))
        throw new GenerationValidationError(fieldErrors)
      }

      // 5. Call handler
      const result = await config.handler(clerkId, parseResult.data)

      // 6. Success response with rate limit headers
      logger.info(config.routeName, {
        userId: clerkId,
        durationMs: Date.now() - startedAt,
      })

      if (!config.rateLimit) {
        return NextResponse.json<SuccessResponse<TResult>>({
          success: true,
          data: toJsonSafe(result),
        })
      }

      return NextResponse.json<SuccessResponse<TResult>>(
        { success: true, data: toJsonSafe(result) },
        {
          headers: buildRateLimitHeaders(config.rateLimit.limit, remaining),
        },
      )
    } catch (error) {
      return handleRouteError(config.routeName, startedAt, error)
    }
  }
}

export function createApiGetRoute<TSchema extends z.ZodType, TResult>(
  config: GetRouteConfig<TSchema, TResult>,
) {
  return async function handler(
    request: NextRequest,
  ): Promise<NextResponse<SuccessResponse<TResult> | ErrorResponse>> {
    const startedAt = Date.now()

    try {
      const clerkId = await getClerkId(config.requireAuth ?? false)

      if (config.rateLimit && clerkId) {
        const { errorResponse: rateLimitedResponse } = await applyUserRateLimit(
          config.routeName,
          clerkId,
          config.rateLimit,
        )

        if (rateLimitedResponse) {
          return rateLimitedResponse
        }
      }

      const searchParams = Object.fromEntries(new URL(request.url).searchParams)
      const parseResult = config.schema.safeParse(searchParams)

      if (!parseResult.success) {
        throw new ApiRequestError(
          'INVALID_QUERY',
          400,
          'errors.gallery.invalidQuery',
          'Invalid query parameters',
        )
      }

      const result = await config.handler({
        clerkId,
        data: parseResult.data,
        request,
      })

      logger.info(config.routeName, {
        userId: clerkId,
        durationMs: Date.now() - startedAt,
      })

      return NextResponse.json<SuccessResponse<TResult>>({
        success: true,
        data: toJsonSafe(result),
      })
    } catch (error) {
      return handleRouteError(config.routeName, startedAt, error)
    }
  }
}
