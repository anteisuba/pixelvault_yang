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
