import { describe, expect, it } from 'vitest'
import { assertSafeUrl, isSafeUrl } from './url-guard'

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
})
