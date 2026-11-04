import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache'

/**
 * 网站跑在 Cloudflare Workers 上的 OpenNext 配置（2026-11 搬家）。
 *
 * - ISR / unstable_cache 的缓存放 R2（首页 1 小时、画廊 60 秒、模型列表 60 秒）；
 * - 到期后的后台重算走 Durable Object 队列，同一页并发只算一次；
 * - revalidateTag（画廊公开、可用模型两个标签）记在分片的 Durable Object 里，不用另建 D1。
 * 构建用 webpack：Turbopack 产物 123 MiB，超过 Workers 64 MiB 上限。
 */
export default {
  ...defineCloudflareConfig({
    incrementalCache: r2IncrementalCache,
    queue: doQueue,
    tagCache: doShardedTagCache({ baseShardSize: 4 }),
  }),
  buildCommand: 'bash scripts/cloudflare-build.sh',
}
