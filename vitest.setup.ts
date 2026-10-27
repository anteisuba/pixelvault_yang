import '@testing-library/jest-dom/vitest'

import { notifyManager } from '@tanstack/react-query'

import { queryClient } from '@/lib/query-client'

// 客户端查询缓存是模块级单例：每例清空，免得上一例拉到的数据漏进下一例；单测里失败不重试。
// 通知同步发（默认是 setTimeout 0）：`act(…)` 一结束，缓存的改动就已经画上去。
notifyManager.setScheduler((callback) => callback())
queryClient.setDefaultOptions({
  queries: { ...queryClient.getDefaultOptions().queries, retry: false },
})
afterEach(() => {
  queryClient.clear()
})

// Mock server-only module so API route tests can import factory functions
vi.mock('server-only', () => ({}))

/**
 * 单测只认 CI 那份环境：不连真服务，功能开关全按默认。
 *
 * 开发机或云会话的 shell 里常带着线上的值。带着 Upstash 的 URL / token 时，
 * 没 mock 缓存的用例会真去读写线上 Redis（还会等到 15 秒超时）；带着
 * `NEXT_PUBLIC_FF_*` 时，按开关算出来的常量（如 runner 模型可不可用）就和 CI
 * 不一样。这里在任何模块 import 之前删掉；要测「配置了」的用例自己
 * `vi.stubEnv`，`vi.unstubAllEnvs()` 会还原成这里删掉之后的样子。
 */
for (const name of Object.keys(process.env)) {
  if (name.startsWith('UPSTASH_') || name.startsWith('NEXT_PUBLIC_FF_')) {
    delete process.env[name]
  }
}

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
 * `next/font/local` 只在 Next 的编译期存在：它的运行时导出由 SWC 的 font
 * loader 生成，plain vitest 里 `localFont(...)` 会直接 `is not a function`。
 * 渲染法律页 / 404 / 首页的测试会把 `src/i18n/fonts.ts` 带进 import 图，所以放在
 * setup 里一份。形状与 next/font 的返回值一致（`className` / `variable` / `style`）。
 */
vi.mock('next/font/local', () => ({
  default: (options?: { variable?: string }) => ({
    className: 'mock-font-local',
    variable: options?.variable ?? '--font-mock-local',
    style: { fontFamily: 'mock-font-local' },
  }),
}))
