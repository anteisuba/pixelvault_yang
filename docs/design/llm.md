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

- ⛔ **不换一家再试**（owner 2026-10-15：「会自动扣其他模型的 token，用户还不知道」）。
- 助手在同一家、同一把 key、同一型号上重发一次（`assistant-completion.service`）；其余调用方失败直接交回，由错误显示层说清楚（`docs/design/errors.md`）。
- 超时统一成 `PROVIDER_TIMEOUT`（入口的 `toLlmTextTimeoutError`）；上游错误由 `toLlmTextProviderError` 归类成可翻译的码。

## 5. 输出校验

- 流式必须收到正文和结束事件；拒绝 / 截断 / 空回复都抛错（`checkTextFinishReason`、`textResponseError`）。
- 结构化输出：支持的型号走原生 JSON schema（`LLM_STRUCTURED_OUTPUT_MODELS`），其余由调用方用 Zod 校验（`vision-structured-output.ts` 是范例）。

## 6. 下一步（碰到再做，不单开）

- 把 `vision-route` / `research-route` 的挑 key 逻辑并进一个 `resolveLlmRoute(userId, purpose)`，调用方不再各自挑。
- 按 `llm call` 日志做一张「本月各功能 token」小表（设置页用量旁边），等 owner 想看时再做。
- effort / thinking 预算：要重新核算各调用方的 token 上限，独立任务（见 `references/model-catalog.md`）。
