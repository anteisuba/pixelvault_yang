/**
 * 语义检索（按意思搜）：`workers/semantic-index`（Workers AI 转向量 + Vectorize 存取）。
 * 方案与实测见 docs/references/semantic-search.md。
 */
export const SEMANTIC_SEARCH = {
  /** 按意思搜只是在字面搜索后面补几条：等它最多这么久，超了当没有，字面结果照出。 */
  QUERY_TIMEOUT_MS: 3000,
  /** 写入（脚本 / 同步）一次 1000 条要转 32 批向量，给足时间。 */
  UPSERT_TIMEOUT_MS: 60_000,
  /** 一次写多少条（Worker 端上限 1000）。 */
  UPSERT_BATCH: 500,
  /** 公共库（Danbooru 标签、Civitai LoRA）放这一区；以后每个用户自己的东西各一区。 */
  PUBLIC_NAMESPACE: 'public',
  KINDS: {
    DANBOORU_TAG: 'danbooru-tag',
  },
  /**
   * 分数低于它当没对上：库里总有「最近的」几条，词不达意时也会回来。
   * 2026-10-25 线上实测（14.8 万标签）：对上的 0.6–0.73（猫耳の女の子→cat_ears 0.67、
   * 赛博朋克风→cyberpunk 0.73、鬼灭之刃→kimetsu_no_yaiba 0.69），乱打的字最高 0.52。
   */
  MIN_SCORE: 0.55,
} as const

export type SemanticKind =
  (typeof SEMANTIC_SEARCH.KINDS)[keyof typeof SEMANTIC_SEARCH.KINDS]

/**
 * 搜自己的东西（图 / 提示词 / 角色 / LoRA）：先把搜索词翻成几个 Danbooru 标签（中日文词库 +
 * 按意思），再拿这些词字面搜，接在原来的结果后面（语义检索第 3 块，2026-10-26）。
 * ⛔ 给自己的东西另算向量：同日拿 400 张图实测，标签串整段算向量意思被冲淡，搜「下雨」13 张
 *   写了 rain 的一张没对上，乱打的字分数差不多（0.24 vs 0.23）。
 */
export const SEARCH_EXPANSION = {
  /** 只翻这几类：通用 0 · 作品 3 · 角色 4（画师、meta 不是在说画面里有什么）。 */
  CATEGORIES: [0, 3, 4],
  /** 词库里对上的取前几个（按作品数）。 */
  LOCAL_LIMIT: 3,
  /** 按意思对上的取前几个（已按 MIN_SCORE 去掉对不上的）。 */
  MEANING_LIMIT: 3,
  MAX_WORDS: 5,
  /** 搜索词里最多翻几个词（空格、逗号分开的）。 */
  MAX_PARTS: 3,
  /** 同一句话翻过的记在进程里：库页面边打边搜。 */
  CACHE_SIZE: 500,
  CACHE_TTL_MS: 10 * 60_000,
  /** 字面结果排满了，翻译那边最多再等这么久（同 LoRA 大库、标签库）。 */
  BUDGET_MS: 300,
  /** 拿翻出来的词再搜几条（接在字面结果后面）。 */
  EXTRA_LIMIT: 30,
  /** 先粗筛（不分整词）多少条候选，再按整词筛。 */
  CANDIDATE_LIMIT: 300,
  /** 库页面打字停多久才去翻。 */
  DEBOUNCE_MS: 300,
  MAX_QUERY_CHARS: 100,
} as const
