import { describe, expect, it } from 'vitest'
import { assertSafeUrl, isSafeUrl, safeFetch } from './url-guard'

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
})
