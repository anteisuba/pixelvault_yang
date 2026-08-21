/**
 * LoRA 候选检索与 `[[lora]]` 推荐卡的取值范围（切片 3「一次确认链」的数据层）。
 *
 * ── 这个文件为什么单独存在 ─────────────────────────────────────────
 * `constants/lora.ts` 是搜索/库浏览那条线的家（分页、NSFW 档、内容类型、家族
 * 种子词），已经 900 行。候选检索是**另一件事**：它服务的是助手推荐，取值范围
 * （最多喂几条、单源多久算死、元数据缺到什么程度算「只推荐不导入」）与库浏览
 * 的分页参数没有一个是共享的。混进去只会让两边互相改错。
 *
 * ⚠ 这里的数字全部有理由，别当默认值随手改：
 *   - `maxCandidates` 6 —— token 预算。候选块进的是**用户提示**，与工作台状态块
 *     同一预算池；喂满 20 条会把对话本身挤出压缩窗口。
 *   - `maxPromptTriggerWords` 3 —— 触发词是给模型判断「这把 LoRA 管什么」的，
 *     不是给它抄的。多 outfit 的 LoRA 一条能有十几个触发词。
 */

/**
 * LoRA 资产的两种用途。**`LoraAssetTypeSchema` 从这里取值**——枚举原本写死在
 * `types/index.ts` 里，候选归一化也要用同一组值，抄第二份就会有一天对不上。
 */
export const LORA_ASSET_TYPE_VALUES = ['subject', 'style'] as const

/** 候选来自哪个上游。`LoraCandidate.source` 与来源快照共用这一组值。 */
export const LORA_CANDIDATE_SOURCE_IDS = {
  civitai: 'civitai',
  huggingface: 'huggingface',
} as const

export const LORA_CANDIDATE_SOURCE_VALUES = [
  LORA_CANDIDATE_SOURCE_IDS.civitai,
  LORA_CANDIDATE_SOURCE_IDS.huggingface,
] as const

/**
 * 元数据完整度三档。**如实分级，不是评分** —— 它的唯一用途是让卡面能说出
 * 「这条我们知道的不多」，而不是给候选排序。
 */
export const LORA_METADATA_COMPLETENESS = {
  complete: 'complete',
  partial: 'partial',
  minimal: 'minimal',
} as const

export const LORA_METADATA_COMPLETENESS_VALUES = [
  LORA_METADATA_COMPLETENESS.complete,
  LORA_METADATA_COMPLETENESS.partial,
  LORA_METADATA_COMPLETENESS.minimal,
] as const

/**
 * 完整度打分的门槛，数的是六个信号（作者 / 许可 / 底模家族 / 触发词 / 文件大小
 * / 样图）里有几个。六个全有才算 complete —— 门槛故意定得高：`partial` 不是
 * 缺陷标签，是常态。
 */
export const LORA_METADATA_COMPLETENESS_THRESHOLDS = {
  complete: 6,
  partial: 3,
} as const

export const LORA_CANDIDATE_LIMITS = {
  /** 一次检索最多归一出几条候选（也是喂给模型的上限）。 */
  maxCandidates: 6,
  /** 每个源最多要多少条原始结果 —— 两源合并去重后再截到 maxCandidates。 */
  perSourcePageSize: 8,
  /** 候选块里每条最多列几个触发词。 */
  maxPromptTriggerWords: 3,
  /** 候选对象上带几张样图（推荐卡的图区）。⛔ 样图 URL **不进提示词**。 */
  maxSampleImages: 4,
  /** 名字的落库上限 —— 与 `FavoriteLoraRequestSchema.name` 的 120 同一个数。 */
  nameMaxLength: 120,
  /** 候选块里每条名字/作者的截断长度。 */
  labelChars: 80,
  /** 单源预算。超了这一源算失败，另一源照常返回。 */
  sourceTimeoutMs: 12_000,
  /** 单源重试次数（瞬时 5xx / 网络抖动）。 */
  maxAttempts: 2,
  /** 检索词长度上限。 */
  maxQueryLength: 120,
  /** 比对「用户是不是已经收藏过」时最多扫多少行自有资产。 */
  maxOwnedAssetsScanned: 200,
} as const

/** 单源熔断（与检索线同一个 lib，配置各自独立）。 */
export const LORA_CANDIDATE_BREAKER_OPTIONS = {
  failureThreshold: 4,
  resetTimeoutMs: 60_000,
} as const

export const LORA_CANDIDATE_BREAKER_PREFIX = 'lora-candidates'

/** 单源结果状态 —— 与检索回执同一套语义：空 ≠ 挂。 */
export const LORA_CANDIDATE_SOURCE_STATUSES = {
  ok: 'ok',
  empty: 'empty',
  failed: 'failed',
  circuitOpen: 'circuit_open',
} as const

export const LORA_CANDIDATE_SOURCE_STATUS_VALUES = [
  LORA_CANDIDATE_SOURCE_STATUSES.ok,
  LORA_CANDIDATE_SOURCE_STATUSES.empty,
  LORA_CANDIDATE_SOURCE_STATUSES.failed,
  LORA_CANDIDATE_SOURCE_STATUSES.circuitOpen,
] as const

/**
 * 「只推荐不导入」的原因码（任务包 §5 的导入门槛）。
 *
 * ⚠ **是原因码不是文案**：卡上要三语显示，i18n key 由 UI 那批按这些码建
 * （`loraCandidate.notImportable.<code>`）。服务端不产出用户可读文案 ——
 * 产出了就等于把一份中文写死在服务端，另外两语永远补不上。
 */
export const LORA_CANDIDATE_NOT_IMPORTABLE_REASONS = {
  /** 底模家族定不出来（civitai 的 `unknown` / HF 推断落到 `other`）。 */
  unknownBaseModel: 'unknown_base_model',
  /** 仓库里没有可直接下载的权重文件。 */
  noWeightFile: 'no_weight_file',
  /** HF gated / private 仓库 —— 技术上取不到（已拍板边界 7 的「技术不可得仍阻断」）。 */
  gatedRepo: 'gated_repo',
} as const

export const LORA_CANDIDATE_NOT_IMPORTABLE_REASON_VALUES = [
  LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.unknownBaseModel,
  LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.noWeightFile,
  LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.gatedRepo,
] as const

/**
 * 两个源各自表示「这个值我不知道」的字面量。
 *
 * civitai 的 `version.baseModel` 缺失时 `toLibraryItem` 写的是 `'unknown'`；
 * HF 的 `inferBaseModelFamily` 推不出来时落 `'other'`。两个都**不是家族名**，
 * 是「没定出来」的哨兵值 —— 导入门槛判的就是它们。
 */
export const LORA_CANDIDATE_UNRESOLVED_FAMILIES = ['unknown', 'other'] as const

/**
 * 一次确认链的三步（任务包 §5：导入 → 挂载 → 触发词）。
 *
 * ⚠ **失败必须报到步**：「导入失败」「挂载失败」「触发词没写进去」是三件完全不同
 * 的事，用户的下一步动作也完全不同（换一把 / 去工作台挂 / 自己粘一遍）。笼统一句
 * 「操作失败」等于把三条不同的路都堵死。三语文案按这些码建
 * （`loraCandidate.failed.<code>`）。
 */
export const LORA_CANDIDATE_CONFIRM_STEPS = {
  import: 'import',
  mount: 'mount',
  triggerWords: 'trigger_words',
} as const

export type LoraCandidateConfirmStep =
  (typeof LORA_CANDIDATE_CONFIRM_STEPS)[keyof typeof LORA_CANDIDATE_CONFIRM_STEPS]

// ─── 候选下发（响应头）──────────────────────────────────────────────
//
// 客户端拿不到候选就没有推荐卡：`[[lora]]` 里只有 candidateId，名字/作者/许可/
// 样图全在候选对象上。下发走**响应头**，与检索回执同一条路数（编解码与降级
// 阶梯见 `lib/lora-candidate-receipt.ts`）。

/** 候选下发的响应头字段名。值是 base64(UTF-8 JSON) —— 候选里有中文名。 */
export const LORA_CANDIDATE_RECEIPT_HEADER = 'X-Lora-Candidates'

/**
 * 头的字节上限（base64 之后的长度）。
 *
 * ⚠ **这个数字和检索回执的 4096 不是一个量级，因为载荷不是一个量级**：回执是
 * 几行状态，候选是 6 条带导入载荷的记录 —— 实测一轮满负载（6 条 civitai，每条
 * 留 1 张样图）JSON 约 10.9KB、base64 约 14.5KB。压到 4096 的唯一结果是**每一轮
 * 都掉进最低档**，推荐卡永远导不了 —— 那不是「保守」，是把功能关掉。
 *
 * 16384 = Node 的 `maxHeaderSize` 默认值，也是这条链路上最紧的那个众所周知的
 * 限制。⚠ **单个头字段在 nginx 一类反代上的默认缓冲是 8KB**，所以这个数**没有
 * 余量可言**：降级阶梯必须真的会被走到（见 `encodeLoraCandidateReceiptHeader`），
 * 而且部署环境的真实上限要实测（风险已在任务包报告里点名）。
 */
export const LORA_CANDIDATE_RECEIPT_HEADER_MAX_BYTES = 16_384

/**
 * 降级阶梯的四档 —— **日志里要说清这一轮走到了哪一档**。
 *
 * ⚠ 掉档不是「少一行」：`minimal` 那一档没有导入载荷，卡上的确认按钮点不了；
 * `dropped` 那一档连卡都出不来（模型说了推荐，界面上什么都没有）。两者都必须
 * 在服务端日志里留痕，否则表现是「有时候有卡有时候没有」——最难查的那一类。
 */
export const LORA_CANDIDATE_RECEIPT_TIERS = {
  /** 全量卡面字段 + 导入载荷，每条留 1 张样图。 */
  full: 'full',
  /** 丢样图 URL，其余不动。 */
  noImages: 'no_images',
  /** 只够解析 picks + 渲染一张说明性的卡：没有导入载荷。 */
  minimal: 'minimal',
  /** 装不下，整体不发。 */
  dropped: 'dropped',
} as const

export type LoraCandidateReceiptTier =
  (typeof LORA_CANDIDATE_RECEIPT_TIERS)[keyof typeof LORA_CANDIDATE_RECEIPT_TIERS]

export const LORA_CANDIDATE_RECEIPT_LIMITS = {
  /**
   * 头里每条候选带几张样图。
   *
   * ⚠ 服务端归一化时留的是 `LORA_CANDIDATE_LIMITS.maxSampleImages`（4）张 ——
   * 那是给「以后卡面要横滚」留的余量。下发只留 1 张：一条 URL 约 110 字节，
   * 6 条候选各留 4 张就是 2.6KB，占满整个预算的六分之一去换一张用户不会看的图。
   */
  maxSampleImages: 1,
} as const
