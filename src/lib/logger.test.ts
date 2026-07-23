import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('logger sensitive-data boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LOG_LEVEL', 'debug')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('redacts sensitive keys and signed URL query values recursively', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { logger } = await import('./logger')

    logger.info('provider request', {
      apiKey: 'sk-live-secret',
      nested: {
        authorization: 'Bearer provider-token',
        assetUrl:
          'https://cdn.example.test/file.png?token=civitai-secret&width=1024',
      },
      modelId: 'gpt-image-2',
    })

    const entry = JSON.parse(String(output.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >

    expect(JSON.stringify(entry)).not.toContain('sk-live-secret')
    expect(JSON.stringify(entry)).not.toContain('provider-token')
    expect(JSON.stringify(entry)).not.toContain('civitai-secret')
    expect(entry.apiKey).toBe('[REDACTED]')
    expect(entry.modelId).toBe('gpt-image-2')
    expect(entry.nested).toEqual({
      authorization: '[REDACTED]',
      assetUrl: 'https://cdn.example.test/file.png?[REDACTED]',
    })
  })

  it('redacts token-shaped strings inside Error messages', async () => {
    const output = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const { logger } = await import('./logger')

    logger.error('provider failed', {
      error: new Error(
        'Request failed for https://api.example.test/run?X-Amz-Signature=abc123 with Bearer bearer-secret',
      ),
    })

    const serialized = String(output.mock.calls[0]?.[0])
    expect(serialized).not.toContain('abc123')
    expect(serialized).not.toContain('bearer-secret')
    expect(serialized).toContain('provider failed')
  })

  it('applies the same redaction to child logger defaults', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { logger } = await import('./logger')

    logger
      .child({ userId: 'user-1', cookie: 'session=secret-session' })
      .info('child event', { requestCount: 1 })

    const entry = JSON.parse(String(output.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >
    expect(entry.userId).toBe('user-1')
    expect(entry.cookie).toBe('[REDACTED]')
    expect(entry.requestCount).toBe(1)
  })

  it('never records raw prompts or provider payload bodies', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { logger } = await import('./logger')

    logger.info('provider validation failed', {
      prompt: 'private portrait prompt',
      rawOutput: 'private model response',
      body: { input: 'private provider body' },
      bodyKeys: ['input', 'model'],
    })

    const entry = JSON.parse(String(output.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >
    expect(entry.prompt).toBe('[REDACTED]')
    expect(entry.rawOutput).toBe('[REDACTED]')
    expect(entry.body).toBe('[REDACTED]')
    expect(entry.bodyKeys).toEqual(['input', 'model'])
  })
})
