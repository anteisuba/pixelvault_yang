# NovelAI — Image Generation API

> **Official Docs**: https://docs.novelai.net/en/image/models
> **Last verified**: 2026-03-28

---

## Overview

NovelAI 是 anime/illustration 领域的专业 API，有独特的 V4/V4.5 character prompt 系统。
支持多张 reference image 用于角色一致性（依赖订阅等级）。
响应格式为 **ZIP 文件**（内含 PNG），需自行解压。

## Authentication

| Field      | Value                                                                 |
| ---------- | --------------------------------------------------------------------- |
| Header     | `Authorization: Bearer {apiKey}`                                      |
| Key format | `pst-...`                                                             |
| Obtain at  | https://novelai.net/ → User Settings → Account → Persistent API Token |

## Endpoints

| Action            | Method | URL                                           |
| ----------------- | ------ | --------------------------------------------- |
| Generate Image    | POST   | `https://image.novelai.net/ai/generate-image` |
| Subscription Info | GET    | `https://api.novelai.net/user/subscription`   |
| Health Check      | GET    | Same as subscription                          |

## Models

| Model ID                          | Version | Quality  | Description              |
| --------------------------------- | ------- | -------- | ------------------------ |
| `nai-diffusion-4-5-full`          | V4.5    | Premium  | 最新 anime 模型          |
| `nai-diffusion-4-5-curated`       | V4.5    | Premium  | Curated 数据集，更易控制 |
| `nai-diffusion-4-full`            | V4      | Standard | 上一代模型               |
| `nai-diffusion-4-curated-preview` | V4      | Standard | V4 curated               |
| `nai-diffusion-3`                 | V3      | Budget   | SDXL-based               |

## Request

Content-Type: `application/json`

### Basic Request (V3 / 非 V4 模型)

```json
{
  "input": "1girl, white hair, blue eyes, detailed",
  "model": "nai-diffusion-3",
  "action": "generate",
  "parameters": {
    "params_version": 1,
    "width": 1024,
    "height": 1024,
    "scale": 5.0,
    "sampler": "k_euler_ancestral",
    "steps": 28,
    "seed": 42,
    "n_samples": 1,
    "ucPreset": 3,
    "negative_prompt": "lowres, bad anatomy, bad hands"
  }
}
```

### V4/V4.5 Request (with structured prompts)

```json
{
  "input": "scene description",
  "model": "nai-diffusion-4-5-full",
  "action": "generate",
  "parameters": {
    "params_version": 3,
    "width": 1024,
    "height": 1024,
    "scale": 5.0,
    "sampler": "k_euler_ancestral",
    "steps": 28,
    "seed": 42,
    "n_samples": 1,
    "ucPreset": 4,
    "negative_prompt": "lowres, bad anatomy",
    "v4_prompt": {
      "caption": {
        "base_caption": "scene description",
        "char_captions": [
          {
            "char_caption": "character description",
            "centers": [{ "x": 0.5, "y": 0.5 }]
          }
        ]
      },
      "use_coords": false,
      "use_order": true
    },
    "v4_negative_prompt": {
      "caption": {
        "base_caption": "lowres, bad anatomy",
        "char_captions": [
          {
            "char_caption": "lowres",
            "centers": [{ "x": 0.5, "y": 0.5 }]
          }
        ]
      }
    },
    "characterPrompts": [
      {
        "prompt": { "base_caption": "character description" },
        "uc": { "base_caption": "lowres" }
      }
    ]
  }
}
```

### Image-to-Image Request

```json
{
  "input": "prompt",
  "model": "nai-diffusion-4-5-full",
  "action": "img2img",
  "parameters": {
    "...": "same as above",
    "image": "<base64-encoded-image>",
    "strength": 0.7
  }
}
```

### Multi-Reference Request

```json
{
  "parameters": {
    "...": "same as above",
    "reference_image_multiple": ["<base64>", "<base64>"],
    "reference_information_extracted_multiple": [1.0, 1.0],
    "reference_strength_multiple": [0.6, 0.6]
  }
}
```

### Parameters

| Parameter                    | Type   | Required | Default             | Description             |
| ---------------------------- | ------ | -------- | ------------------- | ----------------------- |
| `input`                      | string | ✅       | —                   | Prompt text             |
| `model`                      | string | ✅       | —                   | Model ID                |
| `action`                     | string | ✅       | `generate`          | `generate` or `img2img` |
| `parameters.params_version`  | number | ✅       | —                   | 1 (V3) or 3 (V4/V4.5)   |
| `parameters.width`           | number | ✅       | —                   |                         |
| `parameters.height`          | number | ✅       | —                   |                         |
| `parameters.scale`           | number | —        | 5.0                 | Guidance scale (1–20)   |
| `parameters.sampler`         | string | —        | `k_euler_ancestral` |                         |
| `parameters.steps`           | number | —        | 28                  | 1–50                    |
| `parameters.seed`            | number | —        | random              |                         |
| `parameters.n_samples`       | number | —        | 1                   | Always 1                |
| `parameters.ucPreset`        | number | —        | —                   | 3 (V3) or 4 (V4/V4.5)   |
| `parameters.negative_prompt` | string | —        | —                   |                         |
| `parameters.image`           | string | —        | —                   | Base64, for img2img     |
| `parameters.strength`        | number | —        | —                   | 0–1, for img2img        |

## Response

**ZIP 文件**，内含一张 PNG 图片。

```
Content-Type: application/zip
Body: <ZIP binary data containing PNG>
```

Adapter 内置 ZIP 解析器（无需外部依赖）：

- 检测压缩方式（uncompressed / deflate）
- 查找 central directory signature
- 提取第一个文件的数据

## Image Size Mapping

| Aspect Ratio | Width | Height |
| :----------: | :---: | :----: |
|     1:1      | 1024  |  1024  |
|     16:9     | 1216  |  832   |
|     9:16     |  832  |  1216  |
|     4:3      | 1024  |  768   |
|     3:4      |  768  |  1024  |

**注意**: NovelAI 的尺寸与通用 IMAGE_SIZES 不同，adapter 内有独立映射。

## Character Prompt System (V4.5)

NovelAI V4.5 支持 character prompt 语法：

```
[Character 1: Alice]
blonde hair, blue eyes, school uniform

[Character 2: Bob]
black hair, glasses, suit

Two people walking in a park
```

Adapter 解析流程：

1. 用正则匹配 `[Character N: name]` 标记
2. 提取每个角色的描述
3. 最后的文本作为 scene prompt（`base_caption`）
4. 每个角色映射到 `char_captions` 和对应的 reference image

## Multi-Reference Image (订阅等级限制)

| Subscription Tier | Max Reference Images |
| :---------------: | :------------------: |
|        < 3        |          1           |
|        ≥ 3        | 多张（由 tier 决定） |

Adapter 行为：

1. 调用 `/user/subscription` 获取用户 tier
2. Tier < 3 时降级为单张 reference（graceful degradation）
3. Tier ≥ 3 时按数量上限使用
4. 网络错误时默认允许 1 张

## Capabilities

- ✅ Text-to-Image / Image-to-Image
- ✅ Negative prompt, Guidance scale, Steps, Seed
- ✅ Reference strength
- ✅ Multi-reference images (tier-dependent)
- ✅ V4.5 Character prompt system
- ❌ Image Analysis (不支持逆向工程)

## Error Handling

- HTTP 错误抛出 `ProviderError('NovelAI', statusCode, detail)`
- 429 错误：Arena 并发场景有指数退避重试
- 403 + multi-reference：映射为 `NOVELAI_TIER_LIMIT` 错误码（i18n 支持）
- ZIP 解析失败时返回详细错误信息
- Subscription check 网络错误时 graceful fallback

## Adapter Implementation

`src/services/providers/novelai.adapter.ts`

**复杂度最高的 adapter**，包含：

- V3 / V4 / V4.5 三种模型的不同参数构建
- Character prompt 解析器
- ZIP 解析器
- Subscription tier 检测
- Image URL → base64 转换
- Multi-reference image 映射逻辑
