const DEFAULT_BASE_URL = 'http://localhost:3000'

type SmokeCheck = {
  path: string
  label: string
  allowRedirect: boolean
  isExpectedStatus: (status: number) => boolean
}

const baseUrl = process.env.BASE_URL ?? DEFAULT_BASE_URL

const checks: SmokeCheck[] = [
  {
    path: '/api/health',
    label: 'health',
    allowRedirect: false,
    isExpectedStatus: (status) => status === 200,
  },
  {
    path: '/',
    label: 'home',
    allowRedirect: true,
    isExpectedStatus: (status) => status === 200,
  },
  {
    path: '/gallery',
    label: 'gallery',
    allowRedirect: false,
    isExpectedStatus: (status) => status === 200 || isRedirectStatus(status),
  },
  {
    path: '/studio',
    label: 'studio',
    allowRedirect: false,
    isExpectedStatus: (status) => status === 200 || isRedirectStatus(status),
  },
]

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400
}

function buildUrl(path: string): string {
  return new URL(path, baseUrl).toString()
}

async function runCheck(check: SmokeCheck): Promise<void> {
  const url = buildUrl(check.path)
  const response = await fetch(url, {
    method: 'GET',
    redirect: check.allowRedirect ? 'follow' : 'manual',
  })

  if (!check.isExpectedStatus(response.status)) {
    throw new Error(
      `${check.label} failed: ${url} returned HTTP ${response.status}`,
    )
  }

  console.log(`${check.label}: ${response.status} ${url}`)
}

async function main(): Promise<void> {
  console.log(`Running smoke checks against ${baseUrl}`)

  for (const check of checks) {
    await runCheck(check)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})

export {}
