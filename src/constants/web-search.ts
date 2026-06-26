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

export const URL_READER = {
  jinaEndpoint: 'https://r.jina.ai/',
  timeoutMs: 15_000,
  maxContentLength: 6000,
  /** Cap URLs read per research turn so one message can't fan out unbounded. */
  maxUrlsPerTurn: 3,
} as const
