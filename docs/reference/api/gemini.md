# Google Gemini — Image Generation API

> **Official Docs**: https://ai.google.dev/gemini-api/docs/image-generation
> **Last verified**: 2026-03-28

---

## Overview

Gemini 通过 multimodal `generateContent` 端点生成图像。
支持最多 14 张 reference image，利用 Gemini 的多模态推理能力。
没有传统扩散模型参数（无 guidance_scale/steps/seed），全靠 prompt 控制。

## Authentication

| Field      | Value                              |
| ---------- | ---------------------------------- |
| Header     | `x-goog-api-key: {apiKey}`         |
| Key format | `AIza...`                          |
| Obtain at  | https://aistudio.google.com/apikey |

## Endpoints

| Action       | Method | URL                                                                                 |
| ------------ | ------ | ----------------------------------------------------------------------------------- |
| Generate     | POST   | `https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent` |
| Health Check | GET    | Same base URL                                                                       |

**Available Model IDs**:

- `gemini-2.5-flash-image` — Stable, fast / efficient image generation and editing
- `gemini-3-pro-image-preview` — Preview, advanced reasoning and production-grade image work
- `gemini-3.1-flash-image-preview` — Preview, faster high-volume image generation

## Request

Content-Type: `application/json`

```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "A cat wearing a top hat, oil painting style"
        },
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "<base64-encoded-image>"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "1:1"
    }
  }
}
```

### Parameters

| Parameter                                  | Type     | Required | Description                         |
| ------------------------------------------ | -------- | -------- | ----------------------------------- |
| `contents[].parts[].text`                  | string   | ✅       | Prompt text                         |
| `contents[].parts[].inlineData`            | object   | —        | Reference image (base64 + mimeType) |
| `generationConfig.responseModalities`      | string[] | ✅       | Must include `"IMAGE"`              |
| `generationConfig.imageConfig.aspectRatio` | string   | ✅       | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |

### Reference Image Format

每张 reference image 作为一个 `inlineData` part 添加到 `parts[]` 数组中：

```json
{
  "inlineData": {
    "mimeType": "image/png",
    "data": "iVBORw0KGgoAAAANSUhEUg..."
  }
}
```

- 支持 data URL、HTTPS URL（adapter 自动下载转 base64）、raw base64
- **最多 14 张** reference images

## Response

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUg..."
            }
          }
        ]
      }
    }
  ]
}
```

图片在 `candidates[0].content.parts[]` 中，以 `inlineData` 形式返回 base64。

## Capabilities

- ✅ Text-to-Image
- ✅ Multi-reference images（最多 14 张）
- ✅ Image Analysis (reverse engineering)
- ❌ Negative prompt, Guidance scale, Steps, Seed, Ref strength
- Aspect ratio 通过 `imageConfig` 控制

## Aspect Ratio

Gemini 直接使用字符串 aspect ratio（`1:1`, `16:9` 等），不需要转换为像素尺寸。

## Error Handling

- HTTP 错误抛出 `ProviderError('Gemini', statusCode, detail)`
- Response 使用 Zod schema 校验
- 缺失图片数据时返回友好错误信息

## Adapter Implementation

`src/services/providers/gemini.adapter.ts`

**特殊逻辑**:

- Reference images 可同时处理 data URL 和 HTTPS URL
- 自动提取 MIME type 和 base64 数据
- `responseModalities` 必须包含 `"TEXT"` 和 `"IMAGE"` 才能获取图像输出
