# 画布助手模型换装 —— 接入 Anthropic / Claude Sonnet 5，Qwen 退出助手（2026-07-26）

> 施工规格。执行侧读本文即可，不需要会话记忆。
> 上级文档：[`canvas-master-2026-07-26.md`](canvas-master-2026-07-26.md)（§五 工作流程的硬要求全部适用）。

## 一 · 目标与判据

助手路由（画布右侧助手 dock 顶部「助手路由」选择器）的四家变成：

| 现在             | 之后                        | 理由                                                         |
| ---------------- | --------------------------- | ------------------------------------------------------------ |
| Gemini 3.5 Flash | **保留**                    | 唯一能吃视频的一家，主线 P2「参考视频 → ScriptDoc」全靠它    |
| OpenAI GPT-5.5   | **保留**                    | 传播层（钩子/口语旁白）与通用兜底                            |
| DeepSeek V4 Pro  | **保留**                    | 中文草稿与大批量试写，性价比                                 |
| Qwen3 Max        | **退出助手**                | owner 2026-07-26 拍板；仍保留 planner + enhance 两项能力     |
| ——               | **Claude Sonnet 5（新增）** | 结构层（多场戏 / 角色弧 / 分镜连贯），画布助手的本职就是这个 |

**owner 已拍板**：Claude 只上 **Sonnet 5** 一档（`claude-sonnet-5`），不上 Opus。不够再加。

## 二 · 为什么这不是改个常量就完事

**仓里目前没有 Anthropic 这个 provider**：`AI_ADAPTER_TYPES` 没有它，`LLM_TEXT_MODEL_IDS` 没有 claude，
[`llm-text.service.ts:881`](../../src/services/llm-text.service.ts) 的 switch 只有 gemini / openai / deepseek / dashscope 四路。

两条好消息（已实读确认，别再去验）：

- **不需要 DB 迁移** —— Prisma 里 `adapterType` 是 `String`，不是 enum。
- **不需要实现流式** —— 助手把非流式结果包成流（见 `node-assistant.service.test.ts` 里 `mockResolvedValue` + `readStream`）。

## 三 · 落点清单

### 3.1 `src/constants/providers.ts`

`AI_ADAPTER_TYPES` 加 `ANTHROPIC = 'anthropic'`，随后**编译器会押着你补齐所有穷尽 Record**：

- `AI_ADAPTER_TYPE_OPTIONS` —— 要加（Claude 是 BYOK，用户会自己填 key）
- `DEFAULT_PROVIDER_CONFIGS` —— `label: 'Claude'`（不是 'Anthropic'：选择器上给用户看的是模型家族名，与 `'Qwen'` 而非 `'DashScope'` 的既有做法一致）
- `ADAPTER_KEY_HINTS` —— `'sk-ant-...'`
- `ADAPTER_DEFAULT_COSTS` —— 与 OPENAI 同档
- 文件里其余按 adapter 建的 Record（约 151 / 195 行两处）一并补齐，值参照 OPENAI

### 3.2 `src/constants/config.ts`

- `AI_PROVIDER_ENDPOINTS.ANTHROPIC = 'https://api.anthropic.com/v1'`
- `LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5 = 'claude-sonnet-5'`

### 3.3 `src/constants/llm-capability.ts`

- ~~`[AI_ADAPTER_TYPES.ANTHROPIC]: ['planner', 'assistant']`~~ → **实际是 `['assistant']`**。规格这里自相矛盾：给了 `planner` 就必须有 `SCRIPT_PLANNER_MODELS` 条目（双向断言），而 §3.4 又把那张表红线了。且 `resolveNodePlannerRoute` 有硬编码的 4-adapter 白名单，Claude 本来也路由不到 planner —— 给了是会触发回归守卫的死元数据。不给 `enhance` 的理由不变（别扩面）。
- **`[AI_ADAPTER_TYPES.DASHSCOPE]` 摘掉 `'assistant'`**，保留 `['enhance', 'planner']`

⚠ [`llm-capability.test.ts`](../../src/constants/llm-capability.test.ts) 有**双向**断言（有能力必有路由条目 / 有路由条目必有能力）。上面两条必须同时改，只改一边必红。

### 3.4 `src/constants/node-studio.ts`

`NODE_STUDIO_ASSISTANT_ROUTE_MODELS`：删掉 DASHSCOPE 条目，加

```ts
{
  adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
  modelId: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5,
  label: 'Claude Sonnet 5',
}
```

⚠ **`SCRIPT_PLANNER_MODELS`（`src/constants/script-breakdown.ts`）不动** —— Qwen3 Max 继续留在 planner 里。

### 3.5 `src/services/llm-text.service.ts` —— `anthropicTextCompletion`

在 `llmTextCompletion` 的 switch 里加一路。实现按 Anthropic **Messages API**，不是 OpenAI 兼容格式：

```
POST {baseUrl}/messages
headers:
  x-api-key: {apiKey}
  anthropic-version: 2023-06-01
  content-type: application/json
body:
  { model, max_tokens, system, messages: [{ role: 'user', content }] }
response:
  { content: [{ type: 'text', text }], stop_reason, usage }   // 取第一个 type==='text' 的 text
```

四个**必须照做**的差异点（照抄 OpenAI 分支会错）：

1. **`max_tokens` 是必填的**，不能像 OpenAI 那样省略。所以 `providerManagedOutput === true` 时不是「不传」，而是传一个宽的上限（用 `LLM_TEXT_DEFAULT_MAX_TOKENS` 里新加的 `ANTHROPIC_MANAGED` 常量，取 8192；别写魔法数字，Hard Rule 1）。
2. **系统提示走顶层 `system` 字段**，不是 `messages` 里的一条 `role:'system'`。
3. ~~**没有 `response_format`**，用 assistant 预填 `'{'` 再回拼。~~ ❌ **这条规格写错了，已作废** —— 查 `claude-api` 权威文档：**assistant-turn 预填在 Sonnet 5 上返回 400**（4.6 家族起整族移除）。
   **实际做法**：`responseFormat === 'json_object'` 时把指令追加到 **system prompt**（照 `dashscopeTextCompletion` 的先例），靠下游已有的 `parseJsonObject` + `validateLlmStructuredOutput` 兜底。测试里留了回归守卫，断言 `messages` 永远不含 `role:'assistant'`。
   **长期正解**：Anthropic 的结构化输出是 `output_config.format` + **json_schema**，但 `LlmTextInput.responseFormat` 只有无 schema 的 `'json_object'` 标志 —— 要用得先把 schema 串进 `LlmTextInput`（OpenAI 那侧也能一起受益）。**另开一片**。
4. **必须显式 `thinking: { type: 'disabled' }`**（规格漏写，实做时补入）。Sonnet 5 在 `thinking` 缺省时**默认开 adaptive thinking**，而 `max_tokens` 是「思考 + 回答」的共同上限 —— 默认 1024 可能被思考吃光导致回答截断，ScriptDoc 的 6000 也会被啃。其余四家适配器都不思考，调用方预算全按不思考算的，必须保持一致。⚠ 只在 effort ≤ `high` 时允许；本适配器从不设 `effort`（默认就是 `high`），所以合法。
5. **`imageData` / `useGrounding` 一律 throw**，措辞照 `deepseekTextCompletion` 的两个 guard。视觉留给 Gemini，本片不扩。

错误处理、`ApiRequestError`、`parseGenerationErrorCode`、logger 调用一律照同文件既有分支的写法，别自创。

### 3.6 `src/lib/validate-api-key.ts`

加 `case AI_ADAPTER_TYPES.ANTHROPIC` —— 校验 `sk-ant-` 前缀，形态照既有 case。

### 3.7 i18n（三语必须同步）

新 provider 在「添加 API key」选择器与助手路由里露出的名字。**先 grep 现有 `dashscope` / `deepseek` 的 i18n key 落在哪个 namespace**，照同一位置加 `anthropic`，别新建 namespace。

### 3.8 测试

- `llm-text.service.test.ts` 补 anthropic 分支：正常返回 · `system` 走顶层 · JSON 模式的预填与回拼 · `imageData` throw
- `llm-capability.test.ts` / `api-keys.test.ts` 现有断言应自动覆盖新枚举，红了就补，别改断言去迁就实现
- `CanvasAssistantRouteSelector.test.tsx` 若硬编码了四家名单，同步

## 四 · 红线

- **不动** DB / Prisma / 计费 / 权限 / 持久化契约
- **不动** `NODE_STUDIO_ASSISTANT.gatewayModelId`（Vercel AI Gateway 默认仍是 `openai/gpt-5.5`），本片只改 BYOK 路由表
- **不动** `SCRIPT_PLANNER_MODELS`
- 不引入 Tailwind arbitrary values（本片基本不碰 UI，碰到也守）
- 不新建 provider 之外的抽象层

## 五 · 验收

1. **全量** `tsc`（约 4 分钟）零错误 —— 只认 `src/` 下零错误，`.next/dev/types/routes.d.ts` 的幻影错忽略
2. **全量** `vitest`（约 6 分钟）全绿，禁止跑子集
3. **真机截图**：画布 → 助手 dock → 顶部「助手路由」下拉，四家显示为 **Gemini / OpenAI / DeepSeek / Claude**，Qwen 不在列
4. 汇报：改了哪些文件 · 画面哪里变了

⚠ dev server 已在 3000 由 owner 跑着 —— **不要 kill，不要另起实例，不要并行 build**。

## Last Verified

- 2026-07-26 · opus 5。落点清单来自实读：`providers.ts` 的穷尽 Record 结构、`llm-text.service.ts:879-895` 的四路 switch、`llm-capability.ts:24-49` 的能力表与其测试的双向断言、`node-script-doc.service.ts:198` 的 `responseFormat: 'json_object'`、Prisma `adapterType String`（无 enum，故无迁移）。助手路由现状四家为真机实测（助手 dock → 助手路由下拉截图）。
