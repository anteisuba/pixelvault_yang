/**
 * Dock 底座里「当前是谁登录」的那一格，单独一个无依赖模块：
 * `vi.mock('@clerk/nextjs')` 的工厂只能 import 它 —— ⛔ 别从工厂里 import
 * `operator-dock.tsx`，那边会经 Dock 再 import `@clerk/nextjs`，模块加载互等卡死。
 */
export const DOCK_USER = { id: 'user-a' }

/** `vi.mock('@clerk/nextjs', async () => (await import(…)).clerkDockMock())` 用。 */
export function clerkDockMock() {
  return {
    useUser: () => ({ user: { id: DOCK_USER.id }, isLoaded: true }),
    useAuth: () => ({
      userId: DOCK_USER.id,
      isLoaded: true,
      isSignedIn: true,
    }),
  }
}
