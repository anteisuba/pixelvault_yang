import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ROUTES, creatorProfilePath } from '@/constants/routes'
import { ensureUser } from '@/services/user.service'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface MyProfilePageProps {
  params: Promise<{ locale: AppLocale }>
}

/**
 * `/u/me` —— 「我的主页」这条导航项的**静态**地址（D11 ④，owner 2026-09-20
 * 第二轮）。本页没有内容，只把人送到 `/u/<username>`。
 *
 * ⭐ 为什么要这条路由：导航条目是静态清单，而个人主页的地址要 username，
 * username 只在客户端 `useMyProfile()` 回来之后才知道。上一版让壳在渲染时解析、
 * 解析不出就不产出这一项 —— 真机在日语档看到**侧边栏当着用户的面回流一次**
 * （列表过几秒多出一行）。把解析挪到服务端，条目就不再依赖任何运行时事实。
 *
 * ⚠ 段名用 `me` 是**沿用仓库既有约定**（`/api/users/me/profile` · `me/avatar`
 * · `me/banner`）。⛔ 不要另造 `/u/self` 或 `/profile` 第二套说法。
 * ⚠ 它静态段优先于同级的 `[username]`，所以 `me` 已一并进
 * `PROFILE.RESERVED_USERNAMES` —— 否则有人占了这个名字就再也打不开自己的主页。
 *
 * ⚠ `/u/(.*)` 在 `proxy.ts` 里是**公开**路由（别人的主页要能匿名看），所以
 * 未登录这一档中间件不管，得本页自己处理：与 `/settings` 同一个口径 ——
 * `redirect` 到登录页，⛔ 不自己发明第三种（404 会让人以为主页不存在）。
 */
export const metadata: Metadata = {
  robots: 'noindex, nofollow',
}

export default async function MyProfilePage({ params }: MyProfilePageProps) {
  const { locale } = await params
  const { userId } = await auth()

  if (!userId) {
    // ⚠ `return`：`redirect` 是解构出来的 const，TS 的 never-call 收窄不认，
    // 不 return 的话下面那行 `userId` 仍是 `string | null`。
    return redirect({ href: ROUTES.SIGN_IN, locale })
  }

  // `/api/users/me/profile` 用的同一支：有行返回、没行按 Clerk 资料补齐。
  const user = await ensureUser(userId)

  if (!user.username) {
    notFound()
  }

  return redirect({ href: creatorProfilePath(user.username), locale })
}
