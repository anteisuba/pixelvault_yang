/**
 * Cloudflare 构建里替代服务端的 `@sentry/nextjs`（next.config.ts 的 webpack alias）。
 *
 * `@sentry/nextjs` 的服务端包一加载就调 `createRequire(__filename)`，Workers 上直接抛错，
 * 整站 500。Workers 上改用 `@sentry/cloudflare`：初始化在 `cloudflare/worker.ts` 的
 * `withSentry` 里做，这里只把服务端代码用到的几个名字接过去。浏览器端照旧用 `@sentry/nextjs`。
 */
import { captureException } from '@sentry/cloudflare'

export { captureException }

/** 初始化交给 Worker 入口；这里不重复做。 */
export function init(): void {}

/** Next 的 `onRequestError`：照普通异常上报。 */
export function captureRequestError(error: unknown): void {
  captureException(error)
}
