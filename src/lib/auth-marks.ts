import {
  AUTH_ARRIVAL_TTL_MS,
  AUTH_SOCIAL_PROVIDERS,
  AUTH_STORAGE_KEYS,
  type AuthMethod,
} from '@/constants/auth'

/**
 * 登录注册在浏览器里留的几个小记号（`docs/references/pages/auth.md`）。
 *
 * ⚠ 每一次读写都包 try/catch：隐私窗口、清了站点数据、被拦的存储都会让访问器
 *   直接抛错。拿不到就当没有 —— 这些都只是方便，⛔ 不能挡住登录本身。
 */

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSession(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch {
    /* 存不了就算了：最坏是一键框再出一次 / 少一条「已登录」。 */
  }
}

/** Google 一键框这次访问是否已经出过（出过一次就不再出，关掉也算）。 */
export function hasShownOneTap(): boolean {
  return readSession(AUTH_STORAGE_KEYS.oneTapShown) === '1'
}

export function markOneTapShown() {
  writeSession(AUTH_STORAGE_KEYS.oneTapShown, '1')
}

/** 刚发起了一次登录（社交跳转前 / 验证码通过后 / 一键框出现时）。 */
export function markAuthArrival(now: number = Date.now()) {
  writeSession(AUTH_STORAGE_KEYS.arrival, String(now))
}

/**
 * 进到工作台且已登录时调：记号新鲜就消费掉并返回 true（该弹「已登录」），
 * 过期的顺手清掉。未登录时 ⛔ 不调 —— 取消了 OAuth 的访客回来时记号要留着。
 */
export function consumeAuthArrival(now: number = Date.now()): boolean {
  const raw = readSession(AUTH_STORAGE_KEYS.arrival)
  if (raw === null) return false
  writeSession(AUTH_STORAGE_KEYS.arrival, null)
  const at = Number(raw)
  return Number.isFinite(at) && now - at >= 0 && now - at <= AUTH_ARRIVAL_TTL_MS
}

/**
 * Clerk 记的「上次怎么登录的」（`client.lastAuthenticationStrategy`）折成卡上的方式。
 * 只认卡上有的四种；密码、手机号、通行密钥一类卡上没有的方式 → 不标。
 */
export function authMethodFromStrategy(
  strategy: string | null | undefined,
): AuthMethod | null {
  if (!strategy) return null
  const social = AUTH_SOCIAL_PROVIDERS.find((p) => p.strategy === strategy)
  if (social) return social.id
  if (
    strategy === 'email_code' ||
    strategy === 'email_link' ||
    strategy === 'email_address'
  ) {
    return 'email'
  }
  return null
}
