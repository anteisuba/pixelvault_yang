# Replicate — Prediction API

> **Official Docs**: https://replicate.com/docs/reference/http
> **Last verified**: 2026-03-28

---

## Overview

Replicate 采用异步 prediction 模型：提交请求后轮询结果。
支持 text-to-image、image-to-image、视频生成。
Model ID 格式为 `owner/name`。

## Authentication

| Field      | Value                                    |
| ---------- | ---------------------------------------- |
| Header     | `Authorization: Bearer {apiKey}`         |
| Key format | `r8_...`                                 |
| Obtain at  | https://replicate.com/account/api-tokens |

## Endpoints

| Action            | Method | URL                                                  |
| ----------------- | ------ | ---------------------------------------------------- |
| Create Prediction | POST   | `https://api.replicate.com/v1/predictions`           |
| Poll Prediction   | GET    | `https://api.replicate.com/v1/predictions/{id}`      |
| Get Model         | GET    | `https://api.replicate.com/v1/models/{owner}/{name}` |

## Request — Create Prediction

```json
{
  "model": "ideogram-ai/ideogram-v2",
  "input": {
    "prompt": "A detailed portrait in watercolor",
    "aspect_ratio": "1:1",
    "negative_prompt": "blurry",
    "guidance_scale": 7.5,
    "num_inference_steps": 28,
    "seed": 42,
    "image": "https://... or base64",
    "strength": 0.3,
    "duration": 5
  }
}
```

### Parameters

| Parameter                   | Type   | Required | Default | Range                               |
| --------------------------- | ------ | -------- | ------- | ----------------------------------- |
| `model`                     | string | ✅       | —       | `owner/name` format                 |
| `input.prompt`              | string | ✅       | —       |                                     |
| `input.aspect_ratio`        | string | ✅       | —       | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| `input.negative_prompt`     | string | —        | —       |                                     |
| `input.guidance_scale`      | number | —        | 7.5     | 1–20 (step 0.5)                     |
| `input.num_inference_steps` | number | —        | 28      | 1–50                                |
| `input.seed`                | number | —        | random  |                                     |
| `input.image`               | string | —        | —       | URL or base64 (for i2i)             |
| `input.strength`            | number | —        | 0.7     | 0.01–0.99                           |
| `input.duration`            | number | —        | —       | Video duration (seconds)            |

## Response — Prediction

```json
{
  "id": "xyz789",
  "status": "starting",
  "output": null,
  "error": null
}
```

### Prediction Status Values

| Status       | Meaning             |
| ------------ | ------------------- |
| `starting`   | 模型正在启动        |
| `processing` | 生成中              |
| `succeeded`  | 完成，output 有结果 |
| `failed`     | 失败，error 有详情  |
| `canceled`   | 已取消              |

### Output Format

Output 格式因模型而异，adapter 处理以下情况：

- `string` — 直接是图片 URL
- `string[]` — 取第一个 URL
- `{ url: string }` — 取 url 字段

## Polling Strategy

```
初始延迟:    1,000 ms
最大延迟:    8,000 ms
总超时:     180,000 ms (3 分钟)
策略:       指数退避 (delay = min(delay × 2, 8000))
```

## Capabilities

- ✅ Text-to-Image / Image-to-Image
- ✅ Negative prompt, Guidance scale, Steps, Seed
- ✅ Reference image with strength
- ✅ Video generation (async polling)
- ✅ Image Analysis
- Max 1 reference image

## Error Handling

- HTTP 错误抛出 `ProviderError('Replicate', statusCode, detail)`
- Prediction 失败时从 `error` 字段提取详情
- 超时保护（3 分钟后中止）
- Health check 验证 model ID 格式（`owner/name`）

## Adapter Implementation

`src/services/providers/replicate.adapter.ts`

**注意**: Model ID 必须是 `owner/name` 格式，否则 health check 会直接返回 error。

## Connection Strategy

> 详细决策矩阵见 [`connection-strategy.md`](connection-strategy.md)。

| 维度                   | 设置                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 区域可达性             | 海外直连 ✅；国内直连 ⚠️（不稳定，偶发 TLS 握手失败、握手后又断）                                                  |
| 默认 base URL          | `https://api.replicate.com/v1/predictions`（`AI_PROVIDER_ENDPOINTS.REPLICATE`）                                    |
| Per-route 覆盖         | `providerConfig.baseUrl`                                                                                           |
| 国内中转候选           | Cloudflare AI Gateway 支持 Replicate：`https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/replicate` |
| Polling 总超时         | **180s**（3 分钟）                                                                                                 |
| Polling backoff        | 1s → 8s 指数退避（`min(delay × 2, 8000)`）                                                                         |
| 重试                   | 5xx + 429 + 网络错误重试；503/504 不重试                                                                           |
| Failed prediction 处理 | 从 prediction `error` 字段提取详情，不重试（业务错误）                                                             |

**国内部署痛点**：Replicate 的 prediction polling 需要 3 分钟内多次往返；任何一次握手失败都会导致整个 generation 失败。**强烈推荐国内边缘部署走 Cloudflare AI Gateway** 而不是直连。

**Cold start 注意**：Replicate 的某些模型（特别是非热门 owner）会有 30–90s 的容器冷启动；这部分会被算到 polling 总超时里。如果模型经常超 180s 才返回，要么扩大 model 级的 `timeoutMs`，要么考虑该模型不适合放在 Replicate（fal.ai 的 GPU 池更暖）。
