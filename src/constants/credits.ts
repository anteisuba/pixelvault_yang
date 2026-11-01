/**
 * 平台点数（`p-platform-credits`，设计稿 `docs/design/platform-credits.md`，owner 2026-11-01 定稿）。
 *
 * - **1 点 = 1 美分**：点就是钱，⛔ 不是 token、不是次数。任何新模型只补单价，不改点的定义。
 * - 每次调用记一行 `ApiUsageLedger`，标明是什么（`kind`）、谁出钱（`funding`）。
 * - 平台出钱的有余额、会扣光；用户自己 key 的只记不拦（owner：「只显示不拦」）。
 */

/** 1 点值多少美元。 */
export const CREDIT_POINT_USD = 0.01

/** 账本一行是哪种花费。旧行（第 1 片之前）为空 = 一次生成。 */
export const USAGE_KINDS = {
  llm: 'llm',
  image: 'image',
  video: 'video',
  audio: 'audio',
  model3d: '3d',
  gpu: 'gpu',
  search: 'search',
} as const

export type UsageKind = (typeof USAGE_KINDS)[keyof typeof USAGE_KINDS]

/** 谁出的钱：平台（owner 的 Modal / key）还是调用方自带的 key。 */
export const USAGE_FUNDING = {
  platform: 'platform',
  byok: 'byok',
} as const

export type UsageFunding = (typeof USAGE_FUNDING)[keyof typeof USAGE_FUNDING]

/**
 * Modal Runner 每秒 GPU 价（USD）。按 L40S 记（`workers/runner-modal/app.py` 先用 L40S，排不上才退
 * A100-40GB $0.000583/s，差 7%）。出处 modal.com/pricing，核于 2026-11-01。
 */
export const RUNNER_GPU_USD_PER_SECOND = 0.000542
