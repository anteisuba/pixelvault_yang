import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import type { z } from 'zod'

import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import {
  AuthError,
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
  /** Rate limit config */
  rateLimit: { limit: number; windowSeconds: number }
  /** Route name for logging (e.g. 'POST /api/generate') */
  routeName: string
  /** The service function: receives (clerkId, validatedData) */
  handler: (clerkId: string, data: z.infer<TSchema>) => Promise<TResult>
}

// ─── Consistent Error Response ───────────────────────────────────

interface ErrorResponse {
  success: false
  error: string
  errorCode?: string
  i18nKey?: string
}

interface SuccessResponse<T> {
  success: true
  data: T
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
  return async function POST(
    request: NextRequest,
  ): Promise<NextResponse<SuccessResponse<TResult> | ErrorResponse>> {
    const startedAt = Date.now()

    try {
      // 1. Auth
      const { userId: clerkId } = await auth()
      if (!clerkId) {
        throw new AuthError()
      }

      // 2. Rate limit
      const rateLimitKey = `${config.routeName}:${clerkId}`
      const { success: allowed, remaining } = await rateLimit(
        rateLimitKey,
        config.rateLimit,
      )

      if (!allowed) {
        const headers = {
          'X-RateLimit-Limit': String(config.rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(config.rateLimit.windowSeconds),
        }
        return NextResponse.json<ErrorResponse>(
          new RateLimitError(
            config.rateLimit.limit,
            config.rateLimit.windowSeconds,
          ).toJSON(),
          { status: 429, headers },
        )
      }

      // 3. Parse JSON body
      const body = await request.json().catch(() => null)
      if (!body) {
        return NextResponse.json<ErrorResponse>(
          { success: false, error: 'Invalid JSON body' },
          { status: 400 },
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
      const headers = {
        'X-RateLimit-Limit': String(config.rateLimit.limit),
        'X-RateLimit-Remaining': String(remaining),
      }

      logger.info(config.routeName, {
        userId: clerkId,
        durationMs: Date.now() - startedAt,
      })

      return NextResponse.json<SuccessResponse<TResult>>(
        { success: true, data: result },
        { headers },
      )
    } catch (error) {
      // Handle new GenerationError hierarchy
      if (isGenerationError(error)) {
        logger.warn(`${config.routeName} error`, {
          errorCode: error.errorCode,
          httpStatus: error.httpStatus,
          durationMs: Date.now() - startedAt,
        })
        return NextResponse.json<ErrorResponse>(error.toJSON(), {
          status: error.httpStatus,
        })
      }

      // Handle legacy GenerateImageServiceError (backward compat)
      if (isGenerateImageServiceError(error)) {
        logger.warn(`${config.routeName} legacy service error`, {
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

      // Unknown error
      logger.error(`${config.routeName} unhandled error`, {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      })

      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: 'An unexpected error occurred. Please try again.',
        },
        { status: 500 },
      )
    }
  }
}
