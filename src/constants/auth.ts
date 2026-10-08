/**
 * 登录注册（owner 2026-10-08 定稿，原型 `5Uc2abc9KvKWGtpzM7HbFX`）——页面文档
 * `docs/references/pages/auth.md`。
 *
 * 登录方式只有两类：三家社交账号 + 邮箱验证码。⛔ 密码：owner 在 Clerk 后台关掉了
 * 密码，代码里也不出现任何密码步骤（密码登录会触发 Device Trust 二次验证码）。
 */

/**
 * 三家社交账号，按卡上自上而下的顺序。Clerk 免费版社交上限 3 个，所以就这三家；
 * Apple 由 owner 在 Clerk 后台打开（没打开时点了会就地报错，不会卡死）。
 */
export const AUTH_SOCIAL_PROVIDERS = [
  { id: 'google', strategy: 'oauth_google', label: 'Google' },
  { id: 'github', strategy: 'oauth_github', label: 'GitHub' },
  { id: 'apple', strategy: 'oauth_apple', label: 'Apple' },
] as const

export type AuthSocialProvider = (typeof AUTH_SOCIAL_PROVIDERS)[number]
export type AuthSocialProviderId = AuthSocialProvider['id']

/** 「上次用的」只记方式（三家之一或邮箱），⛔ 不记邮箱地址。 */
export type AuthMethod = AuthSocialProviderId | 'email'

/** 验证码位数（Clerk 邮箱验证码固定 6 位）。 */
export const AUTH_CODE_LENGTH = 6

/** 「重新发送」冷却秒数。 */
export const AUTH_RESEND_COOLDOWN_S = 60

/** 登录成功后，键上的 ✓ 停多久再离开这一页（毫秒）。 */
export const AUTH_SUCCESS_HOLD_MS = 600

/**
 * 浏览器存储里的两个键。都只在本标签页（sessionStorage）：
 * · `oneTapShown` —— Google 一键框这次访问已经出过一次（关掉就不再出）。
 * · `arrival` —— 刚发起了一次登录；进到工作台且确实已登录时，底部黑条说「已登录」。
 */
export const AUTH_STORAGE_KEYS = {
  oneTapShown: 'pv-auth-one-tap-shown',
  arrival: 'pv-auth-arrival',
} as const

/** 发起登录到真的进工作台之间最多隔多久，「已登录」黑条才算数（毫秒）。 */
export const AUTH_ARRIVAL_TTL_MS = 10 * 60 * 1000

/** Clerk 的 OAuth 回跳落点（`/sign-in` 的 catch-all 交给 Clerk 预制组件处理）。 */
export const AUTH_SSO_CALLBACK_SEGMENT = 'sso-callback'
