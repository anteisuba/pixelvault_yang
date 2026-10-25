/**
 * 认图（PixAI Tagger v1.0，跑在 Modal、经 execution Worker 转发）。
 * style 一类 4917 个标签，绝大多数是画师名 —— 助手反推画风靠它。
 */
export const IMAGE_TAGGER = {
  /** 冷启动（拉镜像 + 载 1.9 GB 权重）实测要几十秒；热着一张约 5 秒。 */
  TIMEOUT_MS: 90_000,
  /** 认过的存在这张图的 snapshot 里，下次直接读。 */
  SNAPSHOT_KEY: 'tagger',
  /** 结果里记下是哪一版模型认的：换版后旧结果作废重认。 */
  MODEL_VERSION: 'pixai-tagger-v1.0',
  /** 一次 look 最多认几张（每张都要几秒）。 */
  MAX_PICTURES_PER_LOOK: 4,
  /** 给助手看的：每类最多列几个。 */
  SHOWN: { style: 8, character: 6, copyright: 4, general: 30, meta: 4 },
} as const
