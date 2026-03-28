# OpenAI — gpt-image API

> **Official Docs**: https://platform.openai.com/docs/models#gpt-image
> **Last verified**: 2026-03-28

---

## Overview

OpenAI 的图像生成 API，支持 text-to-image 和 image-to-image（通过 edits 端点）。
以 quality/background/style 三个高级参数代替传统的 guidance_scale/steps。

## Authentication

| Field | Value |
|-------|-------|
| Header | `Authorization: Bearer {apiKey}` |
| Key format | `sk-proj-...` |
| Obtain at | https://platform.openai.com/api-keys |

## Endpoints

| Action | Method | URL |
|--------|--------|-----|
| Text-to-Image | POST | `https://api.openai.com/v1/images/generations` |
| Image Edit (i2i) | POST | `https://api.openai.com/v1/images/edits` |
| Health Check | GET | `https://api.openai.com/v1/models` |

## Request — Text-to-Image

Content-Type: `application/json`

```json
{
  "model": "gpt-image-1.5",
  "prompt": "A serene mountain landscape at sunset",
  "size": "1024x1024",
  "quality": "auto",
  "background": "auto",
  "style": "vivid"
}
```

### Parameters

| Parameter | Type | Required | Default | Values |
|-----------|------|----------|---------|--------|
| `model` | string | ✅ | — | `gpt-image-1.5` |
| `prompt` | string | ✅ | — | |
| `size` | string | ✅ | — | `1024x1024`, `1536x1024`, `1024x1536` |
| `quality` | string | — | `auto` | `auto`, `low`, `medium`, `high` |
| `background` | string | — | `auto` | `auto`, `transparent`, `opaque` |
| `style` | string | — | `vivid` | `vivid`, `natural` |

## Request — Image Edit (with Reference Image)

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | ✅ | Model ID |
| `prompt` | string | ✅ | Description |
| `image` | file | ✅ | Reference image (binary) |
| `size` | string | ✅ | Output size |
| `quality` | string | — | Quality setting |
| `background` | string | — | Background handling |
| `style` | string | — | Style preference |

## Response

```json
{
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA...",
      "url": "https://..."
    }
  ]
}
```

图片通过 `b64_json`（优先）或 `url` 返回。

## Image Size Mapping

| Aspect Ratio | OpenAI Size |
|:---:|:---:|
| 1:1 | 1024×1024 |
| 16:9 | 1536×1024 |
| 9:16 | 1024×1536 |
| 4:3 | 1536×1024 |
| 3:4 | 1024×1536 |

## Capabilities

- ✅ Text-to-Image
- ✅ Image-to-Image (via edits endpoint, FormData)
- ✅ Quality / Background / Style control
- ✅ Image Analysis (reverse engineering)
- ❌ Negative prompt, Guidance scale, Steps, Seed
- Max 1 reference image

## Error Handling

- HTTP 错误抛出 `ProviderError('OpenAI', statusCode, detail)`
- Response 使用 Zod schema 校验
- 非 JSON 响应 fallback 到 text 错误信息

## Adapter Implementation

`src/services/providers/openai.adapter.ts`

**注意**: 有/无 reference image 走不同的 endpoint 和 content-type：
- 无 reference → `POST /generations` (JSON)
- 有 reference → `POST /edits` (FormData)
