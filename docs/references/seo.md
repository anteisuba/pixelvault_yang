# SEO 参考 — 页面地址与索引信号契约（现状事实）

> 定位：**一页对爬虫报出的地址**由谁说、说什么。起因 2026-09-20 实测：根 layout 给出的全站 canonical 被子页原样继承，几乎每个公开页都在说「我的正本是首页」。
> 事实源：`src/lib/page-address.ts` · `src/app/[locale]/layout.tsx` · `src/app/sitemap.ts` · `src/app/robots.ts`

## 统一语言

**canonical 指向这一页自己的规范地址。** 一页的地址是一个事实，只有三个出口：`link[rel=canonical]`、`link[rel=alternate][hreflang]`、`og:url`。它们必须同时算出来，否则各自漂移。

canonical 指向别的 URL，等于告诉搜索引擎「我是那一页的副本」——页面不被收录。这不是配置口味问题，是自请除名。

## 口径

1. **根 layout ⛔ 不给 `alternates`，⛔ 不给 `openGraph.url`。** Next 的 metadata 是整块替换而不是深合并：父层给的地址在子页没覆盖时原样生效，于是每个忘了覆盖的页面都继承到首页的地址。根层只留全站共享的身份（title/description/`metadataBase`/`siteName`）。
2. **公开页各自用 `pageAddress({ locale, path })` 报地址**，把返回的 `alternates` 原样放进 metadata、`openGraph` 展开进自己的 openGraph。不手写 URL 拼接。
3. **hreflang 给同一份内容的三档翻译 + `x-default`。** `localePrefix: 'always'`，站上不存在无前缀的那一份，所以 `x-default` 指向默认 locale（en）。hreflang 组内每个地址都必须自指 canonical，否则整组作废——这正是 `canonicalPath` 抑制 hreflang 的原因。
4. **筛选参数不进 canonical。** 分面只活在 query string 里，`/gallery?model=...` 的正本是 `/gallery`。把参数拼进 canonical 会凭空造出无数个自称正本的地址。
5. **sitemap、JSON-LD 的 `url` 与 canonical 逐字一致。** 三者都走 `localeUrl()`；不一致就是三个互相打架的信号。
6. **⛔ 不用 `noindex` 回答重复内容。** canonical 已经回答了这件事，两个信号同挂是互相矛盾的（noindex 还可能顺着 canonical 传到正本）。`noindex` 只用于**本来就不该进索引**的页面：登录页、`/settings`、`/studio/*` 及私密归档。那些页面同时**不要**再给 canonical。

## 有意的例外

`/u/me` —— 同一张脸两个地址，`/u/me` 是登录后的快捷入口，正本是 `/u/<username>`（owner 2026-09-20 拍板）。它传 `canonicalPath`，于是 canonical 和 `og:url` 一起指向带用户名那个地址，并且不产出 hreflang。⛔ 不要把它改成自指，那会让两个地址互相争正本。

`/u/<username>` 的 canonical 用 `creatorProfilePath(profile.username)`（库里那个规范拼写），不是地址栏原样的段——大小写或转义不同的链接因此归到同一个正本。

## 覆盖现状（2026-09-20 实测）

| 页面                 | canonical      | hreflang | og:url        |
| -------------------- | -------------- | -------- | ------------- |
| `/`                  | 自指           | ✅       | = canonical   |
| `/gallery`           | 自指（不带参） | ✅       | = canonical   |
| `/gallery/[id]`      | 自指           | ✅       | = canonical   |
| `/u/[username]`      | 自指（规范化） | ✅       | = canonical   |
| `/u/me`              | → `/u/<name>`  | 故意没有 | → `/u/<name>` |
| `/privacy`・`/terms` | 自指           | ✅       | = canonical   |
| noindex 那一批       | 故意没有       | 没有     | 没有          |

## Last Verified

- 2026-09-20 · 方法：dev server 实测每一类页面的 `link[rel=canonical]` / `meta[property="og:url"]` / `link[rel=alternate]`，`/u/me` 在已登录浏览器里取。单测钉住 `pageAddress()` 与 `/u/me` 的返回。
- 仍未接上地址契约的两处：`/assistant/share/[token]`（公开路由，客户端组件，完全没有 metadata）与 `/storyboard`（robots.txt 已 disallow，但没有同级页面都有的 `noindex`）。下次动到这两处时一并收编。
