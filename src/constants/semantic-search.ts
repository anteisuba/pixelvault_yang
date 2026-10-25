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
