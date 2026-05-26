# OpenAI — GPT Image 2 API

> **Official Docs**:
>
> - https://developers.openai.com/api/docs/models/gpt-image-2
> - https://developers.openai.com/api/docs/guides/image-generation
> - https://platform.openai.com/docs/api-reference/images/create-edit
>   **Last verified**: 2026-04-23

---

## Overview

当前仓库的 OpenAI 图片接入已切到 `gpt-image-2`。

官方文档当前明确：

- `gpt-image-2` 是 OpenAI 当前单独列出的 GPT Image 2 模型页，对应图像生成与编辑。
- `gpt-image-2` 支持 `v1/images/generations` 与 `v1/images/edits`。
- 通过 Responses API 还可以做会话内图像生成、图像上下文输入和多轮编辑。

当前仓库 adapter 仍走 Image API 两个端点，不使用 Responses API 图像工具模式。

## Authentication

| Field      | Value                                |
| ---------- | ------------------------------------ |
| Header     | `Authorization: Bearer {apiKey}`     |
| Key format | `sk-proj-...`                        |
| Obtain at  | https://platform.openai.com/api-keys |

## Endpoints

| Action           | Method | URL                                            |
| ---------------- | ------ | ---------------------------------------------- |
| Text-to-Image    | POST   | `https://api.openai.com/v1/images/generations` |
| Image Edit (i2i) | POST   | `https://api.openai.com/v1/images/edits`       |
| Health Check     | GET    | `https://api.openai.com/v1/models`             |

## Request — Text-to-Image

Content-Type: `application/json`

```json
{
  "model": "gpt-image-2",
  "prompt": "A serene mountain landscape at sunset",
  "size": "1024x1024",
  "quality": "auto",
  "background": "auto"
}
```

### Parameters

| Parameter            | Type   | Required | Default | Values                                        |
| -------------------- | ------ | -------- | ------- | --------------------------------------------- |
| `model`              | string | ✅       | —       | `gpt-image-2`                                 |
| `prompt`             | string | ✅       | —       |                                               |
| `size`               | string | ✅       | —       | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `quality`            | string | —        | `auto`  | `auto`, `low`, `medium`, `high`               |
| `background`         | string | —        | `auto`  | `auto`, `opaque`                              |
| `output_format`      | string | —        | `png`   | `png`, `jpeg`, `webp`                         |
| `output_compression` | int    | —        | `100`   | `0-100`                                       |

## Request — Image Edit (with Reference Image)

Content-Type: `multipart/form-data`

| Field                | Type           | Required | Description                                                      |
| -------------------- | -------------- | -------- | ---------------------------------------------------------------- |
| `model`              | string         | ✅       | Model ID                                                         |
| `prompt`             | string         | ✅       | Description                                                      |
| `image` / `image[]`  | file or file[] | ✅       | 官方 edits API 支持一张或多张参考图；GPT Image models 最多 16 张 |
| `size`               | string         | ✅       | Output size                                                      |
| `quality`            | string         | —        | Quality setting                                                  |
| `background`         | string         | —        | Background handling                                              |
| `output_format`      | string         | —        | Output format                                                    |
| `output_compression` | int            | —        | Compression                                                      |

## Response

```json
{
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA..."
    }
  ]
}
```

GPT Image 的 Images API 当前以 `b64_json` 返回为主；当前 adapter 也优先按 base64 处理。

## Image Size Mapping

| Aspect Ratio | OpenAI Size |
| :----------: | :---------: |
|     1:1      |  1024×1024  |
|     16:9     |  1536×1024  |
|     9:16     |  1024×1536  |
|     4:3      |  1536×1024  |
|     3:4      |  1024×1536  |

## Capabilities

- ✅ Text-to-Image
- ✅ Image-to-Image (via edits endpoint, FormData)
- ✅ Multi-turn editing via Responses API
- ✅ Flexible image sizes and high-fidelity image inputs
- ✅ Official snapshots (`gpt-image-2-2026-04-21`)
- ❌ Negative prompt, Guidance scale, Steps, Seed
- ❌ `gpt-image-2` transparent background is not currently supported
- Official edits API: up to 16 source images
- Current PixelVault adapter: up to 16 reference images for `gpt-image-2`

## Error Handling

- HTTP 错误抛出 `ProviderError('OpenAI', statusCode, detail)`
- Response 使用 Zod schema 校验
- 非 JSON 响应 fallback 到 text 错误信息

## Adapter Implementation

`src/services/providers/openai.adapter.ts`

**注意**: 有/无 reference image 走不同的 endpoint 和 content-type：

- 无 reference → `POST /generations` (JSON)
- 有 reference → `POST /edits` (FormData)

## Connection Strategy

> 详细决策矩阵见 [`connection-strategy.md`](connection-strategy.md)。

| 维度                             | 设置                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 区域可达性                       | 海外直连 ✅；国内直连 ❌（被墙，本地国内开发会 `ETIMEDOUT`）                                                                                    |
| 默认 base URL                    | `https://api.openai.com/v1/images`（`AI_PROVIDER_ENDPOINTS.OPENAI`）                                                                            |
| Per-route 覆盖                   | `UserApiKey.providerConfig.baseUrl` —— 适合让单个用户走 SiliconFlow / 自建代理                                                                  |
| 国内中转候选                     | SiliconFlow `https://api.siliconflow.cn/v1/images`（仅兼容部分模型；`gpt-image-2` 本身不在 SiliconFlow，需走 OpenRouter / aihubmix 之类聚合站） |
| 超时                             | adapter 默认走传入的 `timeoutMs`；health check 用 `apiKey.service` 配置                                                                         |
| 重试                             | 5xx + 429 + 网络错误重试；503/504 **不重试**（避免双扣费 + spike 通常长）                                                                       |
| 跨 provider fallback (free tier) | `gpt-image-2 → gemini-3.1-flash-image-preview`                                                                                                  |

国内开发常见错误：本地起 `npm run dev` 时直接调 OpenAI 会 hang —— 走 SiliconFlow 兼容 endpoint 或本地配 `HTTPS_PROXY`（Node 18+ 的 undici 会自动读取）。生产部署在 Vercel 海外节点时**直接用默认 endpoint**，不要绕路。
