import { beforeEach, describe, expect, it, vi } from 'vitest'

// DNS 一律走 mock：这些用例不许发真实网络请求，而 safeFetch 现在会在每一跳
// 之前解析 hostname。
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }))
// ⚠ `default` 必须一起给：`node:dns` 是 CJS 内置模块，被测源码里的
// `import { promises as dns }` 经 vite 的 CJS interop 后读的是 default 上的
// 那份。只返回具名 `promises` 时源码拿到 undefined；把真实模块塞进 default
// （`importOriginal`）则会静默走真实 DNS——两种写法都曾在这里踩过。
vi.mock('node:dns', () => {
  const mocked = { promises: { lookup: lookupMock } }
  return { ...mocked, default: mocked }
})

import { assertSafeUrl, isSafeUrl, safeFetch } from './url-guard'

/** 一条无害的公网解析结果，用作 safeFetch 用例的默认答案。 */
const PUBLIC_LOOKUP = [{ address: '93.184.216.34', family: 4 }]

describe('url-guard', () => {
  describe('valid public URLs', () => {
    it.each([
      'https://example.com/image.png',
      'https://cdn.r2.cloudflarestorage.com/x/y.png',
      'https://huggingface.co/api/foo',
      'https://1.1.1.1/test',
    ])('accepts %s', (url) => {
      expect(() => assertSafeUrl(url)).not.toThrow()
      expect(isSafeUrl(url)).toBe(true)
    })
  })

  describe('protocol guards', () => {
    it('rejects http:// by default', () => {
      expect(() => assertSafeUrl('http://example.com')).toThrow(/protocol/i)
    })
    it('rejects file://', () => {
      expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(/protocol/i)
    })
    it('rejects ftp://', () => {
      expect(() => assertSafeUrl('ftp://example.com')).toThrow(/protocol/i)
    })
    it('rejects gopher://', () => {
      expect(() => assertSafeUrl('gopher://evil.com')).toThrow(/protocol/i)
    })
    it('allows http:// when explicitly opted in', () => {
      expect(() =>
        assertSafeUrl('http://example.com', {
          allowedProtocols: ['http:', 'https:'],
        }),
      ).not.toThrow()
    })
  })

  describe('blocked hostnames', () => {
    it.each([
      'https://localhost/x',
      'https://localhost.localdomain/x',
      'https://metadata.google.internal/computeMetadata/v1/',
    ])('rejects %s', (url) => {
      expect(() => assertSafeUrl(url)).toThrow(/blocked/i)
    })
  })

  describe('private IPv4', () => {
    it.each([
      'https://127.0.0.1/admin',
      'https://10.0.0.5/admin',
      'https://172.16.0.1/x',
      'https://172.31.255.255/x',
      'https://192.168.1.1/router',
      'https://169.254.169.254/latest/meta-data/',
      'https://0.0.0.0/x',
    ])('rejects %s', (url) => {
      expect(() => assertSafeUrl(url)).toThrow(/private/i)
    })
    it('allows 172.32.x (outside RFC 1918)', () => {
      expect(() => assertSafeUrl('https://172.32.0.1/x')).not.toThrow()
    })
  })

  describe('private IPv6', () => {
    it.each([
      'https://[::1]/',
      'https://[fc00::1]/',
      'https://[fd12:3456:789a::1]/',
      'https://[fe80::1]/',
    ])('rejects %s', (url) => {
      expect(() => assertSafeUrl(url)).toThrow(/private/i)
    })
  })

  describe('malformed input', () => {
    it.each(['not a url', '', 'http:/badhost', 'javascript:alert(1)'])(
      'rejects %s',
      (url) => {
        expect(() => assertSafeUrl(url)).toThrow()
      },
    )
  })

  describe('safeFetch', () => {
    beforeEach(() => {
      lookupMock.mockReset()
      lookupMock.mockResolvedValue(PUBLIC_LOOKUP)
    })

    it('follows safe redirects after validating each hop', async () => {
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: 'https://cdn.example.com/image.png' },
          }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      const response = await safeFetch('https://example.com/redirect')

      expect(response.status).toBe(200)
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://example.com/redirect',
        expect.objectContaining({ redirect: 'manual' }),
      )
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://cdn.example.com/image.png',
        expect.objectContaining({ redirect: 'manual' }),
      )
      fetchMock.mockRestore()
    })

    it('rejects redirects to private IP targets before fetching them', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/admin' },
        }),
      )

      await expect(safeFetch('https://example.com/redirect')).rejects.toThrow(
        /private IPv4/,
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      fetchMock.mockRestore()
    })

    // 真实故障（2026-08-29）：Civitai 的 /api/download/models/:id 307 到一个
    // AWS SigV4 预签名的 R2 链接。第二跳带上 Authorization，R2 就改走 header
    // 签名并返 400 Missing x-amz-content-sha256——配了 Civitai token 反而让
    // 每次 LoRA 缓存都失败。凭据只能留在首跳的源上。
    it('drops credential headers when a redirect leaves the origin', async () => {
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(null, {
            status: 307,
            headers: { location: 'https://cdn.example.com/signed?sig=abc' },
          }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      await safeFetch('https://example.com/download', {
        headers: { Authorization: 'Bearer secret', Accept: 'application/json' },
      })

      const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit
      const forwarded = new Headers(secondInit.headers)
      expect(forwarded.get('authorization')).toBeNull()
      // 非凭据头照常跟着走——摘的是凭据，不是整份 header。
      expect(forwarded.get('accept')).toBe('application/json')
      fetchMock.mockRestore()
    })

    it('keeps credential headers on a same-origin redirect', async () => {
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: 'https://example.com/download/final' },
          }),
        )
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      await safeFetch('https://example.com/download', {
        headers: { Authorization: 'Bearer secret' },
      })

      const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit
      expect(new Headers(secondInit.headers).get('authorization')).toBe(
        'Bearer secret',
      )
      fetchMock.mockRestore()
    })
  })

  // DNS rebinding：hostname 是个合法域名，assertSafeUrl 无从判断，只有解析后
  // 才看得见它指向内网。safeFetch 必须在发请求之前自己解析并校验。
  describe('safeFetch DNS resolution guard', () => {
    beforeEach(() => {
      lookupMock.mockReset()
    })

    it.each([
      ['127.0.0.1', 4, /private IPv4/],
      ['169.254.169.254', 4, /private IPv4/],
      ['10.1.2.3', 4, /private IPv4/],
      ['::1', 6, /private IPv6/],
      ['fd00::1', 6, /private IPv6/],
    ])(
      'rejects a hostname that resolves to %s without fetching it',
      async (address, family, expected) => {
        lookupMock.mockResolvedValue([{ address, family }])
        const fetchMock = vi.spyOn(global, 'fetch')

        await expect(safeFetch('https://rebind.example.com/x')).rejects.toThrow(
          expected,
        )
        expect(fetchMock).not.toHaveBeenCalled()
        fetchMock.mockRestore()
      },
    )

    it('rejects when any one of several resolved addresses is private', async () => {
      lookupMock.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ])
      const fetchMock = vi.spyOn(global, 'fetch')

      await expect(safeFetch('https://rebind.example.com/x')).rejects.toThrow(
        /private IPv4/,
      )
      expect(fetchMock).not.toHaveBeenCalled()
      fetchMock.mockRestore()
    })

    it('allows a hostname that resolves to public addresses', async () => {
      lookupMock.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ])
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      const response = await safeFetch('https://example.com/image.png')

      expect(response.status).toBe(200)
      expect(lookupMock).toHaveBeenCalledWith('example.com', { all: true })
      fetchMock.mockRestore()
    })

    it('validates the resolved address of every redirect hop', async () => {
      lookupMock
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
        .mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }])
      const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://rebind.example.com/admin' },
        }),
      )

      await expect(safeFetch('https://example.com/redirect')).rejects.toThrow(
        /private IPv4/,
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
      fetchMock.mockRestore()
    })

    it('rejects when DNS resolution fails or returns nothing', async () => {
      lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'))
      await expect(safeFetch('https://nope.example.com/x')).rejects.toThrow(
        /DNS resolution failed/,
      )

      lookupMock.mockResolvedValueOnce([])
      await expect(safeFetch('https://empty.example.com/x')).rejects.toThrow(
        /DNS resolution failed/,
      )
    })

    it('skips DNS resolution for IP literals', async () => {
      const fetchMock = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('ok', { status: 200 }))

      await safeFetch('https://1.1.1.1/test')

      expect(lookupMock).not.toHaveBeenCalled()
      fetchMock.mockRestore()
    })
  })
})
