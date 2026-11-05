import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cancelArkTaskIfQueued,
  cancelFalQueueRequest,
  cancelReplicatePrediction,
  falCancelUrlFromStatusUrl,
  settleProviderCancel,
} from './provider-cancel'

afterEach(() => {
  vi.unstubAllGlobals()
})

type FetchCall = [string, RequestInit | undefined]

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
  )
  vi.stubGlobal('fetch', fetchMock)
  return () => fetchMock.mock.calls as unknown as FetchCall[]
}

describe('falCancelUrlFromStatusUrl', () => {
  it('带子路径的模型也换对：…/requests/<id>/status → …/cancel，去掉查询串', () => {
    expect(
      falCancelUrlFromStatusUrl(
        'https://queue.fal.run/fal-ai/flux/dev/requests/req-1/status?logs=1',
      ),
    ).toBe('https://queue.fal.run/fal-ai/flux/dev/requests/req-1/cancel')
  })

  it('认不出的地址返回 null（不乱发请求）', () => {
    expect(falCancelUrlFromStatusUrl('not a url')).toBeNull()
    expect(
      falCancelUrlFromStatusUrl('https://queue.fal.run/fal-ai/x/requests/r1'),
    ).toBeNull()
  })
})

describe('等满预算时撤服务商任务', () => {
  it('fal：PUT …/cancel，带 Key 头', async () => {
    const calls = stubFetch(() => new Response(null, { status: 202 }))
    const outcome = await cancelFalQueueRequest(
      'https://queue.fal.run/fal-ai/kling/requests/r1/status',
      'fal-key',
    )
    expect(outcome).toEqual({
      attempted: true,
      ok: true,
      detail: 'fal.ai responded 202.',
    })
    const [url, init] = calls()[0]
    expect(url).toBe('https://queue.fal.run/fal-ai/kling/requests/r1/cancel')
    expect(init).toMatchObject({
      method: 'PUT',
      headers: { Authorization: 'Key fal-key' },
    })
  })

  it('fal 已开跑撤不动（400）：如实记下，不抛', async () => {
    stubFetch(() => new Response('ALREADY_COMPLETED', { status: 400 }))
    await expect(
      cancelFalQueueRequest(
        'https://queue.fal.run/fal-ai/kling/requests/r1/status',
        'k',
      ),
    ).resolves.toMatchObject({ attempted: true, ok: false })
  })

  it('Replicate：POST /predictions/<id>/cancel', async () => {
    const calls = stubFetch(() => Response.json({ status: 'canceled' }))
    const outcome = await cancelReplicatePrediction(
      'https://api.replicate.com/v1',
      'pred-1',
      'r-key',
    )
    expect(outcome.ok).toBe(true)
    expect(calls()[0][0]).toBe(
      'https://api.replicate.com/v1/predictions/pred-1/cancel',
    )
    expect(calls()[0][1]).toMatchObject({ method: 'POST' })
  })

  it('方舟：还在 queued 才发 DELETE', async () => {
    const taskUrl =
      'https://ark.example.com/api/v3/contents/generations/tasks/t1'
    const calls = stubFetch((_url, init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 200 })
        : Response.json({ id: 't1', status: 'queued' }),
    )
    const outcome = await cancelArkTaskIfQueued(taskUrl, 'ark-key')
    expect(outcome).toMatchObject({ attempted: true, ok: true })
    expect(calls().map(([, init]) => init?.method ?? 'GET')).toEqual([
      'GET',
      'DELETE',
    ])
  })

  it.each(['running', 'succeeded', 'failed'])(
    '方舟任务 %s：⛔ 不发 DELETE（对已结束任务那是删记录，会把能认领的结果删掉）',
    async (status) => {
      const calls = stubFetch(() => Response.json({ id: 't1', status }))
      const outcome = await cancelArkTaskIfQueued(
        'https://ark.example.com/api/v3/contents/generations/tasks/t1',
        'ark-key',
      )
      expect(outcome).toMatchObject({ attempted: false, ok: false })
      expect(calls()).toHaveLength(1)
      expect(calls()[0][1]?.method).toBeUndefined()
    },
  )

  it('网络错：折成结果，不抛', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Network connection lost.')
      }),
    )
    await expect(
      cancelFalQueueRequest(
        'https://queue.fal.run/fal-ai/x/requests/r1/status',
        'k',
      ),
    ).resolves.toMatchObject({ attempted: true, ok: false })
  })

  it('settleProviderCancel：取消函数自己炸了（比如解密 key 失败）也只记结果', async () => {
    await expect(
      settleProviderCancel(async () => {
        throw new Error('bad key')
      }),
    ).resolves.toEqual({
      attempted: false,
      ok: false,
      detail: 'Cancel was not sent: bad key',
    })
  })
})
