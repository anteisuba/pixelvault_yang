import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * 路由的 `maxDuration` 必须同时交给截止时刻（`lib/request-deadline.ts`）：
 * 大模型缓冲补全按「这次请求还剩多少时间」等。漏交 → 按平台默认 300 秒算，
 * 30 / 60 秒的路由就又会被平台先杀成不带原因的 504（owner 11-05）。
 *
 * - 走工厂的：每个 `create*Route(...)` 的配置里写 `maxDuration,`
 * - 不走工厂的：路由里自己调 `runWithRequestDeadline(maxDuration, …)`，
 *   或者确实不调大模型 —— 列进 `NO_LLM_HAND_WRITTEN`
 */

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

/** 手写、不碰大模型的路由：不需要截止时刻。新增前确认它整条链路不调 `llmTextCompletion`。 */
const NO_LLM_HAND_WRITTEN = new Set([
  'generations/[id]/poster/route.ts',
  'image/edit-stream/route.ts',
  'internal/execution/sweep/route.ts',
  'node-workflow/upload-reference-video/route.ts',
  'upload-image/file/route.ts',
  'voices/route.ts',
  'voices/transcribe/route.ts',
  'voices/upload-reference/route.ts',
  'voices/[id]/route.ts',
])

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return listRouteFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

const routesWithMaxDuration = listRouteFiles(API_ROOT)
  .map((file) => ({
    file: relative(API_ROOT, file).replaceAll('\\', '/'),
    source: readFileSync(file, 'utf8'),
  }))
  .filter(({ source }) => /export const maxDuration\s*=/.test(source))

describe('route maxDuration reaches the request deadline', () => {
  it('finds the routes it guards', () => {
    expect(routesWithMaxDuration.length).toBeGreaterThan(20)
  })

  it.each(routesWithMaxDuration.map((route) => [route.file, route]))(
    '%s',
    (_file, { file, source }) => {
      const factoryCalls = source.match(/=\s*create\w+Route\b/g) ?? []
      const passed = source.match(/^\s*maxDuration,\s*$/gm) ?? []
      if (factoryCalls.length > 0) {
        expect(passed.length).toBe(factoryCalls.length)
        return
      }
      if (NO_LLM_HAND_WRITTEN.has(file)) return
      expect(source).toMatch(/runWithRequestDeadline\(\s*maxDuration\b/)
    },
  )
})
