import { describe, expect, it } from 'vitest'

import {
  isWebImageSourceUsableAsInput,
  judgeWebImageSource,
  WEB_IMAGE_SOURCE_VERDICT_IDS,
} from '@/constants/web-image-sources'

/**
 * 来源判定表（切片 3b）。
 *
 * ⚠ 这里钉的是**匹配规则**，不是名单本身：名单会长，而「子域算不算」「近似域名
 * 会不会误伤」「取不到域名怎么办」这三条一旦写错，表现分别是——整站漏判、
 * 无辜的站被关掉按钮、以及一行候选的按钮莫名其妙全灰。
 */
describe('judgeWebImageSource', () => {
  it('黑名单命中子域与任意 TLD（`pinterest.*` 的那一档）', () => {
    for (const host of [
      'artstation.com',
      'www.artstation.com',
      'cdna.artstation.com',
      'pinterest.com',
      'de.pinterest.co.uk',
      'pin.it',
    ]) {
      expect(judgeWebImageSource(host)).toBe(
        WEB_IMAGE_SOURCE_VERDICT_IDS.blocked,
      )
    }
  })

  it('⛔ 不按子串匹配：长得像的域名不该被误伤', () => {
    // `includes('pinterest')` 会把这两个一起关掉，而它们与 Pinterest 无关。
    expect(judgeWebImageSource('notpinterest.com')).toBe(
      WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense,
    )
    expect(judgeWebImageSource('myartstation.com')).toBe(
      WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense,
    )
  })

  it('白名单是官方/自由许可那几个，其余一律未知（⛔ 未知不等于不可用）', () => {
    expect(judgeWebImageSource('upload.wikimedia.org')).toBe(
      WEB_IMAGE_SOURCE_VERDICT_IDS.allowed,
    )
    expect(judgeWebImageSource('kurobbs.com')).toBe(
      WEB_IMAGE_SOURCE_VERDICT_IDS.allowed,
    )

    const unknown = judgeWebImageSource('some-random-blog.example')
    expect(unknown).toBe(WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense)
    expect(isWebImageSourceUsableAsInput(unknown)).toBe(true)
  })

  it('吃完整 URL 也吃裸域名；取不到域名时按未知，⛔ 不按 blocked', () => {
    expect(judgeWebImageSource('https://www.pinterest.com/pin/1')).toBe(
      WEB_IMAGE_SOURCE_VERDICT_IDS.blocked,
    )
    // 取不到就关按钮的表现是「这一行怎么全灰了」，而原因与版权无关。
    for (const nothing of [undefined, null, '', 'not a url /']) {
      expect(judgeWebImageSource(nothing)).toBe(
        WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense,
      )
    }
  })

  it('三档里只有 blocked 拿不来当输入', () => {
    expect(
      isWebImageSourceUsableAsInput(WEB_IMAGE_SOURCE_VERDICT_IDS.allowed),
    ).toBe(true)
    expect(
      isWebImageSourceUsableAsInput(
        WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense,
      ),
    ).toBe(true)
    expect(
      isWebImageSourceUsableAsInput(WEB_IMAGE_SOURCE_VERDICT_IDS.blocked),
    ).toBe(false)
  })
})
