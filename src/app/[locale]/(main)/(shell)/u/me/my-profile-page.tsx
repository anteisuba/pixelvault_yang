import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { ROUTES, creatorProfilePath } from '@/constants/routes'
import { ensureUser, getCreatorProfile } from '@/services/user.service'
import { CreatorProfileView } from '@/components/business/CreatorProfileView'
import { pageAddress } from '@/lib/page-address'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface MyProfilePageProps {
  params: Promise<{ locale: AppLocale }>
}

/**
 * `/u/me` —— 「我的主页」这条导航项的**静态**地址（D11 ④）。
 *
 * ⭐ 为什么要这条路由：导航条目是静态清单，而个人主页的地址要 username，
 * username 只在客户端 `useMyProfile()` 回来之后才知道。曾经让壳在渲染时解析、
 * 解析不出就不产出这一项 —— 真机在日语档看得见**侧边栏当着用户的面回流一次**
 * （列表过几秒多出一行）。地址静态化以后，条目不再依赖任何运行时事实。
 *
 * ⭐ **就地渲染，⛔ 不 redirect 到 `/u/<username>`**（owner 2026-09-20）。
 * 两条理由：
 * ① 地址栏停在 `/u/me`，导航那一项的激活态就自然成立 —— 否则落地 URL 带着
 *    username，静态清单认不出那是不是「我的」，只能把刚删掉的运行时解析接回来；
 * ② 与仓库既有的 `me` 约定同构：`/api/users/me/profile` 也是**就地返回**当前
 *    用户，不跳到 `/api/users/<username>/profile`。
 *
 * ⚠ 同一个页面两个地址，所以 canonical 指向带用户名那个 —— 告诉爬虫哪个是
 * 正的。地址由 `pageAddress()` 一支算出（canonical / hreflang / og:url 是同一
 * 个事实的三个出口），⛔ 这里不自己拼 origin。传了 `canonicalPath` 就不产
 * hreflang —— 正本都不是自己，再给一组翻译对照只会是矛盾信号。
 * ⛔ 不要再叠 `noindex`：canonical 已经回答了重复内容这件事。
 *
 * ⚠ 段名用 `me` 沿用 `/api/users/me/*` 的约定，⛔ 不造 `/u/self` / `/profile`
 * 第二套说法。它静态段优先于同级 `[username]`，所以 `me` 已一并进
 * `PROFILE.RESERVED_USERNAMES` —— 否则有人占了这个名字就再也打不开自己的主页。
 *
 * ⚠ `/u/(.*)` 在 `proxy.ts` 里是**公开**路由（别人的主页要能匿名看），所以
 * 未登录这一档中间件不管，得本页自己处理：与 `/settings` 同一个口径 ——
 * `redirect` 到登录页，⛔ 不自己发明第三种（404 会让人以为主页不存在）。
 */
export async function generateMetadata({
  params,
}: MyProfilePageProps): Promise<Metadata> {
  const { locale } = await params
  const { userId } = await auth()

  if (!userId) return {}

  // `ensureUser` 是 `cache()` 包的，与下面页面体那次是同一请求内的同一次查询。
  const user = await ensureUser(userId)

  if (!user.username) return {}

  const t = await getTranslations({ locale, namespace: 'CreatorProfile' })
  const displayName = user.displayName ?? user.username
  const title = `${displayName} — ${t('metaTitle')}`

  const { alternates, openGraph } = pageAddress({
    locale,
    path: ROUTES.MY_PROFILE,
    canonicalPath: creatorProfilePath(user.username),
  })

  return {
    title,
    alternates,
    // ⚠ 子页只要写了 `openGraph`，根层那块就整块消失 —— `siteName` / `locale`
    // 由 `pageAddress()` 一起给回来，⛔ 别在这里重写。
    openGraph: { ...openGraph, title },
  }
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

  const profile = await getCreatorProfile(user.username, user.id)

  if (!profile || 'private' in profile) {
    // `getCreatorProfile` 对**本人**短路掉了私密分支（`isOwnProfile`），所以
    // 这里只剩「查无此人」一种真实情况：User 行与 username 不同步。
    notFound()
  }

  return <CreatorProfileView username={user.username} initialData={profile} />
}
