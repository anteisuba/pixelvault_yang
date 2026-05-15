# Provider 连接策略

> **Last verified**: 2026-05-15
> 本文档统一说明每个 AI provider 的网络连接方式、区域可达性、超时与重试设置，以及在出现"慢/不稳定"时的诊断路径。
> 单个 provider 的请求/响应细节请看 `openai.md` / `gemini.md` / `fal.md` / 等专属文档。

---

## TL;DR — 为什么慢/不稳

在排查"调用慢 / 不稳定"前，先确认问题属于哪一类：

| 现象                                                                    | 大概率原因                           | 处理路径                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| 本地 `npm run dev` 调 OpenAI / Gemini 偶发 `ETIMEDOUT` / `fetch failed` | 国内本地网络无法直连 Google / OpenAI | 走 SiliconFlow 中转 base URL（见下文）或本地配置代理                         |
| 部署到 Vercel 后第一次调用很慢（5–10s 启动）                            | Vercel 冷启动 + Node runtime 初始化  | 不动；走 ISR / 已经是 server action 不是冷启动问题                           |
| `seedance-2.0` / `kling-v3-pro` 提交后等几分钟才出                      | 视频是异步 queue，正常排队           | 检查 `submitVideoToQueue` 是否成功；超时 300s 是模型自身建议值               |
| 503 "high demand" / 504 timeout 立即抛错                                | 上游 provider 当下负载高             | `withRetry` 已对 503/504 不重试（避免双扣费），fallback 链会跨 provider 兜底 |
| Gemini Pro 频繁 503                                                     | Gemini Pro Preview 持续容量紧张      | 已在 `PROVIDER_FALLBACK_MAP` 配置 → Flash → GPT Image 2                      |
| fal.ai queue 长期 IN_PROGRESS                                           | fal 自身 GPU 排队                    | 不可优化；已用 30s polling 间隔，不要更频繁（会被 rate limit）               |

代码层 100% 直连，**没有引入任何 HTTP / SOCKS 代理 agent**。如果未来需要跨网走代理，统一在 `src/lib/fetch-client.ts`（待建）通过 `undici.ProxyAgent` + `setGlobalDispatcher` 注入，不要在每个 adapter 里散落处理。

---

## 决策矩阵：直连 / 中转 / 代理

| Provider          | 区域可达性                                                       | 默认 base URL                                             | 建议中转 / 代理                                                      | 何时切换                                 |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| **OpenAI**        | 海外直连 ✅；国内直连 ❌                                         | `https://api.openai.com/v1/images`                        | `OPENAI_BASE_URL` env 覆盖到 SiliconFlow / 自建代理                  | 本地国内开发 / 国内边缘节点部署          |
| **Google Gemini** | 海外直连 ✅；国内直连 ❌                                         | `https://generativelanguage.googleapis.com/v1beta/models` | `GEMINI_BASE_URL` env 覆盖到 SiliconFlow（`/v1beta`）或聚合 API 中转 | 本地国内开发 / 国内边缘节点部署          |
| **fal.ai**        | 海外直连 ✅；国内直连 ✅（部分省份偶发慢）                       | `https://fal.run` + `https://queue.fal.run`               | 国内不必中转；如果延迟敏感可走 Cloudflare AI Gateway                 | 仅 observability / 限流需求时            |
| **Replicate**     | 海外直连 ✅；国内直连 ⚠️（不稳，偶发握手失败）                   | `https://api.replicate.com/v1/predictions`                | Cloudflare AI Gateway 兼容 endpoint                                  | 国内边缘部署 + 长轮询场景                |
| **HuggingFace**   | 海外直连 ✅；国内直连 ⚠️（部分模型 cold start 久）               | `https://router.huggingface.co/hf-inference/models`       | 暂无成熟中转方案；建议用 fal.ai 重新托管 SD/Animagine                | 国内 cold start > 30s 持续出现时考虑下线 |
| **NovelAI**       | 海外直连 ✅；国内直连 ⚠️（image.novelai.net 偶尔被中间网络丢包） | `https://image.novelai.net`                               | 无中转方案；这个 provider 强绑账户订阅                               | —                                        |
| **VolcEngine**    | 国内直连 ✅；海外直连 ⚠️（要走火山方舟海外节点）                 | `https://ark.cn-beijing.volces.com/api/v3`                | 国内直接用；海外部署需切换到 `ark.ap-southeast-1.volces.com`         | Vercel/Render 海外区部署时考虑切节点     |
| **Fish Audio**    | 海外直连 ✅；国内直连 ✅                                         | `https://api.fish.audio`                                  | —                                                                    | —                                        |

---

## ProviderConfig.baseUrl 覆盖机制

`ProviderConfig.baseUrl` 是 `UserApiKey.providerConfig` 的字段，每个 user route 都可以独立覆盖。两层 fallback：

```
adapter 调用时使用的 baseUrl
  = providerConfig.baseUrl              (用户在 Studio 配的 route)
 || AI_PROVIDER_ENDPOINTS.<PROVIDER>    (src/constants/config.ts 的全局默认)
```

这意味着用户**不需要改代码就能换 endpoint**。例如要让某个用户的 OpenAI route 走 SiliconFlow 中转：

1. Studio → API 管理 → 编辑该 OpenAI route
2. 把 `baseUrl` 从 `https://api.openai.com/v1/images` 改成 `https://api.siliconflow.cn/v1/images`
3. 把 `apiKey` 换成对应中转商的 key

服务端默认 fallback key（`OPENAI_API_KEY` env）始终走 `AI_PROVIDER_ENDPOINTS.OPENAI`，不受用户 route 影响。

### 何时改 `AI_PROVIDER_ENDPOINTS` 全局默认

| 改全局默认值 | 情况                                                       |
| ------------ | ---------------------------------------------------------- |
| ✅ 应该改    | 整个项目重新部署到不同区域（如全量切换到火山方舟海外节点） |
| ✅ 应该改    | 官方 endpoint 升级版本（如 Gemini 从 `v1beta` → `v1`）     |
| ❌ 不要改    | 单个用户网络问题 → 用 user route baseUrl 覆盖              |
| ❌ 不要改    | 临时测试某个中转 → 用 env var 临时覆盖                     |

---

## 现行重试 / 熔断策略

文件位置：

- `src/lib/with-retry.ts` — 指数退避 + jitter
- `src/lib/circuit-breaker.ts` — 单 provider 失败窗口熔断
- `src/constants/providers.ts` — `PROVIDER_FALLBACK_MAP`（跨 provider 兜底）

### 重试规则（默认 + image generation 覆盖）

| 错误类型                                                                  | 默认 `withRetry` |                  `generateImage` 覆盖                  |
| ------------------------------------------------------------------------- | :--------------: | :----------------------------------------------------: |
| 5xx (≥500)                                                                |     ✅ 重试      |              ✅ 重试，**除了 503 / 504**               |
| 503 "UNAVAILABLE" / "high demand"                                         |     ✅ 重试      | ❌ **不重试**（spike 通常持续数分钟，1.5s 退避无意义） |
| 504 timeout                                                               |     ✅ 重试      |  ❌ **不重试**（上游可能已接受任务，重试会重复扣费）   |
| 429 rate limit                                                            |     ✅ 重试      |                        ✅ 重试                         |
| Network errors (`ECONNRESET`/`ETIMEDOUT`/`fetch failed`/`socket hang up`) |     ✅ 重试      |                        ✅ 重试                         |
| 4xx (除 429)                                                              |        ❌        |                           ❌                           |

`maxAttempts: 2` + `baseDelayMs: 1500`（即一次原始请求 + 一次重试，总等待 ~1.8–2.3s）。

### 跨 provider fallback

`PROVIDER_FALLBACK_MAP` 只在 **free tier**（用平台 key）触发。BYOK 用户不会被静默切到别家 provider —— 因为我们没有用户的 fallback provider key。当前映射（`src/constants/providers.ts`）：

```
gemini-3-pro-image-preview     → gemini-3.1-flash-image-preview
gemini-3.1-flash-image-preview → gpt-image-2
gpt-image-2                    → gemini-3.1-flash-image-preview
flux-2-pro                     → gemini-3.1-flash-image-preview
flux-2-dev                     → flux-2-schnell
ideogram-3                     → gemini-3.1-flash-image-preview
recraft-v4-pro                 → gemini-3.1-flash-image-preview
```

新增 fallback 时遵循：**output type 一致 + qualityTier 相近 + 用 free tier 已经接入的模型**。

---

## 超时配置一览

| Provider / 操作             |        默认 timeoutMs        | 覆盖位置                                                           |
| --------------------------- | :--------------------------: | ------------------------------------------------------------------ |
| OpenAI generateImage        |    health check timeoutMs    | `openai.adapter.ts`                                                |
| Gemini generateImage        |       **60_000** (60s)       | `gemini.adapter.ts:120` — 写死，原 230s 在 503 时会让用户等 4 分钟 |
| Gemini health check         |    health check timeoutMs    | `gemini.adapter.ts`                                                |
| fal generateImage           | model `timeoutMs` 或 default | `fal.adapter.ts`                                                   |
| fal queue submit            |         **120_000**          | `fal.adapter.ts`                                                   |
| fal queue status poll       |          **30_000**          | `fal.adapter.ts`                                                   |
| fal queue result fetch      |          **30_000**          | `fal.adapter.ts`                                                   |
| Replicate prediction        | model `timeoutMs` 或 default | `replicate.adapter.ts`                                             |
| Replicate polling 总超时    |     **180_000**（3 min）     | `replicate.adapter.ts`（per-poll exp backoff 1s → 8s）             |
| HuggingFace generateImage   | model `timeoutMs` 或 default | `huggingface.adapter.ts`                                           |
| NovelAI generateImage       | model `timeoutMs` 或 default | `novelai.adapter.ts`                                               |
| VolcEngine image generation | model `timeoutMs` 或 default | `volcengine.adapter.ts`                                            |
| VolcEngine video queue      |   300_000（视频统一 5min）   | `volcengine.adapter.ts`                                            |
| Fish Audio TTS              |          **60_000**          | `fish-audio.adapter.ts` (`audio.ts: timeoutMs`)                    |

每个模型可以在 `src/constants/models/{image,video,audio,model-3d}.ts` 设置 `timeoutMs` 覆盖 adapter 默认。

**视频模型当前都是 300s**（`kling-v3-pro` / `veo-3.1` / `seedance-2.0` / `seedance-1.5-pro`），这是因为 1080p / 高码率视频生成本身常需 60–180s + 队列等待。

---

## 国内开发 / 部署的具体做法

### 场景 1：本地 `npm run dev` 在国内调 OpenAI / Gemini 失败

**最快解法 — 用 SiliconFlow 中转**（项目 `.env.local` 已经预留 `SILICONFLOW_API_KEY`，但代码尚未自动接管）：

1. 在 SiliconFlow 控制台开通对应模型（OpenAI 兼容只覆盖 LLM；图像模型用 SiliconFlow 自有 `Kwai-Kolors` / `FLUX` 等）
2. Studio → API 管理 → 添加 route，`adapterType` 选 `openai`，`baseUrl` 改成 `https://api.siliconflow.cn/v1/images`
3. 用 SiliconFlow API key

**注意**：SiliconFlow 不能"完全代替" OpenAI / Gemini —— 它转发的是开源模型，并不是 GPT Image 2 / Gemini Pro Image 本体。如果你必须用 OpenAI / Gemini 原生模型，要么本地配代理（系统级 `HTTPS_PROXY`，Node 18+ 的 `undici` 会读取），要么部署到 Vercel/Cloudflare 让服务端去调。

### 场景 2：部署到 Vercel / Cloudflare 海外节点

直接用各 provider 默认 endpoint，**不要中转**。海外节点直连 OpenAI / Gemini / fal / Replicate 都是稳的，加中转反而增加一跳延迟。

### 场景 3：部署到国内（阿里云 / 腾讯云）

- VolcEngine / Fish Audio / SiliconFlow → 用国内默认 endpoint
- OpenAI / Gemini → 必须挂中转（推荐 SiliconFlow 兼容 endpoint 或自建 Cloudflare Worker 转发）
- fal.ai / Replicate → 走 Cloudflare AI Gateway（`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/<provider>`）—— 国内→Cloudflare 大多数地区可达且加速明显

---

## 诊断 checklist

排查"某个 provider 慢/失败"时按顺序检查：

1. **是不是 503/504？** 查 `logger.error('... generateImage failed', { status, ... })` —— 503/504 不是网络问题，是上游负载，等几分钟自然恢复
2. **是不是网络层？** 在服务器上 `curl -I {baseUrl}` 看握手时间
3. **是不是 cold start？** Vercel function 冷启动 1–3s 是正常；用 `vercel logs --since=10m` 看
4. **是不是模型本身？** Hunyuan / Kling V3 这些大模型本身 30–60s 是正常的
5. **是不是 BYOK key 失效？** 在 Studio → API 管理点 "测试连接"（走 `apiKey.service.ts` 的 healthCheck）
6. **是不是 retry/circuit breaker 把请求拦了？** 看 `logger.warn('... circuit breaker open')`

---

## 不该做的事

- ❌ 在 adapter 里硬编码代理 URL — 用 `providerConfig.baseUrl` 覆盖
- ❌ 把 `maxAttempts` 调到 ≥3 — 会让用户等 5–10s 才看到失败，且重复扣费
- ❌ 给 503 加重试 — 上游明确说"现在不行" — 1.5s 后还是不行
- ❌ 在 client 端调 provider — 所有 AI 调用必须走 server (`src/services/`) — adapter 都有 `'server-only'` 守卫
- ❌ 拷贝/暴露 user 的 BYOK key 到日志 / 错误响应 — `logger.error` 已脱敏，不要新增打印 `apiKey` 的代码
