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

/** Modal 单次任务时限（`workers/runner-modal/app.py` timeout=600）；占卡秒数按它封顶。 */
export const RUNNER_GPU_MAX_SECONDS = 600

/** 送点的理由（`CreditGrant.reason`）。 */
export const CREDIT_GRANT_REASONS = {
  signup: 'signup',
  ownerGift: 'owner_gift',
} as const

export type CreditGrantReason =
  (typeof CREDIT_GRANT_REASONS)[keyof typeof CREDIT_GRANT_REASONS]

export const CREDIT_LIMITS = {
  /** 新用户注册礼（owner 2026-11-01 定 100 点 ≈ $1）。存量用户第一次读余额时补。 */
  signupGrantPoints: 100,
  /**
   * 发起一次 Runner 出图前要先占住的点数（先占后结：结算按实际占卡秒数，一般 3–7 点；
   * 占 10 点是上限，冷启动 + 大图也够）。在跑的任务各占一份，失败的不扣。
   */
  runnerReservePoints: 10,
  /** admin 一次最多送多少（防手滑多打一个 0）。 */
  maxGiftPoints: 10_000,
} as const

/**
 * 平台出钱的对话模型（owner 2026-11-01：朋友的点数能用 DeepSeek 走 owner 的 key）。
 * 没配任何助手 key、又有点数的人，「自动」就落到这一档，花费按 token 从点数扣。
 * `apiKeyId` 是占位 id：看图那几条腿把它原样递给 `resolveLlmTextRoute`，由那里换成平台 key。
 */
export const PLATFORM_LLM_ROUTE = {
  apiKeyId: 'platform:deepseek',
  modelId: 'deepseek-flash',
} as const
