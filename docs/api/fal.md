# fal.ai — Unified Image & Video Generation API

> **Official Docs**: https://fal.ai/docs
> **Last verified**: 2026-03-28

---

## Overview

fal.ai 是本项目模型最多的 provider，托管了 FLUX、Seedream、Ideogram、Recraft、SD 等图像模型，
以及 Kling、Veo、Seedance、MiniMax、Luma、Pika、Wan、Hunyuan、Runway 等视频模型。
图像生成走同步 API，视频生成走异步 queue API。

## Authentication

| Field | Value |
|-------|-------|
| Header | `Authorization: Key {apiKey}` |
| Key format | `fal_...` |
| Obtain at | https://fal.ai/dashboard/keys |

**注意**: fal 使用 `Key` 前缀，不是 `Bearer`。

## Endpoints

| Action | Method | URL |
|--------|--------|-----|
| Image Generation | POST | `https://fal.run/{modelId}` |
| Video Generation (sync) | POST | `https://fal.run/{modelId}` |
| Video Queue Submit | POST | `https://queue.fal.run/{modelId}` |
| Video Queue Status | GET | `{statusUrl}` (返回值中提供) |
| Video Queue Result | GET | `{responseUrl}` (返回值中提供) |
| Health Check | HEAD | `https://fal.run/{modelId}` |

## Image Models

| Model ID | Platform Name | Quality |
|----------|---------------|---------|
| `fal-ai/flux-2-pro/v1.1` | FLUX 2 Pro | Premium |
| `fal-ai/bytedance/seedream/v4.5/text-to-image` | Seedream 4.5 | Premium |
| `fal-ai/ideogram/v3` | Ideogram 3 | Premium |
| `fal-ai/recraft/v3/text-to-image` | Recraft V3 | Premium |
| `fal-ai/flux-2-dev` | FLUX 2 Dev | Standard |
| `fal-ai/stable-diffusion-v35-large` | SD 3.5 Large | Standard |
| `fal-ai/flux/schnell` | FLUX Schnell | Budget |

## Video Models

| T2V Model ID | I2V Model ID | Name | Quality |
|--------------|-------------|------|---------|
| `fal-ai/kling-video/v3/pro/text-to-video` | `fal-ai/kling-video/v3/pro/image-to-video` | Kling V3 Pro | Premium |
| `fal-ai/veo3.1` | `fal-ai/veo3.1/reference-to-video` | Veo 3.1 | Premium |
| `fal-ai/bytedance/seedance/v1/pro/text-to-video` | `.../image-to-video` | Seedance Pro | Standard |
| `fal-ai/minimax/hailuo-2.3/standard/text-to-video` | `.../image-to-video` | MiniMax Hailuo 2.3 | Standard |
| `fal-ai/luma-dream-machine/ray-2` | — | Luma Ray 2 | Standard |
| `fal-ai/pika/v2.5/text-to-video` | `.../image-to-video` | Pika V2.5 | Standard |
| `fal-ai/kling-video/v2.1/master/text-to-video` | `.../image-to-video` | Kling V2.1 | Standard |
| `fal-ai/runway-gen3/turbo/image-to-video` | — | Runway Gen-3 | Standard |
| `wan/v2.6/text-to-video` | `wan/v2.6/image-to-video` | Wan V2.6 | Budget |
| `fal-ai/hunyuan-video` | `fal-ai/hunyuan-video-image-to-video` | Hunyuan Video | Budget |

## Request — Image Generation

```json
{
  "prompt": "A futuristic cityscape at night",
  "image_size": "square_hd",
  "num_images": 1,
  "negative_prompt": "blurry, low quality",
  "guidance_scale": 3.5,
  "num_inference_steps": 28,
  "seed": 42,
  "image_url": "https://...",
  "strength": 0.3
}
```

### Image Parameters

| Parameter | Type | Required | Default | Range |
|-----------|------|----------|---------|-------|
| `prompt` | string | ✅ | — | |
| `image_size` | string | ✅ | — | See mapping below |
| `num_images` | number | — | 1 | |
| `negative_prompt` | string | — | — | |
| `guidance_scale` | number | — | 3.5 | 1–20 (step 0.5) |
| `num_inference_steps` | number | — | 28 | 1–50 |
| `seed` | number | — | random | |
| `image_url` | string | — | — | Reference image URL |
| `strength` | number | — | 0.7 | 0.01–0.99 (ref image strength) |

### Image Size Mapping

| Aspect Ratio | fal Size String |
|:---:|:---:|
| 1:1 | `square_hd` |
| 16:9 | `landscape_16_9` |
| 9:16 | `portrait_16_9` |
| 4:3 | `landscape_4_3` |
| 3:4 | `portrait_4_3` |

## Response — Image

```json
{
  "images": [
    {
      "url": "https://fal.media/files/...",
      "width": 1024,
      "height": 1024,
      "content_type": "image/png"
    }
  ]
}
```

## Request — Video Queue Submit

```json
{
  "prompt": "A bird flying over the ocean",
  "aspect_ratio": "16:9",
  "duration": "5",
  "image_url": "https://...",
  "negative_prompt": "blur, distort",
  "cfg_scale": 0.5,
  "prompt_optimizer": true,
  "generate_audio": true,
  "resolution": "1080p"
}
```

### Video Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | ✅ | |
| `aspect_ratio` | string | — | `16:9`, `9:16`, `1:1` etc. |
| `duration` | string | — | Duration in seconds (string) |
| `image_url` | string | — | First frame (I2V) |
| `negative_prompt` | string | — | Model-specific |
| `cfg_scale` | number | — | Model-specific |
| `prompt_optimizer` | boolean | — | MiniMax specific |
| `generate_audio` | boolean | — | Kling, Veo specific |
| `resolution` | string | — | `720p`, `1080p` |

**注意**: 不同视频模型的参数支持不同，由 `ModelOption.videoDefaults` 配置。

## Response — Video Queue

### Submit Response
```json
{
  "request_id": "abc-123",
  "status_url": "https://queue.fal.run/.../status",
  "response_url": "https://queue.fal.run/.../response"
}
```

### Status Response
```json
{
  "status": "IN_QUEUE"  // or "IN_PROGRESS", "COMPLETED"
}
```

### Result Response (when COMPLETED)
```json
{
  "video": {
    "url": "https://fal.media/files/...",
    "width": 1920,
    "height": 1080,
    "content_type": "video/mp4"
  },
  "thumbnail": {
    "url": "https://fal.media/files/..."
  }
}
```

## Capabilities

- ✅ Text-to-Image / Image-to-Image
- ✅ Negative prompt, Guidance scale, Steps, Seed
- ✅ Reference image with strength control
- ✅ Video generation (sync + async queue)
- ✅ Image-to-Video (model-specific I2V endpoints)
- ✅ Image Analysis
- Max 1 reference image (image models)

## Queue Polling

- 轮询 `statusUrl` 获取状态
- COMPLETED 后请求 `responseUrl` 获取结果
- 默认超时: 180s（部分模型 300s）
- 状态值: `IN_QUEUE` → `IN_PROGRESS` → `COMPLETED`

## Error Handling

- HTTP 错误抛出 `ProviderError('fal', statusCode, detail)`
- Health check 接受 405 / 422 为成功（部分模型不支持 HEAD）
- 缺失 image/video 数据时返回友好错误

## Adapter Implementation

`src/services/providers/fal.adapter.ts`
