import { ASSISTANT_MEMORY_LIFECYCLE } from '@/constants/assistant-memory'

/**
 * 记忆「到哪天为止」⇄ 库里的 `expiresAt`（角色大项目第 ⑦ 步）。客户端与服务端共用。
 *
 * 存的是那天 0 点（UTC）再往后 `graceDays` 天：那天过完、第二天她还记得，再往后就不提了。
 */
const DAY_MS = 24 * 60 * 60 * 1000

export function expiresAtFromUntil(until: string): Date {
  return new Date(
    Date.parse(`${until}T00:00:00Z`) +
      ASSISTANT_MEMORY_LIFECYCLE.graceDays * DAY_MS,
  )
}

/** `expiresAt`（ISO / Date）→ 当初给的那个日子 `YYYY-MM-DD`。 */
export function untilFromExpiresAt(expiresAt: string | Date): string {
  const time =
    typeof expiresAt === 'string' ? Date.parse(expiresAt) : expiresAt.getTime()
  return new Date(time - ASSISTANT_MEMORY_LIFECYCLE.graceDays * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/** 创作者那边今天是几号、星期几（给模型定「到哪天为止」用）。时区认不得就按 UTC。 */
export function todayFor(
  timeZone: string | undefined,
  now = new Date(),
): string {
  const format = (zone: string | undefined) => {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
    }).format(now)
    return `${date} (${weekday})`
  }
  try {
    return format(timeZone ?? 'UTC')
  } catch {
    return format('UTC')
  }
}
