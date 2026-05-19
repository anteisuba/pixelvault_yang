/**
 * fal Hunyuan3D v3.1 Pro — Geometry vs Normal probe
 *
 * Validates the assumptions made in `3d-staged-generation.md` before
 * committing to the staged-generation refactor:
 *
 *   1. How long does `generate_type: 'Geometry'` actually take vs `Normal`?
 *   2. How does the cost compare? (Verified against fal billing dashboard.)
 *   3. Is the Geometry GLB independently usable / viewable?
 *   4. How big is the Geometry GLB compared to Normal?
 *
 * The script is `--dry-run` by default. Pass `--execute` to actually hit fal
 * (this costs real money — roughly $0.6 for both phases combined).
 *
 * Usage:
 *   npx tsx docs/plans/frontend/probe-fal-hunyuan-geometry.ts                     # dry-run
 *   npx tsx docs/plans/frontend/probe-fal-hunyuan-geometry.ts --execute \
 *     --image https://cdn.example.com/source.png                                  # both phases
 *   npx tsx docs/plans/frontend/probe-fal-hunyuan-geometry.ts --execute \
 *     --image <url> --phase geometry                                              # geometry only
 *
 * fal API key (pick one):
 *   --key <key>            CLI flag (highest priority)
 *   FAL_API_KEY env var    (in .env.local or your shell)
 *
 * PixelVault is BYOK, so prod keys live in the DB, not in .env.local. For a
 * probe you typically pass --key directly with one of your own active keys
 * from the fal dashboard.
 *
 * Outputs:
 *   tmp/fal-probe-<timestamp>/
 *     ├── geometry.glb          (downloaded mesh-only GLB)
 *     ├── normal.glb            (downloaded full GLB)
 *     └── report.md             (timing + size comparison)
 */

import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

config({ path: resolve(import.meta.dirname, '..', '..', '..', '.env.local') })

const FAL_QUEUE = 'https://queue.fal.run'
const HUNYUAN_V31_PRO_PATH = 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d'

const PHASES = ['geometry', 'normal', 'both'] as const
type Phase = (typeof PHASES)[number]

interface CliArgs {
  execute: boolean
  imageUrl: string | null
  apiKey: string | null
  phase: Phase
  faceCount: number
  pollIntervalMs: number
  timeoutMs: number
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    execute: false,
    imageUrl: null,
    apiKey: null,
    phase: 'both',
    faceCount: 500_000,
    pollIntervalMs: 3_000,
    timeoutMs: 10 * 60 * 1000,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = argv[i + 1]
    if (flag === '--execute') {
      args.execute = true
    } else if (flag === '--image' && next) {
      args.imageUrl = next
      i++
    } else if (flag === '--key' && next) {
      args.apiKey = next
      i++
    } else if (flag === '--phase' && next) {
      if (!PHASES.includes(next as Phase)) {
        throw new Error(`--phase must be one of: ${PHASES.join(', ')}`)
      }
      args.phase = next as Phase
      i++
    } else if (flag === '--face-count' && next) {
      args.faceCount = Number.parseInt(next, 10)
      i++
    } else if (flag === '--poll-ms' && next) {
      args.pollIntervalMs = Number.parseInt(next, 10)
      i++
    } else if (flag === '--timeout-ms' && next) {
      args.timeoutMs = Number.parseInt(next, 10)
      i++
    } else if (flag === '--help' || flag === '-h') {
      printUsage()
      process.exit(0)
    }
  }
  return args
}

function printUsage(): void {
  console.log(
    `Usage: npx tsx docs/plans/frontend/probe-fal-hunyuan-geometry.ts [options]

Options:
  --execute              Actually call fal (costs ~$0.6 for both phases).
                         Without this flag the script only prints what it would do.
  --image <url>          Source image URL (required when --execute).
  --key <fal-api-key>    fal API key. Falls back to FAL_API_KEY env var if omitted.
                         PixelVault is BYOK so .env.local won't have one by default —
                         grab a key from your fal dashboard and pass it here.
  --phase <p>            'geometry' | 'normal' | 'both'  (default: both)
  --face-count <n>       Hunyuan face budget  (default: 500000)
  --poll-ms <n>          Status poll interval in ms  (default: 3000)
  --timeout-ms <n>       Hard timeout per phase in ms  (default: 600000)
  --help                 Show this message
`,
  )
}

interface FalSubmitResponse {
  request_id: string
  status_url: string
  response_url: string
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string
  logs?: Array<{ message?: string }>
  queue_position?: number
}

interface FalModelFile {
  url: string
  content_type?: string | null
  file_name?: string | null
  file_size?: number | null
}

interface FalHunyuanResult {
  model_mesh?: FalModelFile
  model_glb?: FalModelFile
  model_urls?: { glb?: FalModelFile }
  seed?: number
}

interface PhaseResult {
  phase: 'geometry' | 'normal'
  submitMs: number
  totalWaitMs: number
  pollCount: number
  glbUrl: string
  glbSizeBytes: number
  contentType: string | null
  seed: number | null
  reportedFileSize: number | null
  localPath: string
}

async function submitFalJob(params: {
  apiKey: string
  imageUrl: string
  generateType: 'Geometry' | 'Normal'
  faceCount: number
}): Promise<{ submitMs: number; submit: FalSubmitResponse }> {
  const endpoint = `${FAL_QUEUE}/${HUNYUAN_V31_PRO_PATH}`
  const body = {
    input_image_url: params.imageUrl,
    generate_type: params.generateType,
    face_count: params.faceCount,
  }

  const t0 = Date.now()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  const submitMs = Date.now() - t0

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown')
    throw new Error(
      `Submit failed (${response.status}): ${errorBody.slice(0, 500)}`,
    )
  }

  const submit = (await response.json()) as FalSubmitResponse
  if (!submit.request_id || !submit.status_url || !submit.response_url) {
    throw new Error(
      `Unexpected submit response shape: ${JSON.stringify(submit).slice(0, 300)}`,
    )
  }

  return { submitMs, submit }
}

async function pollUntilDone(params: {
  apiKey: string
  statusUrl: string
  responseUrl: string
  pollIntervalMs: number
  timeoutMs: number
  onTick?: (status: FalStatusResponse, elapsedMs: number) => void
}): Promise<{
  pollCount: number
  totalWaitMs: number
  result: FalHunyuanResult
}> {
  const start = Date.now()
  let pollCount = 0

  while (Date.now() - start < params.timeoutMs) {
    pollCount++
    const statusResp = await fetch(params.statusUrl, {
      headers: { Authorization: `Key ${params.apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })

    if (!statusResp.ok) {
      const txt = await statusResp.text().catch(() => '')
      throw new Error(
        `Status check failed (${statusResp.status}): ${txt.slice(0, 300)}`,
      )
    }

    const status = (await statusResp.json()) as FalStatusResponse
    const elapsedMs = Date.now() - start
    params.onTick?.(status, elapsedMs)

    if (status.status === 'COMPLETED') {
      const resultResp = await fetch(params.responseUrl, {
        headers: { Authorization: `Key ${params.apiKey}` },
        signal: AbortSignal.timeout(30_000),
      })
      if (!resultResp.ok) {
        const txt = await resultResp.text().catch(() => '')
        throw new Error(
          `Result fetch failed (${resultResp.status}): ${txt.slice(0, 300)}`,
        )
      }
      const result = (await resultResp.json()) as FalHunyuanResult
      return { pollCount, totalWaitMs: elapsedMs, result }
    }

    if (status.status === 'FAILED') {
      const lastLog =
        status.logs?.[status.logs.length - 1]?.message ?? 'no logs'
      throw new Error(`Provider FAILED: ${lastLog}`)
    }

    await sleep(params.pollIntervalMs)
  }

  throw new Error(`Timed out after ${params.timeoutMs}ms`)
}

function pickGlbFile(result: FalHunyuanResult): FalModelFile | null {
  return result.model_glb ?? result.model_urls?.glb ?? result.model_mesh ?? null
}

async function downloadToFile(url: string, localPath: string): Promise<number> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!resp.ok) {
    throw new Error(`Download failed (${resp.status}): ${url}`)
  }
  const buffer = Buffer.from(await resp.arrayBuffer())
  await writeFile(localPath, buffer)
  return buffer.byteLength
}

async function runPhase(params: {
  phase: 'geometry' | 'normal'
  apiKey: string
  imageUrl: string
  faceCount: number
  pollIntervalMs: number
  timeoutMs: number
  outDir: string
}): Promise<PhaseResult> {
  const generateType = params.phase === 'geometry' ? 'Geometry' : 'Normal'
  console.log(
    `\n--- Phase: ${params.phase.toUpperCase()} (generate_type=${generateType}, face_count=${params.faceCount}) ---`,
  )

  const { submitMs, submit } = await submitFalJob({
    apiKey: params.apiKey,
    imageUrl: params.imageUrl,
    generateType,
    faceCount: params.faceCount,
  })
  console.log(`  submit:        ${submitMs}ms  request_id=${submit.request_id}`)

  let lastStatus = ''
  const { pollCount, totalWaitMs, result } = await pollUntilDone({
    apiKey: params.apiKey,
    statusUrl: submit.status_url,
    responseUrl: submit.response_url,
    pollIntervalMs: params.pollIntervalMs,
    timeoutMs: params.timeoutMs,
    onTick: (status, elapsedMs) => {
      if (status.status !== lastStatus) {
        lastStatus = status.status
        console.log(
          `  [+${Math.round(elapsedMs / 1000)}s]  status=${status.status}${
            status.queue_position != null
              ? `  queue_position=${status.queue_position}`
              : ''
          }`,
        )
      }
    },
  })

  const glbFile = pickGlbFile(result)
  if (!glbFile) {
    throw new Error(
      `Could not locate GLB in response: ${JSON.stringify(result).slice(0, 400)}`,
    )
  }

  const localPath = resolve(params.outDir, `${params.phase}.glb`)
  const glbSizeBytes = await downloadToFile(glbFile.url, localPath)
  console.log(
    `  total wait:    ${(totalWaitMs / 1000).toFixed(1)}s  (${pollCount} polls)`,
  )
  console.log(
    `  GLB:           ${(glbSizeBytes / 1024 / 1024).toFixed(2)} MB  →  ${localPath}`,
  )

  return {
    phase: params.phase,
    submitMs,
    totalWaitMs,
    pollCount,
    glbUrl: glbFile.url,
    glbSizeBytes,
    contentType: glbFile.content_type ?? null,
    seed: result.seed ?? null,
    reportedFileSize: glbFile.file_size ?? null,
    localPath,
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function buildReport(params: {
  imageUrl: string
  faceCount: number
  results: PhaseResult[]
  startedAt: Date
  finishedAt: Date
}): string {
  const lines: string[] = []
  lines.push('# fal Hunyuan3D v3.1 Pro — Geometry vs Normal Probe')
  lines.push('')
  lines.push(`- **Started**: ${params.startedAt.toISOString()}`)
  lines.push(`- **Finished**: ${params.finishedAt.toISOString()}`)
  lines.push(`- **Source image**: ${params.imageUrl}`)
  lines.push(`- **Face count**: ${params.faceCount.toLocaleString()}`)
  lines.push('')
  lines.push('## Results')
  lines.push('')
  lines.push(
    '| Phase | Submit | Wait | Polls | GLB size | Reported size | Seed | Content-Type |',
  )
  lines.push('|---|---|---|---|---|---|---|---|')
  for (const r of params.results) {
    lines.push(
      `| ${r.phase} | ${formatMs(r.submitMs)} | ${formatMs(r.totalWaitMs)} | ${r.pollCount} | ${formatBytes(r.glbSizeBytes)} | ${r.reportedFileSize != null ? formatBytes(r.reportedFileSize) : 'n/a'} | ${r.seed ?? 'n/a'} | ${r.contentType ?? 'n/a'} |`,
    )
  }
  lines.push('')

  const geom = params.results.find((r) => r.phase === 'geometry')
  const normal = params.results.find((r) => r.phase === 'normal')
  if (geom && normal) {
    const timeRatio = geom.totalWaitMs / normal.totalWaitMs
    const sizeRatio = geom.glbSizeBytes / normal.glbSizeBytes
    lines.push('## Ratios')
    lines.push('')
    lines.push(
      `- **Geometry / Normal wait time**: ${(timeRatio * 100).toFixed(0)}%  (Geometry takes ${(1 - timeRatio > 0 ? (1 - timeRatio) * 100 : 0).toFixed(0)}% less wall-clock time)`,
    )
    lines.push(
      `- **Geometry / Normal GLB size**: ${(sizeRatio * 100).toFixed(0)}%  (Geometry GLB is ${(1 - sizeRatio > 0 ? (1 - sizeRatio) * 100 : 0).toFixed(0)}% smaller)`,
    )
    lines.push('')
    lines.push('## Verdict checklist')
    lines.push('')
    lines.push(
      `- [${geom.totalWaitMs < normal.totalWaitMs * 0.6 ? 'x' : ' '}] Geometry is meaningfully faster than Normal (target: <60% of Normal)`,
    )
    lines.push(
      `- [${geom.glbSizeBytes < normal.glbSizeBytes * 0.5 ? 'x' : ' '}] Geometry GLB is meaningfully smaller (target: <50% of Normal)`,
    )
    lines.push(
      `- [ ] Geometry GLB renders correctly in <model-viewer> when opened locally (manual check)`,
    )
    lines.push(
      `- [ ] Geometry mesh quality matches the eventual Normal mesh visually (manual check — open both side by side)`,
    )
    lines.push('')
    lines.push('Inspect the GLB files at:')
    lines.push('')
    lines.push(`- Geometry: \`${geom.localPath}\``)
    lines.push(`- Normal:   \`${normal.localPath}\``)
    lines.push('')
    lines.push(
      'Drop them into https://gltf-viewer.donmccurdy.com/ or VSCode glTF preview for a quick visual check.',
    )
  }

  return lines.join('\n')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!args.execute) {
    console.log('=== fal Hunyuan3D v3.1 Pro probe (DRY-RUN) ===\n')
    console.log('This script would do the following when run with --execute:\n')
    if (args.phase === 'both' || args.phase === 'geometry') {
      console.log(
        '  1. POST  fal-ai/hunyuan-3d/v3.1/pro/image-to-3d  with generate_type=Geometry',
      )
      console.log(
        `     face_count=${args.faceCount.toLocaleString()}, costs ~$0.225 (verify against fal billing)`,
      )
      console.log(
        '     Poll status until COMPLETED, then download model_glb to tmp/<timestamp>/geometry.glb',
      )
    }
    if (args.phase === 'both' || args.phase === 'normal') {
      console.log(
        '  2. POST  fal-ai/hunyuan-3d/v3.1/pro/image-to-3d  with generate_type=Normal',
      )
      console.log(
        `     face_count=${args.faceCount.toLocaleString()}, costs ~$0.375 (verify against fal billing)`,
      )
      console.log(
        '     Poll status until COMPLETED, then download model_glb to tmp/<timestamp>/normal.glb',
      )
    }
    console.log(
      '\n  3. Write markdown report to tmp/<timestamp>/report.md with timing/size comparison.',
    )
    const cost =
      args.phase === 'both' ? 0.6 : args.phase === 'geometry' ? 0.225 : 0.375
    console.log(
      `\nEstimated real-money cost: ~$${cost.toFixed(3)}  (subject to fal pricing changes)`,
    )
    console.log('\nRe-run with --execute --image <url> to actually call fal.\n')
    return
  }

  if (!args.imageUrl) {
    console.error(
      'Error: --image <url> is required with --execute (source image to feed Hunyuan3D).',
    )
    printUsage()
    process.exit(1)
  }

  const apiKey = args.apiKey ?? process.env.FAL_API_KEY ?? null
  if (!apiKey) {
    console.error(
      'Error: no fal API key found.\n' +
        '  Pass --key <fal-api-key> on the command line, or set FAL_API_KEY in .env.local.\n' +
        '  PixelVault is BYOK so .env.local typically does not include a fal key —\n' +
        '  grab one from your fal dashboard at https://fal.ai/dashboard/keys',
    )
    process.exit(1)
  }

  const startedAt = new Date()
  const stamp = startedAt
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/T/, '_')
    .replace(/Z$/, '')
  const projectRoot = resolve(import.meta.dirname, '..', '..', '..')
  const outDir = resolve(projectRoot, 'tmp', `fal-probe-${stamp}`)
  await mkdir(outDir, { recursive: true })

  console.log('=== fal Hunyuan3D v3.1 Pro probe ===')
  console.log(`Source image:  ${args.imageUrl}`)
  console.log(`Face count:    ${args.faceCount.toLocaleString()}`)
  console.log(`Output dir:    ${outDir}`)
  console.log(`Phase:         ${args.phase}`)

  const results: PhaseResult[] = []

  if (args.phase === 'both' || args.phase === 'geometry') {
    results.push(
      await runPhase({
        phase: 'geometry',
        apiKey,
        imageUrl: args.imageUrl,
        faceCount: args.faceCount,
        pollIntervalMs: args.pollIntervalMs,
        timeoutMs: args.timeoutMs,
        outDir,
      }),
    )
  }

  if (args.phase === 'both' || args.phase === 'normal') {
    results.push(
      await runPhase({
        phase: 'normal',
        apiKey,
        imageUrl: args.imageUrl,
        faceCount: args.faceCount,
        pollIntervalMs: args.pollIntervalMs,
        timeoutMs: args.timeoutMs,
        outDir,
      }),
    )
  }

  const finishedAt = new Date()
  const report = buildReport({
    imageUrl: args.imageUrl,
    faceCount: args.faceCount,
    results,
    startedAt,
    finishedAt,
  })
  const reportPath = resolve(outDir, 'report.md')
  await writeFile(reportPath, report, 'utf8')

  console.log('\n=== Done ===')
  console.log(`Report:        ${reportPath}`)
  console.log(
    '\nNext step: open the GLB files in a viewer and fill in the manual',
  )
  console.log(
    "checklist items in the report. Then come back and we'll decide PR3 scope.",
  )
}

main().catch((err) => {
  console.error('\n[probe failed]', err instanceof Error ? err.message : err)
  process.exit(1)
})
