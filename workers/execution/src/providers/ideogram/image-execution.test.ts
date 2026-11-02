import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ImageQueueWorkflow,
  parseImageRunContext,
  pollIdeogramImageQueue,
  submitIdeogramImageQueue,
} from '../../index'

afterEach(() => vi.unstubAllGlobals())

function context() {
  return parseImageRunContext({
    runId: 'job',
    workflowId: 'IMAGE_QUEUE',
    providerId: 'ideogram',
    apiKeyId: 'key',
    callbackUrl: 'https://app.example/callback',
    resolveKeyUrl: 'https://app.example/key',
    timeoutMs: 600000,
    maxAttempts: 3,
    pollIntervalMs: 3000,
    providerInput: {
      prompt: 'Make it blue',
      modelId: 'ideogram-4.5',
      externalModelId: 'ideogram-4-5',
      aspectRatio: '1:1',
      imageOperation: 'precise-edit',
      referenceImages: [
        'https://cdn.example/source.png',
        'https://cdn.example/reference.png',
      ],
      advancedParams: { inpaintMask: 'https://cdn.example/mask.png' },
      outputStorageKey: 'image/result.png',
    },
  })!
}

describe('Ideogram queued execution', () => {
  it('streams multipart fields from owned storage and reports the provider ID', async () => {
    const input = context()
    expect(input.providerInput.imageOperation).toBe('precise-edit')
    let body = ''
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === input.callbackUrl) return Response.json({ success: true })
      body = await new Response(init.body).text()
      expect(init.headers).toMatchObject({ 'Api-Key': 'secret' })
      return Response.json({ generation_id: 'native-job' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const get = vi.fn(async () => ({
      body: new Response('pixels').body,
      size: 6,
      httpMetadata: { contentType: 'image/png' },
    }))
    const env = {
      R2_PUBLIC_URL: 'https://cdn.example',
      INTERNAL_CALLBACK_SECRET: 'sign',
      GENERATION_BUCKET: { get },
    } as unknown as Parameters<typeof submitIdeogramImageQueue>[0]
    expect(await submitIdeogramImageQueue(env, input, 'secret')).toBe(
      'native-job',
    )
    expect(get.mock.calls).toEqual([
      ['source.png'],
      ['reference.png'],
      ['mask.png'],
    ])
    expect(body).toContain('name="image"')
    expect(body).toContain('name="reference_images"')
    expect(body).toContain('name="mask"')
    expect(body).toContain('name="async"\r\n\r\ntrue')
    expect(body).not.toContain('name="size"')
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1].body)).data.providerJobId,
    ).toBe('native-job')
  })
  it('honors retry-after and does not turn rate limiting into a terminal image failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('', { status: 429, headers: { 'Retry-After': '7' } }),
        ),
    )
    expect(await pollIdeogramImageQueue('native-job', 'key')).toEqual({
      status: 'pending',
      retryAfterMs: 7000,
    })
  })
  it('disables paid submit retries and persists the completion before callback', async () => {
    const input = context()
    input.providerInput.referenceImages = undefined
    input.providerInput.advancedParams = undefined
    input.providerInput.imageOperation = undefined
    const put = vi.fn()
    let poll = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url === input.resolveKeyUrl)
        return Response.json({ success: true, data: { apiKey: 'secret' } })
      if (url === input.callbackUrl) return Response.json({ success: true })
      if (url.includes('/image/generate/'))
        return Response.json({ generation_id: 'native-job' })
      if (url.includes('/generations/')) {
        poll += 1
        return poll === 1
          ? new Response('', { status: 429, headers: { 'Retry-After': '7' } })
          : Response.json({
              status: 'completed',
              data: [
                {
                  url: 'https://ideogram.ai/output.png',
                  resolution: '1024x1024',
                  is_image_safe: true,
                },
              ],
            })
      }
      if (url === 'https://ideogram.ai/output.png')
        return new Response('output', {
          headers: { 'Content-Type': 'image/png' },
        })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    class Workflow extends ImageQueueWorkflow {
      configure(env: unknown) {
        this.env = env as never
      }
    }
    const workflow = new Workflow()
    workflow.configure({
      INTERNAL_CALLBACK_SECRET: 'sign',
      STATE_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
      R2_PUBLIC_URL: 'https://cdn.example',
      GENERATION_BUCKET: { put },
    })
    const step = {
      do: vi.fn(async (_name: string, ...args: unknown[]) =>
        (args.at(-1) as () => Promise<unknown>)(),
      ),
      sleep: vi.fn(),
    }
    expect(
      await workflow.run({ payload: input } as never, step as never),
    ).toMatchObject({ status: 'COMPLETED' })
    expect(step.do).toHaveBeenCalledWith(
      'submit-ideogram-image',
      expect.objectContaining({
        retries: expect.objectContaining({ limit: 0 }),
      }),
      expect.any(Function),
    )
    expect(step.sleep).toHaveBeenCalledWith('wait-ideogram-image-2', 7000)
    expect(put).toHaveBeenCalledWith(
      'image/result.png',
      expect.any(ArrayBuffer),
      expect.objectContaining({
        httpMetadata: expect.objectContaining({
          cacheControl: 'public, max-age=31536000, immutable',
        }),
      }),
    )
    const callbacks = fetchMock.mock.calls.filter(
      ([url]) => url === input.callbackUrl,
    )
    expect(callbacks).toHaveLength(2)
  })
})
