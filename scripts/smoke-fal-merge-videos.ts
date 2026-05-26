/**
 * fal-ai/ffmpeg-api/merge-videos PoC smoke test
 *
 * Run:
 *   FAL_KEY=<your_key> npx tsx --tsconfig tsconfig.json \
 *     scripts/smoke-fal-merge-videos.ts \
 *     <video_url_1> <video_url_2> [<video_url_3> ...]
 */
import { setTimeout as sleep } from 'node:timers/promises'

const FAL_QUEUE_BASE = 'https://queue.fal.run'
const ENDPOINT = 'fal-ai/ffmpeg-api/merge-videos'
const SUBMIT_URL = `${FAL_QUEUE_BASE}/${ENDPOINT}`

interface QueueSubmitResponse {
  request_id: string
  status_url: string
  response_url: string
}
interface QueueStatusResponse {
  status: string
  logs?: Array<{ message: string }>
}

async function main(): Promise<void> {
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    console.error('error: FAL_KEY env var required')
    process.exit(1)
  }

  const videoUrls = process.argv.slice(2).filter((a) => a.length > 0)
  if (videoUrls.length < 2) {
    console.error('error: pass at least 2 video URLs as positional args')
    process.exit(1)
  }

  console.log(`📤 merging ${videoUrls.length} clip(s):`)
  videoUrls.forEach((u, i) => console.log(`   [${i + 1}] ${u}`))

  const submitStart = Date.now()
  const submitRes = await fetch(SUBMIT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      video_urls: videoUrls,
      target_fps: 30,
      resolution: 'landscape_16_9',
    }),
  })
  if (!submitRes.ok) {
    console.error(`❌ submit ${submitRes.status}:`, await submitRes.text())
    process.exit(1)
  }
  const queue = (await submitRes.json()) as QueueSubmitResponse
  console.log(`\n✅ queued — request_id=${queue.request_id}\n`)

  let lastStatus = '',
    pollCount = 0
  const pollStart = Date.now()
  while (true) {
    pollCount += 1
    const sRes = await fetch(queue.status_url, {
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!sRes.ok) {
      console.error('❌ poll', sRes.status)
      process.exit(1)
    }
    const status = (await sRes.json()) as QueueStatusResponse
    if (status.status !== lastStatus) {
      console.log(
        `   poll #${pollCount} [+${((Date.now() - pollStart) / 1000).toFixed(1)}s] → ${status.status}`,
      )
      lastStatus = status.status
    }
    if (status.status === 'COMPLETED') break
    if (['FAILED', 'CANCELLED', 'ERROR'].includes(status.status)) {
      console.error('❌ failed:', JSON.stringify(status, null, 2))
      process.exit(1)
    }
    await sleep(3000)
  }
  console.log(
    `\n✅ COMPLETED in ${((Date.now() - submitStart) / 1000).toFixed(1)}s\n`,
  )

  const rRes = await fetch(queue.response_url, {
    headers: { Authorization: `Key ${apiKey}` },
  })
  console.log('--- response headers ---')
  for (const [k, v] of rRes.headers.entries()) {
    if (
      k.startsWith('x-fal') ||
      k.startsWith('content-') ||
      k === 'x-cost' ||
      k === 'x-credits'
    ) {
      console.log(`   ${k}: ${v}`)
    }
  }
  const result = (await rRes.json()) as Record<string, unknown>
  console.log('\n--- response body ---')
  console.log(JSON.stringify(result, null, 2))
  console.log(
    `\n💰 cost check: https://fal.ai/dashboard/usage?request_id=${queue.request_id}`,
  )
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
