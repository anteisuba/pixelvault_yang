import 'server-only'

import { timingSafeEqual } from 'node:crypto'

/**
 * 校验 `Authorization: Bearer <secret>`，比较走常量时间。
 *
 * `!==` 会在第一个不同的字节上提前退出，把 secret 的前缀按字节泄漏给能测时间
 * 的调用方；`timingSafeEqual` 不会。它要求两个 Buffer 等长（长度不等直接抛），
 * 所以长度必须先自己比 —— 长度本身会泄漏，但 secret 的长度不是秘密，逐字符
 * 提前退出才是可利用的那一面。
 *
 * 头缺失按「不匹配」处理，调用方因此只需要一个 if。⚠ 调用方仍要先自己确认
 * secret 已配置（缺配置是 503，不是 401）——这里不替它兜。
 */
export function isValidBearerToken(
  authHeader: string | null,
  secret: string,
): boolean {
  if (!authHeader) return false
  const received = Buffer.from(authHeader, 'utf8')
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8')
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}
