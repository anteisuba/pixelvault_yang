# LLM 文本层（`o-llm`）

2026-11-01 定稿（owner 授权 Claude 自定）。管所有「把文字 / 图 / 视频交给大模型、拿回文字」的调用：助手、提示词增强、角色整理 / 心情 / 反思、拉片、评审、视觉分析、联网搜索……共 21 个调用方。

## 1. 结构（11-01 拆分后）

| 文件                                                             | 管什么                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/services/llm-text.service.ts`                               | **唯一入口**：调用方只 import 它。分派到各家、超时归一、统一调用日志                                                     |
| `src/services/llm/llm-core.ts`                                   | 共用底座：类型、响应 schema、用量解析、错误归类、传输（fetch / AI Gateway）、路由解析、图片预处理。⛔ 不 import 任何一家 |
| `src/services/llm/llm-{gemini,openai,deepseek,xai,anthropic}.ts` | 各家缓冲补全（一次请求、读完正文才返回）                                                                                 |
| `src/services/llm/llm-web-search.ts`                             | 各家自带联网搜索                                                                                                         |

依赖方向只有一条：入口 → 各家 → core。接第六家 = 新建一个 `llm-<家>.ts` + 在入口的 `completeWith` 登记一行。

⛔ **这一层没有流式**（2026-11-05 删）：原先各家自写的 SSE 通道（`llmTextStream` / `LLM_TEXT_STREAMS` / `streamOpenAiCompatibleChat` / `STREAM_HEADERS` 90 秒「多久没分片就掐」）只剩助手参考图分析一个调用方，且生产上被 `skipReferenceReview` 闸死。那个计时器会在推理模型想的时候误杀，整条删掉，参考图分析改走缓冲。要逐字出的场景（助手主对话）走 `features/assistant/kernel.ts` 的 AI SDK `streamText`，**不设静默时限**，卡死交给整次请求的时间预算。

## 2. 路由

- 调用方必须给 `adapterType` + `apiKey`（+ 可选 `modelId` / `providerConfig`）。key 由 `resolveLlmTextRoute`（指名一把）或助手那一侧的 `resolveAssistantRoute` 挑，**都按 userId 收敛**。
- ⛔ 没有平台兜底 key（owner 2026-10-07：key 全部用户自己出）。

## 3. 费用记录（11-01 新增）

- 每一次补全在入口记一行 `llm call`：`purpose`（干什么）、`adapterType`、`modelId`、`outcome`（ok / error / aborted）、`durationMs`、token（输入 / 输出 / 推理 / 缓存）。
- 之前只有助手自己记，其余 20 个调用方的花费看不见；现在全部经过入口，按 `purpose` 在 Vercel 日志里就能汇总「哪个功能花了多少」。
- 调用方传的 `onUsage` 照常收到（角色出门按它扣额度）。新调用方请带 `purpose`。

## 4. 重试与降级

11-03 起**入口一处管全部调用方**（`llmTextCompletion`，参数在 `LLM_TEXT_RETRY`）：

- 同一家、同一把 key、同一型号、同一请求**原样重发一次**。⛔ **不换一家再试**（owner 2026-10-15：「会自动扣其他模型的 token，用户还不知道」）。⛔ 同家也不换备用型号（owner 2026-11-03 选「不换，只重发一次」）。
- 重发的只有三种：provider 自己说忙（503 / 529 / 其余 5xx）等 1.5s；限流 429 等 3s；连接断（fetch failed / ECONNRESET…）等 0.5s。判断在 `getLlmTextRetryReason`。
- 不重发：key 失效、余额不足、上下文超限（助手自己压缩后重发，`assistant-completion.service`）、拒答、空回复 / 截断、**超时**（再等一轮只会翻倍等待，常常撞上路由 `maxDuration`）。
- 时限保护按**这次请求剩下的时间**判（11-05 起）：路由工厂把路由的 `maxDuration` 记成截止时刻（`lib/request-deadline.ts`，没写按平台默认 300 秒），缓冲补全等「剩余 − 8 秒余量」，剩下不足 5 秒就不发 / 不重发；路由外（脚本 / 测试）才用固定 120 秒、「第一次失败慢于 20s 不重发」。⚠ 路由文件 `export const maxDuration` 必须同时交给工厂（`maxDuration,`）或手写路由自己 `runWithRequestDeadline` —— `src/app/api/route-max-duration.test.ts` 锁着。调大模型的路由时限一律 ≥ 300（Fluid 按实际用时计费，写短只会被平台先杀成不带原因的 504）。等待中用户点停止立即收手。
- 每次尝试各记一行 `llm call`（带 `attempt`），重发另记一行 `llm retry`（原因 / 等多久）。
- ⛔ 调用方不再各自包传输层重试：视觉结构化输出、Seedance 分镜只重打「输出不合规」和自己的墙钟超时；评审器、助手的 503 重发已拆掉。
- 上游错误由 `toLlmTextProviderError` 归类成可翻译的码（11-03 起 5xx 算「暂时不可用」，不再叫人换 key）。
- ⛔ **「超时」按是谁的时限分开说**（owner 2026-11-05：「AI 提供商超时」不准确）：
  - `PROVIDER_TIMEOUT` = **我们自己**等到这次请求的时限先停（`toLlmTextTimeoutError`），赶在平台杀函数之前把原因说清；文案不写具体秒数（各路由时限不同）；
  - `PROVIDER_UPSTREAM_TIMEOUT` = **厂商 / 网关自己**超时（408 / 504 / 524，或流里原话写着 timed out），重发规则同 5xx；
  - `PROVIDER_UNREACHABLE` = 连不上或连接中途断（重发一次后仍断），点明「不是 key 的问题」；
  - 助手那边另有 `ASSISTANT_TIME_BUDGET_EXHAUSTED` = 请求到了时间预算硬线（`hardMs`）一步都没跑完。
  - 助手模型请求走 `aiGatewayFetch`，带 undici `Agent({ headersTimeout: 0, bodyTimeout: 0 })`：Node fetch 默认流上静默 300 秒就断，会误杀想得久的模型（OpenAI / Grok 的 Responses 不流思考）。

## 5. 输出校验

- 拒绝 / 截断 / 空回复都抛错（`checkTextFinishReason`、`textResponseError`）。
- 结构化输出：支持的型号走原生 JSON schema（`LLM_STRUCTURED_OUTPUT_MODELS`），其余由调用方用 Zod 校验（`vision-structured-output.ts` 是范例）。

## 6. 下一步（碰到再做，不单开）

- 把 `vision-route` / `research-route` 的挑 key 逻辑并进一个 `resolveLlmRoute(userId, purpose)`，调用方不再各自挑。
- 按 `llm call` 日志做一张「本月各功能 token」小表（设置页用量旁边），等 owner 想看时再做。
- effort / thinking 预算：要重新核算各调用方的 token 上限，独立任务（见 `references/model-catalog.md`）。
