import { describe, expect, it } from 'vitest'

import { isHuggingFaceSocialThumbnailCoverUrl } from './lora'

// 库侧封面渐进增强（2026-07-18 方案 B）：客户端只有最终封面 URL 字符串，
// 用域名前缀匹配判定"这张卡落到了 Hub 社交缩略图兜底"——服务端
// `isFallbackSocialThumbnail`（huggingface-lora.service.ts）做的是同一件
// 事的精确 repoId 等值版本，两者对同一个真实兜底 URL 结果一致。
describe('isHuggingFaceSocialThumbnailCoverUrl', () => {
  it('matches a URL under the social thumbnail base domain', () => {
    expect(
      isHuggingFaceSocialThumbnailCoverUrl(
        'https://cdn-thumbnails.huggingface.co/social-thumbnails/models/author/plain.png',
      ),
    ).toBe(true)
  })

  it('rejects a real cover URL from a different host', () => {
    expect(
      isHuggingFaceSocialThumbnailCoverUrl(
        'https://cdn-uploads.huggingface.co/production/uploads/sample.png',
      ),
    ).toBe(false)
  })

  it('rejects null and undefined without throwing', () => {
    expect(isHuggingFaceSocialThumbnailCoverUrl(null)).toBe(false)
    expect(isHuggingFaceSocialThumbnailCoverUrl(undefined)).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isHuggingFaceSocialThumbnailCoverUrl('')).toBe(false)
  })
})
