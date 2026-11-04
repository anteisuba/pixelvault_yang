/** 网站 Worker（wrangler.jsonc）自己加的绑定；OpenNext 自带的那些它自己声明了。 */
declare global {
  interface CloudflareEnv {
    /** Neon 前面的 Hyperdrive 连接池。 */
    HYPERDRIVE?: { connectionString: string }
    /** 定时任务调 /api/internal/execution/sweep 用的口令（secret）。 */
    CRON_SECRET?: string
  }
}

export {}
