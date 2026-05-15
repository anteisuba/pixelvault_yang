# HuggingFace — Inference API

> **Official Docs**: https://huggingface.co/docs/api-inference
> **Last verified**: 2026-03-28

---

## Overview

HuggingFace Inference API，支持社区上托管的扩散模型。
返回格式为 **binary image**（不是 JSON），需转换为 base64。
主要用于开源模型（SDXL、Animagine 等）。

## Authentication

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Header     | `Authorization: Bearer {apiKey}`       |
| Key format | `hf_...`                               |
| Obtain at  | https://huggingface.co/settings/tokens |
| Scope      | Read                                   |

## Endpoints

| Action         | Method | URL                                                           |
| -------------- | ------ | ------------------------------------------------------------- |
| Generate Image | POST   | `https://router.huggingface.co/hf-inference/models/{modelId}` |
| Health Check   | HEAD   | Same URL                                                      |

**Available Model IDs**:

- `cagliostrolab/animagine-xl-4.0` — Anime specialist
- `stabilityai/stable-diffusion-xl-base-1.0` — Classic baseline

## Request

Content-Type: `application/json`

```json
{
  "inputs": "1girl, white hair, blue eyes, detailed, masterpiece",
  "parameters": {
    "width": 1024,
    "height": 1024,
    "negative_prompt": "lowres, bad anatomy",
    "guidance_scale": 7.5,
    "num_inference_steps": 30,
    "seed": 42
  },
  "image": "https://... or base64"
}
```

### Parameters

| Parameter                        | Type   | Required | Default | Range                 |
| -------------------------------- | ------ | -------- | ------- | --------------------- |
| `inputs`                         | string | ✅       | —       | Prompt text           |
| `parameters.width`               | number | ✅       | 1024    |                       |
| `parameters.height`              | number | ✅       | 1024    |                       |
| `parameters.negative_prompt`     | string | —        | —       |                       |
| `parameters.guidance_scale`      | number | —        | 7.5     | 1–20 (step 0.5)       |
| `parameters.num_inference_steps` | number | —        | 30      | 1–50                  |
| `parameters.seed`                | number | —        | random  |                       |
| `image`                          | string | —        | —       | Reference image (i2i) |

### Image-to-Image

当有 reference image 时：

- `image` 字段传入 URL 或 base64
- `strength` 参数由 adapter 处理：`strength = 1 - referenceStrength`（反转逻辑）
- HuggingFace 使用 denoising strength，值越高变化越大

## Response

**二进制图片数据**，不是 JSON。

```
Content-Type: image/png
Body: <raw binary image data>
```

Adapter 将 binary 转为 base64 字符串返回。

## Image Size Mapping

使用 `src/constants/config.ts` 中的 `IMAGE_SIZES` 标准像素尺寸。

| Aspect Ratio | Width | Height |
| :----------: | :---: | :----: |
|     1:1      | 1024  |  1024  |
|     16:9     | 1792  |  1024  |
|     9:16     | 1024  |  1792  |
|     4:3      | 1024  |  768   |
|     3:4      |  768  |  1024  |

## Capabilities

- ✅ Text-to-Image / Image-to-Image
- ✅ Negative prompt, Guidance scale, Steps, Seed
- ✅ Image Analysis
- ❌ Reference strength (使用反转的 denoising strength)
- Max 1 reference image

## Error Handling

- HTTP 错误抛出 `ProviderError('HuggingFace', statusCode, detail)`
- Health check 接受 405 为成功（部分模型不支持 HEAD）
- Binary response 转 base64

## Adapter Implementation

`src/services/providers/huggingface.adapter.ts`

## Connection Strategy

> 详细决策矩阵见 [`connection-strategy.md`](connection-strategy.md)。

| 维度              | 设置                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 区域可达性        | 海外直连 ✅；国内直连 ⚠️（hf.co 可访问，但 inference router 偶发慢）                                                   |
| 默认 base URL     | `https://router.huggingface.co/hf-inference/models`（`AI_PROVIDER_ENDPOINTS.HUGGINGFACE`）                             |
| Per-route 覆盖    | `providerConfig.baseUrl`                                                                                               |
| 国内中转候选      | 暂无成熟的 HF Inference 中转方案；如果国内用户大量遇到 cold start，建议把 SDXL / Animagine 迁到 fal.ai 同模型 endpoint |
| Cold start        | 部分非热门模型首次调用 30–60s 冷启动是正常的                                                                           |
| 超时              | model `timeoutMs` 或 adapter 默认                                                                                      |
| 重试              | 5xx + 429 + 网络错误重试；503/504 不重试                                                                               |
| Health check 容忍 | 405 视为成功                                                                                                           |

**Cold start 现状**：`cagliostrolab/animagine-xl-4.0` 在低峰时段可能要等 40s+ 才返回首张图。这是 HF Inference Provider 的特性，不是 bug。如果用户体验持续不佳，应考虑把这两个模型挪到 fal.ai 托管（fal 的 GPU 池始终暖）。

**`router.huggingface.co` vs 旧 `api-inference.huggingface.co`**：当前用 router endpoint，会自动路由到最佳 inference provider。若调用持续失败，临时降级到 `https://api-inference.huggingface.co/models/{modelId}` 看是否 router 自身故障。
