/**
 * Provider Smoke Test Script
 *
 * Tests each AI provider's image generation with minimal parameters.
 * Does NOT hit the database or require the Next.js server — calls provider APIs directly.
 *
 * Usage:
 *   npx tsx scripts/smoke-test-providers.ts                    # Test all image providers
 *   npx tsx scripts/smoke-test-providers.ts --provider fal     # Test only FAL
 *   npx tsx scripts/smoke-test-providers.ts --type video       # Test only video providers
 *   npx tsx scripts/smoke-test-providers.ts --health-only      # Only run healthCheck, no generation
 *   npx tsx scripts/smoke-test-providers.ts --dry-run          # Show what would be tested
 *
 * Environment:
 *   Reads API keys from .env.local (same as the Next.js app).
 *   Missing keys are reported as SKIPPED, not FAILED.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local from project root
config({ path: resolve(import.meta.dirname, '..', '.env.local') })

// ─── Types ──────────────────────────────────────────────────────

interface ProviderTest {
  provider: string
  model: string
  outputType: 'image' | 'video' | 'audio'
  envKey: string
  baseUrl: string
  externalModelId: string
  /** Whether the model requires a reference image (skip if true) */
  requiresRef?: boolean
}

interface TestResult {
  provider: string
  model: string
  outputType: string
  status: 'PASS' | 'FAIL' | 'SKIP' | 'HEALTH_OK' | 'HEALTH_FAIL'
  latencyMs: number
  error?: string
}

// ─── Test Matrix ────────────────────────────────────────────────
// One cheap model per provider, smallest resolution, simplest prompt

const SMOKE_TESTS: ProviderTest[] = [
  // Image providers
  {
    provider: 'huggingface',
    model: 'sdxl',
    outputType: 'image',
    envKey: 'HF_API_TOKEN',
    baseUrl: 'https://router.huggingface.co/hf-inference/models',
    externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-flash-image-preview',
    outputType: 'image',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    externalModelId: 'gemini-3.1-flash-preview-image',
  },
  {
    provider: 'openai',
    model: 'gpt-image-1.5',
    outputType: 'image',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1/images',
    externalModelId: 'gpt-image-1',
  },
  {
    provider: 'fal',
    model: 'flux-2-schnell',
    outputType: 'image',
    envKey: 'FAL_API_KEY',
    baseUrl: 'https://fal.run',
    externalModelId: 'fal-ai/flux/schnell',
  },
  {
    provider: 'replicate',
    model: 'flux-2-schnell',
    outputType: 'image',
    envKey: 'REPLICATE_API_TOKEN',
    baseUrl: 'https://api.replicate.com/v1',
    externalModelId: 'black-forest-labs/flux-schnell',
  },
  {
    provider: 'novelai',
    model: 'nai-diffusion-3',
    outputType: 'image',
    envKey: 'NOVELAI_API_TOKEN',
    baseUrl: 'https://image.novelai.net',
    externalModelId: 'nai-diffusion-3',
  },
  {
    provider: 'volcengine',
    model: 'seedream-3.0',
    outputType: 'image',
    envKey: 'VOLCENGINE_API_KEY',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    externalModelId: 'seedream-3.0',
  },
  // Video providers (health check only — actual generation is expensive)
  {
    provider: 'fal',
    model: 'wan-video',
    outputType: 'video',
    envKey: 'FAL_API_KEY',
    baseUrl: 'https://fal.run',
    externalModelId: 'fal-ai/wan/v2.1/1.3b',
  },
]

// ─── Health Check (lightweight, no generation) ──────────────────

async function runHealthCheck(
  test: ProviderTest,
  apiKey: string,
): Promise<TestResult> {
  const start = Date.now()
  const timeoutMs = 10_000

  try {
    let url: string
    let headers: Record<string, string>
    let method = 'GET'

    switch (test.provider) {
      case 'huggingface':
        url = `${test.baseUrl}/${test.externalModelId}`
        headers = { Authorization: `Bearer ${apiKey}` }
        method = 'HEAD'
        break
      case 'gemini':
        url = `${test.baseUrl}/${test.externalModelId}`
        headers = { 'x-goog-api-key': apiKey }
        break
      case 'openai':
        url = 'https://api.openai.com/v1/models'
        headers = { Authorization: `Bearer ${apiKey}` }
        break
      case 'fal':
        url = `${test.baseUrl}/${test.externalModelId}`
        headers = { Authorization: `Key ${apiKey}` }
        method = 'HEAD'
        break
      case 'replicate': {
        const [owner, name] = test.externalModelId.split('/')
        url = `${test.baseUrl}/models/${owner}/${name}`
        headers = { Authorization: `Bearer ${apiKey}` }
        break
      }
      case 'novelai':
        url = 'https://api.novelai.net/user/subscription'
        headers = { Authorization: `Bearer ${apiKey}` }
        break
      case 'volcengine':
        url = `${test.baseUrl}/models`
        headers = { Authorization: `Bearer ${apiKey}` }
        break
      default:
        return {
          provider: test.provider,
          model: test.model,
          outputType: test.outputType,
          status: 'SKIP',
          latencyMs: 0,
          error: 'No health check defined',
        }
    }

    const response = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })

    const latencyMs = Date.now() - start
    // FAL returns 405/422 for HEAD on valid endpoints
    const ok = response.ok || response.status === 405 || response.status === 422

    return {
      provider: test.provider,
      model: test.model,
      outputType: test.outputType,
      status: ok ? 'HEALTH_OK' : 'HEALTH_FAIL',
      latencyMs,
      error: ok ? undefined : `HTTP ${response.status}`,
    }
  } catch (err) {
    return {
      provider: test.provider,
      model: test.model,
      outputType: test.outputType,
      status: 'HEALTH_FAIL',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Image Generation Test (actual API call) ────────────────────

async function runImageGeneration(
  test: ProviderTest,
  apiKey: string,
): Promise<TestResult> {
  const start = Date.now()
  const prompt = 'A simple red circle on white background'
  const timeoutMs = 60_000

  try {
    let imageUrl: string | undefined

    switch (test.provider) {
      case 'huggingface': {
        const response = await fetch(
          `${test.baseUrl}/${test.externalModelId}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: { width: 512, height: 512 },
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        )
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
        }
        // HuggingFace returns raw image bytes
        const buffer = await response.arrayBuffer()
        imageUrl = buffer.byteLength > 100 ? '[raw bytes received]' : undefined
        break
      }

      case 'gemini': {
        const response = await fetch(
          `${test.baseUrl}/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        )
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
        }
        const data = await response.json()
        const parts = data?.candidates?.[0]?.content?.parts
        const imgPart = parts?.find(
          (p: { inlineData?: unknown }) => p.inlineData,
        )
        imageUrl = imgPart ? '[inline base64 received]' : undefined
        break
      }

      case 'openai': {
        const response = await fetch(`${test.baseUrl}/generations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-image-1',
            prompt,
            n: 1,
            size: '1024x1024',
            quality: 'low',
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
        }
        const data = await response.json()
        imageUrl =
          data?.data?.[0]?.url || data?.data?.[0]?.b64_json
            ? '[image received]'
            : undefined
        break
      }

      case 'fal': {
        const response = await fetch(
          `https://fal.run/${test.externalModelId}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Key ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt,
              image_size: { width: 512, height: 512 },
              num_images: 1,
            }),
            signal: AbortSignal.timeout(timeoutMs),
          },
        )
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
        }
        const data = await response.json()
        imageUrl = data?.images?.[0]?.url
        break
      }

      case 'replicate': {
        // Replicate uses prediction API
        const response = await fetch(`${test.baseUrl}/predictions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Prefer: 'wait=60',
          },
          body: JSON.stringify({
            model: test.externalModelId,
            input: { prompt, go_fast: true },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) {
          const body = await response.text()
          throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)
        }
        const data = await response.json()
        imageUrl =
          data?.status === 'succeeded'
            ? data?.output?.[0] || data?.output
            : `[status: ${data?.status}]`
        break
      }

      default:
        return {
          provider: test.provider,
          model: test.model,
          outputType: test.outputType,
          status: 'SKIP',
          latencyMs: 0,
          error: 'Generation test not implemented for this provider',
        }
    }

    const latencyMs = Date.now() - start

    if (!imageUrl) {
      return {
        provider: test.provider,
        model: test.model,
        outputType: test.outputType,
        status: 'FAIL',
        latencyMs,
        error: 'No image data in response',
      }
    }

    return {
      provider: test.provider,
      model: test.model,
      outputType: test.outputType,
      status: 'PASS',
      latencyMs,
    }
  } catch (err) {
    return {
      provider: test.provider,
      model: test.model,
      outputType: test.outputType,
      status: 'FAIL',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── CLI ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    provider: null as string | null,
    type: null as string | null,
    healthOnly: false,
    dryRun: false,
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--provider':
        flags.provider = args[++i] ?? null
        break
      case '--type':
        flags.type = args[++i] ?? null
        break
      case '--health-only':
        flags.healthOnly = true
        break
      case '--dry-run':
        flags.dryRun = true
        break
    }
  }

  return flags
}

function formatTable(results: TestResult[]) {
  const cols = {
    provider: 10,
    model: 30,
    type: 6,
    status: 12,
    latency: 10,
    error: 50,
  }

  const header = [
    'Provider'.padEnd(cols.provider),
    'Model'.padEnd(cols.model),
    'Type'.padEnd(cols.type),
    'Status'.padEnd(cols.status),
    'Latency'.padEnd(cols.latency),
    'Error',
  ].join(' | ')

  const divider = '-'.repeat(header.length)

  console.log('\n' + divider)
  console.log(header)
  console.log(divider)

  for (const r of results) {
    console.log(
      [
        r.provider.padEnd(cols.provider),
        r.model.padEnd(cols.model),
        r.outputType.padEnd(cols.type),
        (r.status === 'HEALTH_OK' ? 'HEALTH OK' : r.status).padEnd(cols.status),
        r.latencyMs > 0
          ? `${r.latencyMs}ms`.padEnd(cols.latency)
          : '-'.padEnd(cols.latency),
        r.error?.slice(0, cols.error) ?? '',
      ].join(' | '),
    )
  }

  console.log(divider)

  const passed = results.filter(
    (r) => r.status === 'PASS' || r.status === 'HEALTH_OK',
  ).length
  const failed = results.filter(
    (r) => r.status === 'FAIL' || r.status === 'HEALTH_FAIL',
  ).length
  const skipped = results.filter((r) => r.status === 'SKIP').length

  console.log(
    `\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`,
  )

  if (failed > 0) {
    process.exitCode = 1
  }
}

async function main() {
  const flags = parseArgs()

  let tests = SMOKE_TESTS

  if (flags.provider) {
    tests = tests.filter((t) => t.provider === flags.provider)
  }
  if (flags.type) {
    tests = tests.filter((t) => t.outputType === flags.type)
  }

  if (tests.length === 0) {
    console.log('No tests match the given filters.')
    return
  }

  console.log(
    `\nProvider Smoke Test — ${flags.healthOnly ? 'Health Check' : 'Generation Test'}`,
  )
  console.log(`Testing ${tests.length} provider(s)...\n`)

  if (flags.dryRun) {
    for (const t of tests) {
      const hasKey = !!process.env[t.envKey]
      console.log(
        `  ${t.provider}/${t.model} (${t.outputType}) — key ${t.envKey}: ${hasKey ? 'SET' : 'MISSING'}`,
      )
    }
    return
  }

  const results: TestResult[] = []

  for (const test of tests) {
    const apiKey = process.env[test.envKey]

    if (!apiKey) {
      results.push({
        provider: test.provider,
        model: test.model,
        outputType: test.outputType,
        status: 'SKIP',
        latencyMs: 0,
        error: `Missing env: ${test.envKey}`,
      })
      continue
    }

    process.stdout.write(`  Testing ${test.provider}/${test.model}...`)

    if (flags.healthOnly || test.outputType === 'video') {
      const result = await runHealthCheck(test, apiKey)
      results.push(result)
    } else {
      const result = await runImageGeneration(test, apiKey)
      results.push(result)
    }

    const last = results[results.length - 1]
    console.log(
      ` ${last.status === 'PASS' || last.status === 'HEALTH_OK' ? 'OK' : last.status} (${last.latencyMs}ms)`,
    )
  }

  formatTable(results)
}

main()
