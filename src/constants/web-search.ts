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
 * `/search` 共用 `SERPER_API_KEY`，所以接这条不需要任何新凭据（选型报告
 * `docs/plans/web-search-import-source-eval-2026-08-30.md` 拍板段）。
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
