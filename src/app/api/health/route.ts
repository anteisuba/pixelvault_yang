import { NextResponse } from 'next/server'

/**
 * GET /api/health — public liveness probe.
 * Used by deploy-check workflows and uptime monitors.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
