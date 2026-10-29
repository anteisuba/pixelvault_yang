/**
 * 站内时间按看的人那台机器的时区显示（owner 2026-10-29：「今天 01:43 回来」其实是东京 10:43）。
 * 浏览器把自己的时区写进这个 cookie，`(main)` 布局读它交给 next-intl；没写过之前按 UTC。
 */
export const TIME_ZONE_COOKIE = 'antei-tz'

/** 只认浏览器真认得的 IANA 名字（cookie 是用户能改的）。 */
export function validTimeZone(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
      .timeZone
  } catch {
    return undefined
  }
}
