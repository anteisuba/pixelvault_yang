# LLM 文本层（`o-llm`）

2026-11-01 定稿（owner 授权 Claude 自定）。管所有「把文字 / 图 / 视频交给大模型、拿回文字」的调用：助手、提示词增强、角色整理 / 心情 / 反思、拉片、评审、视觉分析、联网搜索……共 21 个调用方。

## 1. 结构（11-01 拆分后）

| 文件                                                             | 管什么                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/llm-text.service.ts`                               | **唯一入口**：调用方只 import 它。分派到各家、超时归一、统一调用日志                                                           |
| `src/services/llm/llm-core.ts`                                   | 共用底座：类型、响应 schema、用量解析、错误归类、传输（fetch / SSE / AI Gateway）、路由解析、图片预处理。⛔ 不 import 任何一家 |
| `src/services/llm/llm-{gemini,openai,deepseek,xai,anthropic}.ts` | 各家补全 + 流式。DeepSeek / xAI 复用 OpenAI 的流式读法                                                                         |
| `src/services/llm/llm-web-search.ts`                             | 各家自带联网搜索                                                                                                               |

依赖方向只有一条：入口 → 各家 → core。接第六家 = 新建一个 `llm-<家>.ts` + 在入口的 `LLM_TEXT_STREAMS` 与 `completeWith` 各登记一行（`LLM_TEXT_STREAMS` 是穷举 Record，漏写 tsc 当场报）。

## 2. 路由

- 调用方必须给 `adapterType` + `apiKey`（+ 可选 `modelId` / `providerConfig`）。key 由 `resolveLlmTextRoute`（指名一把）或助手那一侧的 `resolveAssistantRoute` 挑，**都按 userId 收敛**。
- ⛔ 没有平台兜底 key（owner 2026-10-07：key 全部用户自己出）。

## 3. 费用记录（11-01 新增）

- 每一次补全 / 流式在入口记一行 `llm call`：`purpose`（干什么）、`mode`、`adapterType`、`modelId`、`outcome`（ok / error / aborted）、`durationMs`、token（输入 / 输出 / 推理 / 缓存）。
- 之前只有助手自己记，其余 20 个调用方的花费看不见；现在全部经过入口，按 `purpose` 在 Vercel 日志里就能汇总「哪个功能花了多少」。
- 调用方传的 `onUsage` 照常收到（角色出门按它扣额度）。新调用方请带 `purpose`。

## 4. 重试与降级

11-03 起**入口一处管全部调用方**（`llmTextCompletion` / `llmTextStream`，参数在 `LLM_TEXT_RETRY`）：

- 同一家、同一把 key、同一型号、同一请求**原样重发一次**。⛔ **不换一家再试**（owner 2026-10-15：「会自动扣其他模型的 token，用户还不知道」）。⛔ 同家也不换备用型号（owner 2026-11-03 选「不换，只重发一次」）。
- 重发的只有三种：provider 自己说忙（503 / 529 / 其余 5xx，流里 `server_error` 一类）等 1.5s；限流 429 等 3s；连接断（fetch failed / ECONNRESET…）等 0.5s。判断在 `getLlmTextRetryReason`。
- 不重发：key 失效、余额不足、上下文超限（助手自己压缩后重发，`assistant-completion.service`）、拒答、空回复 / 截断、**超时**（再等一轮只会翻倍等待，常常撞上路由 `maxDuration`）。
- 第一次失败来得比 20s 慢也不重发（时限保护）；流式**已经吐出过字就绝不重发**；等待中用户点停止立即收手。
- 每次尝试各记一行 `llm call`（带 `attempt`），重发另记一行 `llm retry`（原因 / 等多久）。
- ⛔ 调用方不再各自包传输层重试：视觉结构化输出、Seedance 分镜只重打「输出不合规」和自己的墙钟超时；评审器、助手的 503 重发已拆掉。
- 超时统一成 `PROVIDER_TIMEOUT`（入口的 `toLlmTextTimeoutError`）；上游错误由 `toLlmTextProviderError` 归类成可翻译的码（11-03 起 5xx 一律算「暂时不可用」，不再叫人换 key）。

## 5. 输出校验

- 流式必须收到正文和结束事件；拒绝 / 截断 / 空回复都抛错（`checkTextFinishReason`、`textResponseError`）。
- 结构化输出：支持的型号走原生 JSON schema（`LLM_STRUCTURED_OUTPUT_MODELS`），其余由调用方用 Zod 校验（`vision-structured-output.ts` 是范例）。

## 6. 下一步（碰到再做，不单开）

- 把 `vision-route` / `research-route` 的挑 key 逻辑并进一个 `resolveLlmRoute(userId, purpose)`，调用方不再各自挑。
- 按 `llm call` 日志做一张「本月各功能 token」小表（设置页用量旁边），等 owner 想看时再做。
- effort / thinking 预算：要重新核算各调用方的 token 上限，独立任务（见 `references/model-catalog.md`）。
