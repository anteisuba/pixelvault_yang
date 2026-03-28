# VolcEngine (火山方舟) — ARK Image & Video Generation API

> **Official Docs**: https://www.volcengine.com/docs/82379
> **Last verified**: 2026-03-28

---

## Overview

字节跳动火山方舟平台，提供 Doubao Seedream 系列图像模型和 Seedance 系列视频模型。
图像生成走同步 API（OpenAI 兼容格式），视频生成走异步 task queue。
图片输出分辨率为 **2K 级别**（2048×2048 起）。

## Authentication

| Field | Value |
|-------|-------|
| Header | `Authorization: Bearer {apiKey}` |
| Key format | `ark-...` |
| Obtain at | https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey |
| Steps | 火山方舟控制台 → API Key 管理 → Create API Key |

## Endpoints

| Action | Method | URL |
|--------|--------|-----|
| Image Generation | POST | `https://ark.cn-beijing.volces.com/api/v3/images/generations` |
| Video Queue Submit | POST | `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks` |
| Video Queue Status | GET | `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{taskId}` |

## Image Models (Seedream 系列)

| Model ID | Platform Name | Quality | Description |
|----------|---------------|---------|-------------|
| `doubao-seedream-5-0-lite-260128` | Seedream 5.0 Lite | Premium | 最新轻量模型 |
| `doubao-seedream-4-0-250828` | Seedream 4.0 | Standard | 中端模型 |
| `doubao-seedream-3-0-t2i-250415` | Seedream 3.0 | Budget | 入门模型 |

## Video Models (Seedance 系列)

| Model ID | Platform Name | Quality | Features |
|----------|---------------|---------|----------|
| `doubao-seedance-1-5-pro` | Seedance 1.5 Pro | Premium | 原生音频 + 首尾帧 |
| `doubao-seedance-1-0-pro-250528` | Seedance 1.0 Pro | Standard | 首尾帧 |

## Request — Image Generation

Content-Type: `application/json`

```json
{
  "model": "doubao-seedream-5-0-lite-260128",
  "prompt": "一只橘猫坐在窗台上看落日",
  "size": "2048x2048",
  "response_format": "url",
  "watermark": false,
  "n": 1,
  "stream": false,
  "seed": 42,
  "guidance_scale": 8.0,
  "image": "https://..."
}
```

### Image Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | ✅ | — | Model ID |
| `prompt` | string | ✅ | — | |
| `size` | string | ✅ | — | See mapping below |
| `response_format` | string | — | `url` | Always `url` |
| `watermark` | boolean | — | `false` | 是否加水印 |
| `n` | number | — | 1 | 固定为 1 |
| `stream` | boolean | — | `false` | 固定为 false |
| `seed` | number | — | random | |
| `guidance_scale` | number | — | 8.0 | 1–10 (step 0.5) |
| `image` | string/string[] | — | — | Reference image URL(s) |

### Multi-Reference Image

`image` 字段支持数组格式，最多 10 张：

```json
{
  "image": [
    "https://cdn.example.com/ref1.png",
    "https://cdn.example.com/ref2.png"
  ]
}
```

## Response — Image

```json
{
  "data": [
    {
      "url": "https://ark-project.tos-cn-beijing.volces.com/...",
      "size": "2048x2048"
    }
  ]
}
```

## Image Size Mapping (2K-tier)

| Aspect Ratio | Size |
|:---:|:---:|
| 1:1 | 2048×2048 |
| 16:9 | 2560×1440 |
| 9:16 | 1440×2560 |
| 4:3 | 2304×1728 |
| 3:4 | 1728×2304 |

**注意**: VolcEngine 输出分辨率比其他 provider 高一倍（2K vs 1K）。

## Request — Video Queue Submit

Content-Type: `application/json`

```json
{
  "model": "doubao-seedance-1-5-pro",
  "content": [
    {
      "type": "text",
      "text": "A bird flying over the ocean at sunset"
    },
    {
      "type": "image_url",
      "image_url": { "url": "https://..." },
      "role": "first_frame"
    }
  ],
  "ratio": "16:9",
  "duration": 5,
  "resolution": "1080p",
  "generate_audio": true,
  "return_last_frame": true,
  "watermark": false
}
```

### Video Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | ✅ | Model ID |
| `content` | array | ✅ | Text + optional image content |
| `content[].type` | string | ✅ | `text` or `image_url` |
| `content[].text` | string | — | Prompt (when type=text) |
| `content[].image_url.url` | string | — | First frame URL (when type=image_url) |
| `content[].role` | string | — | `first_frame` |
| `ratio` | string | — | `16:9`, `9:16`, `1:1` |
| `duration` | number | — | 2–12 seconds |
| `resolution` | string | — | `720p`, `1080p` |
| `generate_audio` | boolean | — | 是否生成音频 |
| `return_last_frame` | boolean | — | 是否返回最后一帧（用于续接） |
| `watermark` | boolean | — | 是否加水印 |

## Response — Video Queue

### Submit Response
```json
{
  "id": "task-abc-123"
}
```

### Status Response
```json
{
  "id": "task-abc-123",
  "status": "running",
  "content": [
    {
      "type": "video_url",
      "video_url": { "url": "https://..." }
    },
    {
      "type": "image_url",
      "image_url": { "url": "https://..." }
    }
  ],
  "error": null,
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200
  }
}
```

### Status Values

| VolcEngine Status | Mapped Status | Meaning |
|:-:|:-:|:-:|
| `queued` | `IN_QUEUE` | 排队中 |
| `running` | `IN_PROGRESS` | 生成中 |
| `succeeded` | `COMPLETED` | 成功 |
| `failed` | `FAILED` | 失败 |
| `expired` | `FAILED` | 过期 |

## Capabilities

- ✅ Text-to-Image (同步)
- ✅ Multi-reference images（最多 10 张）
- ✅ Seed, Guidance scale
- ✅ Video generation (异步 queue)
- ✅ Image-to-Video (first frame)
- ✅ Audio generation (Seedance 1.5)
- ✅ Last frame return（用于视频续接）
- ✅ Image Analysis
- ❌ Negative prompt, Steps, Ref strength

## Pricing Model

基于 token 计费：
- `usage.prompt_tokens` — 输入 tokens
- `usage.completion_tokens` — 输出 tokens

## Error Handling

- HTTP 错误抛出 `ProviderError('VolcEngine', statusCode, detail)`
- 视频 URL 提取失败时返回友好错误
- VolcEngine 状态映射到统一状态枚举
- API 返回详细错误信息

## Adapter Implementation

`src/services/providers/volcengine.adapter.ts`

**特殊点**:
- 图像 API 格式与 OpenAI 高度兼容（`/images/generations`）
- 视频 API 使用独立的 task-based 异步系统
- 输出分辨率 2K 级别
- `watermark: false` 默认关闭水印
- `return_last_frame: true` 用于视频续接场景
