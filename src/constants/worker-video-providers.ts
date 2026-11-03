/**
 * 执行 Worker 视频服务商的**共享契约**（o-worker 第 5 步，和出图那份
 * `worker-image-providers.ts` 一个做法）。
 *
 * Next 侧「哪些视频服务商可以派给 Worker」和 Worker 侧「提交 / 轮询驱动表」读同一份
 * 名单：在这里加一家，Worker 漏写驱动类型检查直接报错。
 *
 * ⚠ 这个文件**不 import 任何东西**：Worker 单独打包，只认相对路径，不认 `@/`。
 */
export const WORKER_VIDEO_PROVIDER_IDS = [
  'gemini',
  'fal',
  'minimax',
  // MiniMax 国内站（域名多一个 i），账号和 key 与国际站分开。
  'minimax_cn',
  // 火山 Ark 直连：同一批 Seedance，fal 转卖约 2.2 倍价。
  'volcengine',
  // BytePlus ModelArk = 同一套 Ark API 的国际站。
  'byteplus',
] as const

export type WorkerVideoProviderId = (typeof WORKER_VIDEO_PROVIDER_IDS)[number]

export function isWorkerVideoProviderId(
  value: string,
): value is WorkerVideoProviderId {
  return (WORKER_VIDEO_PROVIDER_IDS as readonly string[]).includes(value)
}
