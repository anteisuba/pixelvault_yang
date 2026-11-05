import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'

import { VERCEL_FUNCTION } from '@/constants/config'

/**
 * 这一次请求在平台把函数杀掉之前还剩多少时间。
 *
 * 为什么要有它（owner 11-05：「AI 提供商超时」能避免的尽量避免）：大模型缓冲补全原先
 * 一律等 120 秒 —— 在 30 / 60 秒的路由里平台先杀函数，用户只拿到不带原因的 504；在
 * 300 / 800 秒的路由里又会把本来能跑完的模型提前掐掉。现在由路由工厂按路由自己的
 * `maxDuration` 记下截止时刻，`llm-text` 按剩下的时间等，赶在平台之前停并说清原因。
 *
 * ⚠ 路由文件 `export const maxDuration = N` 时必须把同一个值交给工厂（`maxDuration,`），
 *   否则这里按平台默认 300 秒算 —— `src/app/api/route-max-duration.test.ts` 锁着。
 */
const requestDeadline = new AsyncLocalStorage<{ deadlineAt: number }>()

export function runWithRequestDeadline<T>(
  maxDurationSeconds: number | undefined,
  run: () => T,
): T {
  const seconds = maxDurationSeconds ?? VERCEL_FUNCTION.DEFAULT_MAX_DURATION_S
  return requestDeadline.run({ deadlineAt: Date.now() + seconds * 1000 }, run)
}

/** 不在路由里（脚本 / 测试 / 工作流）时为 null，调用方用自己的默认值。 */
export function getRequestTimeLeftMs(): number | null {
  const store = requestDeadline.getStore()
  return store ? store.deadlineAt - Date.now() : null
}
