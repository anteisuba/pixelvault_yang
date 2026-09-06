/**
 * Web research config — Serper (Google search API) + Jina Reader (URL → clean
 * markdown). Both are platform-keyed: Serper via `SERPER_API_KEY` (required to
 * enable live search), Jina via optional `JINA_API_KEY` (anonymous works, the
 * key only raises rate limits). Search/fetch are decoupled from the LLM so any
 * writing model (incl. DeepSeek/Qwen) can use the gathered context.
 */
export const WEB_SEARCH = {
  serperEndpoint: 'https://google.serper.dev/search',
  defaultNumResults: 6,
  maxNumResults: 10,
  timeoutMs: 12_000,
  maxSnippetLength: 600,
} as const

/**
 * 联网**搜图**（工作台助手 P3-B）。
 *
 * ⚠ 与上面的 `WEB_SEARCH` **同 key 同域、不同路径** —— Serper 的 `/images` 与
 * `/search` 共用 `SERPER_API_KEY`，所以接这条不需要任何新凭据。这也是选型拍板的
 * 理由：三家 SERP 代理里 Serper 是项目已接的那家、最便宜（$1/1k），且是**唯一在
 * ToS 里给保留权**的——SerpApi 的缩略图 31 天过期，SearchAPI 的保障条款点名排除
 * storage。
 *
 * ⛔ **搜索只出预览候选，本身不落任何东西**（owner 2026-08-30 原话：「主要是给个
 * 预览的功能，用户确定了再落 R2」）。转存是另一条腿：用户点选 →
 * `POST /api/studio/web-image-import`。两条腿分开不是洁癖 —— 助手的工具环里
 * 一旦够得着上传/落库模块，钱闸那份 import 白名单就守不住了。
 *
 * ⚠ Serper credits 是真钱（免费池 2500 次），所以 `maxNumResults` 不是防御性大数：
 * 一次调用就是一个 credit，档位开大只会让每一步更贵而候选质量不变。
 */
export const WEB_IMAGE_SEARCH = {
  serperEndpoint: 'https://google.serper.dev/images',
  defaultNumResults: 8,
  maxNumResults: 12,
  timeoutMs: 12_000,
  /** 候选标题（图片所在页的标题）在日志条里只是一行小字。 */
  maxTitleLength: 120,
} as const

export const URL_READER = {
  jinaEndpoint: 'https://r.jina.ai/',
  timeoutMs: 15_000,
  maxContentLength: 6000,
  /** Cap URLs read per research turn so one message can't fan out unbounded. */
  maxUrlsPerTurn: 3,
} as const

/**
 * 找**角色官方设定图**时往查询里加的限定词（助手检索线，2026-09-06）。
 *
 * ── 为什么是三条语言，而不是一条英文 ──────────────────────────────
 * 🔬 owner 的真实用例是《无限大》（Ananta）的「时夜」：这类作品的一手立绘发在
 * 中文/日文官方渠道，英文关键词只搜得到二手转载与攻略站。一条英文查询的表现
 * 就是「搜到一句台词就放弃」——不是搜索坏了，是问错了语言。
 *
 * ⚠ 每条 = 一个 Serper credit，所以由 `ASSISTANT_RESEARCH_LIMITS.maxImageQueryVariants`
 * 封顶（默认 3），⛔ 别在这里往下续第四条第五条。
 * ⚠ 只有模型给了 `subject` 且 `preferOfficial` 时才铺开；不给 subject 的普通搜图
 * 仍是**一条查询一个 credit**，与切片 3b 的成本形状不变。
 */
export const WEB_IMAGE_OFFICIAL_QUERY_SUFFIXES = [
  /** 中文圈：官方设定图/立绘的通用叫法。 */
  '官方 立绘 设定图',
  /** 日文圈：公式設定資料集/キャラクターデザイン。 */
  '公式 設定資料 キャラクターデザイン',
  /** 英文兜底：官方角色美术。 */
  'official character art reference sheet',
] as const

/**
 * 不要求「官方」时的主体查询变体 —— 只加一个通用的「角色参考」限定，
 * ⛔ 不加「官方」那类会把召回收得太窄的词。
 */
export const WEB_IMAGE_SUBJECT_QUERY_SUFFIXES = [
  'character reference',
  '角色 参考图',
] as const
