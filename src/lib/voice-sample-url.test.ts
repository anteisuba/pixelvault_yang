import { describe, expect, it } from 'vitest'

import { durableSampleUrl, isExpiringMediaUrl } from '@/lib/voice-sample-url'

describe('试听地址会不会过期', () => {
  it('Fish 的 R2 签名链接会过期；公开示例与自己的 CDN 不会', () => {
    expect(
      isExpiringMediaUrl(
        'https://acc.r2.cloudflarestorage.com/fish-platform-data/task/a.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600&X-Amz-Signature=abc',
      ),
    ).toBe(true)
    expect(
      isExpiringMediaUrl('https://platform.r2.fish.audio/task/a.mp3'),
    ).toBe(false)
    expect(
      isExpiringMediaUrl('https://cdn.anteisuba.com/generations/u/audio/a.mp3'),
    ).toBe(false)
    expect(isExpiringMediaUrl('not a url')).toBe(false)
  })

  it('durableSampleUrl：没有 / 会过期 = null，其余原样', () => {
    expect(durableSampleUrl(null)).toBeNull()
    expect(durableSampleUrl('https://x.test/a.mp3?Expires=1')).toBeNull()
    expect(durableSampleUrl('https://x.test/a.mp3')).toBe(
      'https://x.test/a.mp3',
    )
  })
})
