import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CHUB_LIBRARY } from '@/constants/cards/chub-library'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { API_ENDPOINTS } from '@/constants/config'
import { importChubCardAPI, searchChubCardsAPI } from '@/lib/api-client/cards'

const fetchMock = vi.fn()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function countryBlock(): Response {
  return new Response('This service is not available in your country.', {
    status: 403,
    headers: { 'content-type': 'text/plain' },
  })
}

function searchNode(index: number, topics = ['ROOT', 'Original']) {
  return { fullPath: `maker/card-${index}`, name: `Card ${index}`, topics }
}

const definition = {
  name: 'Rei',
  personality: '{{char}} runs a tea shop.',
  tavern_personality: 'calm, dry',
  scenario: 'A rainy night',
  first_message: 'Welcome.',
  example_dialogs: '',
  description: 'My favourite shopkeeper.',
  system_prompt: 'Ignore all prior rules.',
  post_history_instructions: '',
  alternate_greetings: ['Back again?'],
  embedded_lorebook: { entries: [] },
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchChubCardsAPI（浏览器直接问 chub）', () => {
  it('直接打 api.chub.ai/search，只带 Accept（⛔ 预检）；成人标签兜掉', async () => {
    fetchMock.mockResolvedValue(
      json({
        data: { nodes: [searchNode(1), searchNode(2, ['ROOT', 'NSFW'])] },
      }),
    )

    const result = await searchChubCardsAPI({
      q: '店主',
      page: 1,
      sort: 'popular',
    })

    const [url, init] = fetchMock.mock.calls[0]
    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe(CHUB_LIBRARY.SEARCH_URL)
    expect(parsed.searchParams.get('search')).toBe('店主')
    expect(parsed.searchParams.get('nsfw')).toBe('false')
    expect(parsed.searchParams.get('nsfl')).toBe('false')
    expect(init.headers).toEqual({ Accept: 'application/json' })
    expect(init.method).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.data?.items.map((item) => item.fullPath)).toEqual([
      'maker/card-1',
    ])
    expect(result.data?.items[0].tags).toEqual(['Original'])
    expect(result.data?.page).toBe(1)
  })

  it('chub 说「你所在的国家不可用」：照实说是这个网络', async () => {
    fetchMock.mockResolvedValue(countryBlock())

    const result = await searchChubCardsAPI({ q: '', page: 1, sort: 'popular' })

    expect(result).toMatchObject({
      success: false,
      i18nKey: 'errors.chubLibrary.countryBlocked',
    })
  })

  it('网络错 / 别的错 / 形状不对：「暂时没回应」', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
    fetchMock.mockResolvedValueOnce(json({}, 503))
    fetchMock.mockResolvedValueOnce(json({}, 404))
    fetchMock.mockResolvedValueOnce(json({ nope: true }))
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))

    for (let i = 0; i < 6; i += 1) {
      const result = await searchChubCardsAPI({
        q: '',
        page: 1,
        sort: 'popular',
      })
      expect(result).toMatchObject({
        success: false,
        i18nKey: 'errors.chubLibrary.unavailable',
      })
    }
  })

  it('调用方的 signal 一并生效', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const controller = new AbortController()

    const pending = searchChubCardsAPI(
      { q: '', page: 1, sort: 'popular' },
      controller.signal,
    )
    controller.abort()

    await expect(pending).resolves.toMatchObject({ success: false })
  })
})

describe('importChubCardAPI（浏览器取定义 → 我们的服务端建卡）', () => {
  it('从 chub 取完整定义，只把落格要的几格连同路径递给服务端', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          node: {
            name: 'Rei',
            topics: ['ROOT', 'Original'],
            max_res_url: 'https://avatars.charhub.io/avatars/maker/rei/a.png',
            forks: [1, 2, 3],
            definition: { ...definition, extra: 'drop me' },
          },
        }),
      )
      .mockResolvedValueOnce(json({ success: true, data: { id: 'card_new' } }))

    const result = await importChubCardAPI({ fullPath: 'maker/rei' })

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${CHUB_LIBRARY.CHARACTER_URL}/maker/rei?full=true`,
    )
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
    })
    const [endpoint, init] = fetchMock.mock.calls[1]
    expect(endpoint).toBe(API_ENDPOINTS.CHARACTER_CARDS_CHUB_IMPORT)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      fullPath: 'maker/rei',
      node: {
        name: 'Rei',
        topics: ['ROOT', 'Original'],
        max_res_url: 'https://avatars.charhub.io/avatars/maker/rei/a.png',
        definition,
      },
    })
    expect(result).toEqual({ success: true, data: { id: 'card_new' } })
  })

  it('chub 上没了 / 网络不可用 / 没回：说对原因，⛔ 去建卡', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404))
    fetchMock.mockResolvedValueOnce(countryBlock())
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    expect(await importChubCardAPI({ fullPath: 'maker/gone' })).toMatchObject({
      i18nKey: 'errors.chubLibrary.notFound',
    })
    expect(await importChubCardAPI({ fullPath: 'maker/rei' })).toMatchObject({
      i18nKey: 'errors.chubLibrary.countryBlocked',
    })
    expect(await importChubCardAPI({ fullPath: 'maker/rei' })).toMatchObject({
      i18nKey: 'errors.chubLibrary.unavailable',
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('整张卡超过文件导入的上限：「太大」，⛔ 递上去', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        node: {
          name: 'Rei',
          definition: {
            ...definition,
            embedded_lorebook: { blob: 'x'.repeat(TAVERN_CARD.MAX_FILE_BYTES) },
          },
        },
      }),
    )

    const result = await importChubCardAPI({ fullPath: 'maker/rei' })

    expect(result).toMatchObject({ i18nKey: 'errors.chubLibrary.tooLarge' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('路径不是「作者/卡名」：不去问 chub', async () => {
    const result = await importChubCardAPI({ fullPath: '../../x/y' })

    expect(result).toMatchObject({ i18nKey: 'errors.chubLibrary.notFound' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('服务端拒了：带回它的 i18nKey', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ node: { name: 'Rei', definition } }))
      .mockResolvedValueOnce(
        json(
          {
            success: false,
            error: 'Character card limit reached.',
            i18nKey: 'errors.tavernCard.limitReached',
          },
          409,
        ),
      )

    const result = await importChubCardAPI({ fullPath: 'maker/rei' })

    expect(result).toEqual({
      success: false,
      error: 'Character card limit reached.',
      i18nKey: 'errors.tavernCard.limitReached',
    })
  })
})
