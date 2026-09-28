/**
 * 等容器里的服务开始监听，再把真正的请求交过去。
 *
 * ⚠ `container.start()` 只是把实例拉起来：里面的 node 服务还要一会儿才 `listen`，
 * 这期间 `getTcpPort().fetch` 直接抛「not listening」。2026-09-28 线上首次实跑导出，
 * 每次重试都是一台刚起的容器 + 立刻发请求，于是每一次都撞上它。
 * ⚠ 只探 `/health`（GET、无副作用）——⛔ 不重试业务请求本身：`/run` 可能已经送达、
 * 已经在跑 ffmpeg，重发等于同一段编两遍。
 */

export interface WaitUntilListeningOptions {
  readonly timeoutMs: number
  readonly intervalMs: number
  readonly now?: () => number
  readonly sleep?: (ms: number) => Promise<void>
}

export async function waitUntilListening(
  probe: () => Promise<Response>,
  options: WaitUntilListeningOptions,
): Promise<void> {
  const now = options.now ?? Date.now
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const deadline = now() + options.timeoutMs
  let lastError = 'no answer'

  for (;;) {
    try {
      const response = await probe()
      if (response.ok) return
      lastError = `health answered ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (now() >= deadline) {
      throw new Error(
        `container not ready after ${options.timeoutMs}ms: ${lastError}`,
      )
    }
    await sleep(options.intervalMs)
  }
}
