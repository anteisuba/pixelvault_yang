/**
 * Vercel Cron 的可见性常量。
 *
 * 名字在这里定死一次：cron 路由按它写心跳、`/api/health/crons` 按它读心跳、
 * `cron-monitor.yml` 按它报警。任何一侧另拼字符串，表现都是「这条 cron 从来
 * 没上报过」——会被当成故障报出来，而不是安静地失配。
 */
export const CRON_JOBS = {
  CIVITAI_LORA_PREWARM: 'civitai-lora-prewarm',
  EXECUTION_SWEEP: 'execution-sweep',
  CIVITAI_MIRROR_SYNC: 'civitai-mirror-sync',
} as const

export type CronJobName = (typeof CRON_JOBS)[keyof typeof CRON_JOBS]

/**
 * 监控面覆盖的全集，必须与 `vercel.json` 的 `crons` 一一对应。
 *
 * ⚠ 加 cron 时这里漏了 = 那条 cron 不在监控里，且**没有任何东西会提醒你**
 * ——和它压根没跑一样安静。加 cron 的完整清单见 `docs/references/cicd.md`
 * 「加 cron 前必须做的两件事」，本条是第三件。
 */
export const CRON_JOB_NAMES: readonly CronJobName[] = Object.values(CRON_JOBS)

export const CRON_HEARTBEAT = {
  KEY_PREFIX: 'pv:cron-heartbeat',

  /**
   * 26 小时——超过这个岁数的心跳判定为「漏跑了」。
   *
   * 三条 cron 都是每日一次，而 **Hobby 的 cron 会在指定的那个整点内任意时刻
   * 触发**：`0 4 * * *` 实际可能落在 04:00:00–04:59:59（见
   * <https://vercel.com/docs/cron-jobs/manage-cron-jobs> 的 "Cron jobs
   * accuracy"）。于是两次成功运行之间的**正常**最大间隔是 24h + 1h = 25h。
   * 26h 只留一小时余量：既不会被 Hobby 的漂移误报，又能在漏掉**一次**运行时
   * 当天就报出来，而不是等到漏了两次。
   */
  MAX_AGE_MS: 26 * 60 * 60 * 1000,

  /**
   * 心跳在 Redis 里的存活时间。
   *
   * ⚠ 必须**远大于** `MAX_AGE_MS`：否则「过期太久」会先塌缩成「key 不存在」，
   * 报警里就丢掉了「上一次成功是什么时候、报的什么错」这两条最有用的信息，
   * 只剩一句「没有记录」。7 天覆盖得住一次无人值守的长假。
   */
  TTL_SECONDS: 7 * 24 * 60 * 60,
} as const
