import '@testing-library/jest-dom/vitest'

// Mock server-only module so API route tests can import factory functions
vi.mock('server-only', () => ({}))

/**
 * 单测一律不做真实 DNS 解析。
 *
 * `safeFetch`（`src/lib/url-guard.ts`）现在会在每一跳之前解析 hostname 并校验
 * 全部解析结果（挡 DNS rebinding）。测试里的主机名（`fal.media`、
 * `provider.example.com`…）在沙箱/CI 里解析不到，真解析既让用例发网络请求、
 * 又会把「上游返 404」这类断言变成「DNS resolution failed」。默认答一个无害的
 * 公网地址；要断言解析结果本身的用例在自己文件里覆盖这个 mock（见
 * `src/lib/url-guard.test.ts`）。
 *
 * ⚠ `default` 必须一起给：`node:dns` 是 CJS 内置模块，源码里的
 * `import { promises as dns }` 经 vite 的 CJS interop 后读的是 default 上的那份。
 */
vi.mock('node:dns', () => {
  const mocked = {
    promises: {
      lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
    },
  }
  return { ...mocked, default: mocked }
})

/**
 * `next/font/google` 只在 Next 的编译期存在：它的运行时导出由 SWC 的 font
 * loader 生成，plain vitest 里 `Geist(...)` 会直接 `is not a function`。
 *
 * 2026-09-03 起这个 mock 是必需的：路由专属字体从根 `layout.tsx` 下沉到各自的
 * 域根（`LegalPage` / `LocaleNotFound` 的 `.legal-page`、`HomeV4Shell` 的
 * `.home-v4`），于是 `src/i18n/fonts.ts` 第一次进了组件测试的 import 图。
 * 放在 setup 里而不是逐个测试文件里，是因为下一个渲染这些页面的测试不该再踩
 * 一次同一个坑。
 *
 * 形状与 next/font 的返回值一致（`className` / `variable` / `style`），值取字体
 * 名，断言 className 的用例因此读得到一个稳定可辨认的字符串。
 */
vi.mock('next/font/google', () => {
  const loader = (family: string) => (options?: { variable?: string }) => ({
    className: `mock-font-${family}`,
    variable: options?.variable ?? `--font-mock-${family}`,
    style: { fontFamily: family },
  })

  // ⚠ 必须逐个列出真实导出名：vitest 会拿返回对象的 own keys 校验被 import 的
  // 名字，Proxy 的 `get` 兜不住（报「No "Geist" export is defined」）。
  // 名单 = `src/i18n/fonts.ts` 的 import 列表，加字体时同步这里。
  return {
    Fraunces: loader('Fraunces'),
    Geist: loader('Geist'),
    Geist_Mono: loader('Geist_Mono'),
    IBM_Plex_Mono: loader('IBM_Plex_Mono'),
    Noto_Sans: loader('Noto_Sans'),
    Noto_Sans_JP: loader('Noto_Sans_JP'),
    Noto_Sans_SC: loader('Noto_Sans_SC'),
    Noto_Serif_JP: loader('Noto_Serif_JP'),
    Noto_Serif_SC: loader('Noto_Serif_SC'),
  }
})
