import { NextResponse } from 'next/server'

import { getResolvedModelOptions } from '@/services/model-config.service'

export async function GET() {
  try {
    const models = await getResolvedModelOptions()
    const available = models.filter((m) => m.available)

    return NextResponse.json({ success: true, data: available })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch models'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    )
  }
}
