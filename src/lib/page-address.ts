import type { Metadata } from 'next'
import type { Languages } from 'next/dist/lib/metadata/types/alternative-urls-types'

import { getAppOrigin, SITE_NAME } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/routing'

/**
 * 一页的**地址**是一个事实，却有三个出口：`link[rel=canonical]`、
 * `link[rel=alternate][hreflang]` 和 `og:url`。三者从这里一起算出来，
 * 就不会再出现某一个对、另一个指着首页的分裂状态。
 *
 * ⚠ Next.js 的 metadata 合并是**整块替换**，不是深合并：子页一旦写了
 * `openGraph` 或 `alternates`，父层的同名块整块消失。两条后果都被这里接住：
 * ① 根 layout ⛔ 不给全站 canonical —— 那种默认值只在没人覆盖时生效，于是
 *    每个忘了覆盖的页面都在对爬虫说「我的正本是首页」，等于自请不收录；
 * ② 子页写 `openGraph` 会连带丢掉根层的 `siteName` / `locale`，所以本函数
 *    把它们和 `url` 一起放进 `openGraph` 返回，调用处直接展开，别重写。
 *
 * ⚠ sitemap 里那条 URL 必须与 canonical 逐字一致，否则两个信号互相打架 ——
 * `src/app/sitemap.ts` 因此也走 `localeUrl`。
 */

/** `${origin}/${locale}${path}`；首页没有尾巴。 */
export function localeUrl(
  locale: AppLocale,
  path: string = ROUTES.HOME,
): string {
  const origin = getAppOrigin()
  return path === ROUTES.HOME
    ? `${origin}/${locale}`
    : `${origin}/${locale}${path}`
}

/**
 * 同一份内容的三档翻译 + `x-default`。
 *
 * `localePrefix: 'always'`，站上不存在无前缀的那一份，所以 `x-default` 指向
 * 默认 locale（en）——「语言都不匹配时给他看这个」。
 */
function localeLanguages(path: string): Languages<string> {
  const languages: Languages<string> = {
    'x-default': localeUrl(DEFAULT_LOCALE, path),
  }

  for (const locale of LOCALES) {
    languages[locale] = localeUrl(locale, path)
  }

  return languages
}

export interface PageAddressOptions {
  locale: AppLocale
  /** 这一页自己的路径：`ROUTES.*`，或 `ROUTES` 里那些 path builder 的产物。 */
  path: string
  /**
   * 正本在**别的地址**时才传。目前只有 `/u/me`：同一张脸两个地址，正本是
   * `/u/<username>`（owner 2026-09-20 拍板）。传了就不产 hreflang —— 正本
   * 都不是自己，再给一组翻译对照只会让爬虫收到互相矛盾的两组信号。
   * ⛔ 不要改用 `noindex` 代劳：canonical 已经回答了重复内容这件事。
   */
  canonicalPath?: string
}

export interface PageAddress {
  alternates: NonNullable<Metadata['alternates']>
  openGraph: { url: string; siteName: string; locale: AppLocale }
}

export function pageAddress({
  locale,
  path,
  canonicalPath,
}: PageAddressOptions): PageAddress {
  const canonical = localeUrl(locale, canonicalPath ?? path)

  return {
    alternates: canonicalPath
      ? { canonical }
      : { canonical, languages: localeLanguages(path) },
    openGraph: { url: canonical, siteName: SITE_NAME, locale },
  }
}
